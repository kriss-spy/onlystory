# Blue Archive downloadability audit

This records the audit before the all-BA downloader was implemented. The
[download recipe guide](ba-download-recipes.md) describes the current importer;
[verification evidence](ba-download-verification.json) separates exhaustive
compiler and asset checks from app playback checks.

Checked 2026-10-19T13:45:21.831Z. This covers all 1,659 currently cataloged available JP stories from pinned game build 1.73.459696.

The complete library cannot currently be downloaded by a new release user without an Onlystory asset backend. The sources are reachable, but the app only implements original-file acquisition and conversion for the prologue, `ba-jp-11000`.

| Environment              | Current result                                                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static web app           | Official originals are blocked by CORS. The prologue can be imported from files the user downloads separately. Other stories have no production importer. |
| Windows standalone       | The prologue has a native downloader and browser conversion recipe. The other 1,658 stories have no implemented downloader.                               |
| Local development server | All 15,624 unique declared asset paths exist locally. This server supplies prepared exports; it does not demonstrate production acquisition.              |

## Exhaustive checks

The audit enumerated every story's declared inventory, 162,836 references in total. There are 0 missing files. All 5,670 unique exported-media files match their manifests' byte sizes. This audit did not rehash or play every local file.

Every recorded original endpoint was probed with a one-byte HTTP Range GET and an Origin header, using eight concurrent requests. The 2,835 official URLs include MediaResources, Android packs, Windows HD packs/catalog and the story database. 2,835 returned HTTP 206, with 0 size mismatches. 2,821 matched recorded expected lengths; 14 lack a pinned expected length in the inspected provenance. 2,835 omit Access-Control-Allow-Origin.

Ordinary Chrome 155.0.8059.82 with normal CORS enforcement tested one official URL from each of the four source families from the live development origin. All four official families failed browser fetch. The pinned GitHub script was browser-readable; the sampled community effect texture timed out after 30 seconds, so its current browser access remains unresolved. All seven small non-official prologue originals, the script/name tables and community effect textures, were downloaded in full outside the browser and matched their recorded SHA-256 and size.

## Work still needed

All-story native acquisition requires recipes for the remaining stories, including pinned text/database decoding, dependency selection, Unity bundle extraction, media conversion and some movie conversion. Native fetching avoids browser CORS, but does not supply these missing recipes. The prologue recipe covers 156 originals, 120,245,302 bytes, and 232 generated outputs.

These probes establish endpoint access and reported length. They do not establish full-body integrity of every official source, successful extraction, fresh installation on a new machine, or per-story offline playback. This is coverage of the current pinned library, not a claim about the latest JP release. Existing imported presentation limits remain documented in [the pipeline notes](blue-archive-pipeline.md).

The [machine-readable summary](ba-downloadability-audit.json) records evidence hashes. Detailed per-URL and per-story evidence remains under `.cache/other-game-download-audit/ba/`, with the audit and full-body-check scripts beside it. No application code or release binaries were changed.
