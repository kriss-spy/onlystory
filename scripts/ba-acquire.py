"""Download only referenced JP assets for explicit story groups, with a size budget."""

import argparse
import concurrent.futures
import json
import sys
import threading
import time
import urllib.request
import zlib
from dataclasses import asdict
from pathlib import Path

from ba_asset_plan import plan

parser = argparse.ArgumentParser()
parser.add_argument("--groups", default="11000")
parser.add_argument("--definitions")
parser.add_argument("--asset-paths", default="")
parser.add_argument("--plan-output")
parser.add_argument("--audit", action="store_true")
parser.add_argument("--plan-only", action="store_true")
parser.add_argument("--max-mb", type=int, default=1500)
args = parser.parse_args()

ROOT = Path(__file__).resolve().parents[1]
workspace = ROOT / ".cache/ba-jp-assets"
cache = ROOT / ".cache/ba-jp-catalog.json"
if not cache.exists():
    from ba_downloader.bootstrap.container import ExecutionScope
    from ba_downloader.domain.models.execution import ExecutionContext
    from ba_downloader.domain.models.workspace import WorkspaceLayout

    context = ExecutionContext(
        region="jp",
        platform="android",
        workspace=WorkspaceLayout.create(workspace, "jp", "android"),
    )
    with ExecutionScope(context) as scope:
        catalog = scope.provider().load_catalog(context)
        cache.write_text(
            json.dumps(
                {
                    "version": catalog.context.resource_version,
                    "assets": [asdict(a) for a in catalog.resources],
                }
            ),
            encoding="utf8",
        )
catalog = json.loads(cache.read_text(encoding="utf8"))
groups = (
    [
        int(d["group"])
        for d in json.loads(Path(args.definitions).read_text(encoding="utf8"))
    ]
    if args.definitions
    else [int(g) for g in args.groups.split(",")]
)
selected_by_path = {}
errors = []
for group in groups:
    try:
        resources, _ = plan(catalog, group)
        selected_by_path.update({a["path"]: a for a in resources})
    except Exception as error:
        if not args.audit:
            raise
        errors.append({"group": group, "error": str(error)})
for path in filter(None, args.asset_paths.split(",")):
    asset = next((a for a in catalog["assets"] if a["path"] == path), None)
    if asset is None:
        raise ValueError(f"Explicit resource is absent from catalog: {path}")
    selected_by_path[path] = asset
selected = list(selected_by_path.values())
total = sum(a["size"] for a in selected)
missing_bytes = 0
for asset in selected:
    target = (
        workspace
        / "jp/android/raw"
        / {"media": "media", "bundle": "bundles"}[asset["asset_type"]]
        / asset["path"].split("/", 1)[1]
    )
    if not target.exists() or target.stat().st_size != asset["size"]:
        missing_bytes += asset["size"]
report = {
    "gameVersion": catalog["version"],
    "groups": len(groups),
    "resources": len(selected),
    "totalBytes": total,
    "missingBytes": missing_bytes,
    "errors": errors,
    "assets": [{"path": a["path"], "bytes": a["size"]} for a in selected],
}
if args.plan_output:
    Path(args.plan_output).write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf8"
    )
print(
    f"Selected {len(selected)} resources, {total / 1024**2:.1f} MiB total / {missing_bytes / 1024**2:.1f} MiB missing for {len(groups)} groups; {len(errors)} unsupported groups",
    flush=True,
)
if errors:
    print(json.dumps(errors[:20], ensure_ascii=False, indent=2))
    if not args.plan_only:
        raise ValueError(
            "Refusing incomplete acquisition plan: resolve all source references first"
        )
if total > args.max_mb * 1024**2:
    raise ValueError(f"Resource plan exceeds explicit {args.max_mb} MiB limit")
if args.plan_only:
    if not args.plan_output:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(0)


_HTTP_SLOTS = threading.Semaphore(8)


def ranged_payload(asset, target):
    part_size = 2 * 1024 * 1024
    root = (
        workspace
        / ".download-ranges"
        / (str(asset["checksum"]["value"]) + "-" + str(asset["size"]))
    )
    root.mkdir(parents=True, exist_ok=True)

    def get_part(start):
        end = min(start + part_size, asset["size"]) - 1
        path = root / (str(start) + ".part")
        if path.exists() and path.stat().st_size == end - start + 1:
            return path
        request = urllib.request.Request(
            asset["url"], headers={"Range": f"bytes={start}-{end}"}
        )
        for attempt in range(3):
            try:
                with (
                    _HTTP_SLOTS,
                    urllib.request.urlopen(request, timeout=60) as response,
                ):
                    if (
                        response.status != 206
                        or response.headers.get("Content-Range")
                        != f"bytes {start}-{end}/{asset['size']}"
                    ):
                        raise ValueError(
                            "Official server did not honor the requested byte range"
                        )
                    data = response.read()
                if len(data) != end - start + 1:
                    raise ValueError("Incomplete official resource byte range")
                path.write_bytes(data)
                return path
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(attempt + 1)

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        parts = list(pool.map(get_part, range(0, asset["size"], part_size)))
    data = b"".join(p.read_bytes() for p in parts)
    if len(data) != asset["size"] or zlib.crc32(data) != int(
        asset["checksum"]["value"]
    ):
        raise ValueError(
            "Assembled official resource failed catalog CRC/size validation"
        )
    partial = target.with_suffix(target.suffix + ".partial")
    partial.write_bytes(data)
    partial.replace(target)
    for path in parts:
        path.unlink()
    root.rmdir()
    return len(data)


def download(asset):
    target = (
        workspace
        / "jp/android/raw"
        / {"media": "media", "bundle": "bundles"}[asset["asset_type"]]
        / asset["path"].split("/", 1)[1]
    )

    def valid(data):
        return len(data) == asset["size"] and zlib.crc32(data) == int(
            asset["checksum"]["value"]
        )

    if target.exists() and valid(target.read_bytes()):
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(5):
        try:
            if asset["size"] >= 8 * 1024 * 1024:
                count = ranged_payload(asset, target)
                print(
                    f"Verified {asset['path']} ({count / 1024**2:.1f} MiB, ranged)",
                    flush=True,
                )
                return
            partial = target.with_suffix(target.suffix + ".partial")
            started = time.monotonic()
            with (
                _HTTP_SLOTS,
                urllib.request.urlopen(asset["url"], timeout=120) as response,
                partial.open("wb") as output,
            ):
                while chunk := response.read(8192):
                    output.write(chunk)
                    if time.monotonic() - started > 300:
                        raise TimeoutError(
                            "Resource exceeded five minute transfer limit"
                        )
            data = partial.read_bytes()
            if not valid(data):
                raise ValueError(f"CRC/size mismatch: {asset['path']}")
            partial.replace(target)
            print(
                f"Verified {asset['path']} ({len(data) / 1024**2:.1f} MiB)", flush=True
            )
            return
        except Exception as error:
            print(
                f"Retry {attempt + 1}/5 for {asset['path']}: {error}",
                file=sys.stderr,
                flush=True,
            )
            if attempt == 4:
                raise
            time.sleep(2**attempt)


with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    list(pool.map(download, selected))
print(f"Verified {len(selected)} selected resources for JP {catalog['version']}")
