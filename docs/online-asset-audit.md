# Existing assets: online availability audit

Checked 2026-10-19. Scope: the existing local library and its recorded sources, with direct acquisition by an ordinary web app and no Onlystory asset server.

The whole library cannot currently be promised as a direct browser download. Online source availability, browser permission to read the source, and reproduction of the local exported asset are separate checks.

| Game  | Online source finding                                                                | Direct web-app status                                                                       |
| ----- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| PJSK  | All 151,576 recorded source URLs accounted for                                       | One chapter verified through complete download and offline playback; broader recipes remain |
| BA JP | All 2,835 recorded official source URLs respond                                      | Representative browser downloads blocked by CORS                                            |
| GFL1  | All 2,253 original script texts match public archive content; media coverage partial | Full acquisition and conversion unverified                                                  |
| GFL2  | Reachable model mirror; complete non-model sources unestablished                     | Full acquisition unverified                                                                 |

## Project SEKAI

The inventory combines `.cache/pjsk/library/private/pjsk/sources.json`, `deferred.json`, and source records in all 1,627 preserved scenario packages. Deduplication excludes directory-listing requests and produces 151,576 distinct original file/metadata URLs. This covers the recorded sources, including deferred audio, rather than only the first chapter's recipe.

The mirror comparison runs in ordinary Chrome with CORS enforced. It checks each recorded storage-object key against current S3 listings, compares expected byte lengths and, for deferred audio with a recorded MD5, compares that checksum with the listing's ETag. One actual object GET is sampled for each of 310 listing groups. The twelve non-storage metadata URLs are fetched directly. These checks establish source presence and browser-readable listings/samples, not complete body/hash verification of every media file.

The completed scan used 692 listing requests. All 151,563 listed objects matched their recorded byte lengths, and all 126,113 recorded deferred-audio MD5s matched their current listing ETags. All twelve non-storage URLs returned readable full bodies with matching lengths, and all 310 sampled object GETs succeeded. There were no listing/request failures or unresolved missing targets after the model-index check below. This is an exhaustive comparison of the recorded target keys, not a claim to cover assets absent from the preserved source inventory.

The model index is an exception to directory enumeration: `live2d/model_list.json` is not returned under the attempted listing prefix. A full direct browser GET succeeds with 161,478 bytes and SHA-256 `089a100c51d65bd26b5d979c362984f3c4c44e589b98d086336b0a580d12554a`, exactly matching the locally recorded source. It must not be reported as a missing download.

Only `mmj_01_01` has also passed a complete fresh-profile, static-host acquisition test: every required source body was downloaded and verified, all four Live2D models loaded, all 47 voices decoded, and all 62 passages worked offline. The rest of the archive still needs browser recipes and broader playback validation. Locally compiled programs and rewritten model definitions are derived files; their existence in the local library does not mean those exact exports exist at a public URL. See [the PJSK pipeline](pjsk-pipeline.md) and [implemented prototype](deployment.md#pjsk-direct-download-prototype).

## Blue Archive JP

Scanned all 1,659 published chapter `assets.json` manifests, containing 5,670 unique exported file URLs, plus catalog-art provenance. Deduplicating their recorded official URLs, database source and Windows HD texture packs gives 2,835 source URLs:

| Source family     |  URLs |
| ----------------- | ----: |
| MediaResources    | 2,796 |
| Android_PatchPack |    24 |
| Windows_PatchPack |    14 |
| TableBundles      |     1 |

Every URL returned HTTP 206 to a GET with `Range: bytes=0-0` and `Origin: https://onlystory.example`. All 2,821 URLs with a recorded expected byte size matched the response's total length; 14 Windows catalog/pack URLs lacked a recorded expected size in these manifests. None of the 2,835 responses supplied `Access-Control-Allow-Origin`.

Fresh ordinary Chrome fetches failed for representative media, Android packs, Windows packs and the database. The earlier five-resource browser probe was also rerun and reproduced its failures. These are reachable online sources that the current web app cannot read directly. This finding covers the recorded JP build, not every BA region or possible mirror.

The range probes establish endpoint access and reported size, not full-body checksums, successful archive extraction or browser playback. Native download tools can acquire the source packs, but the existing extraction/conversion pipeline still runs outside the browser. Source selection and processing are documented in [the BA pipeline](blue-archive-pipeline.md); browser restrictions and their implications are in [the acquisition review](browser-asset-acquisition.md#blue-archive-jp) and the [Fetch CORS specification](https://fetch.spec.whatwg.org/#http-cors-protocol).

## Girls' Frontline 1 and 2

See [the GFL source and coverage audit](gfl-online-asset-audit.md). Reachable text archives, resource bundles or model mirrors establish useful sources; they do not establish complete matching art, audio, movies and story coverage for the installed-client exports.

## Evidence and limits

Detailed URL records remain in the ignored local audit directory:

- `.cache/online-asset-audit/pjsk-final.json`: every deduplicated PJSK target, listing result, size/MD5 comparison and representative object GET. Its raw listing absence for the model index is resolved by the full-body supplement.
- `.cache/online-asset-audit/ba-results.json`: every deduplicated BA official URL, HTTP status, total size and CORS header.
- `.cache/online-asset-audit/supplement-results.json`: model-index full-body hash and fresh browser probes for the four BA source families.
- `.cache/browser-source-audit/latest.json`: rerun of the existing sixteen browser/HTTP probes.

The scratch audit programs are alongside those records; application code was not changed for this audit. The [checked-in summary](online-asset-audit.json) records counts, exceptions and evidence hashes. These findings describe access from this machine at the recorded time. They are not a guarantee of future mirror uptime or access from every user's network. Sampled object bodies and listing entries must not be described as full downloads of every source file.
