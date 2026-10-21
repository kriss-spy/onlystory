# GFL online asset audit

Checked 2026-10-19, Asia/Shanghai. This covers the existing Onlystory GFL1 Steam EN and GFL2 Windows CN imports, not every region or future release. App code and PJSK acquisition were not changed.

**There are viable online sources for substantial parts of both libraries. This audit does not establish that every existing asset can be downloaded and reconstructed directly by an ordinary browser.** GFL1 has the stronger general resource downloader and complete matching story-text names. GFL2 has a working public Live2D provider, but a complete online source for its imported scripts, backgrounds, sound and movies is still unestablished.

The [machine-readable evidence](gfl-online-asset-audit.json) records exact sampled URLs, browser results, manifest fingerprints, inventory counts and one model byte comparison. The samples prove their own accessibility, not accessibility of every item in a manifest. Manifest/name matches do not prove byte identity unless explicitly stated below.

## GFL1 sources and coverage

Onlystory currently extracts original Unity bundles, native story tables and CRI banks from an installed Steam English client. It exports browser images/audio and compiles chapter JSON. The local provenance snapshot reports 60 collections, 2,254 imported scenes, 2,253 complete scenes, one blocked scene and 14 missing-resource records. The extraction input contains 2,253 script texts and 608 source records. Sources: [extraction](../scripts/gfl1-extract.py), [import](../scripts/import-gfl1.mjs), [pipeline](gfl1-pipeline.md), local `public/private/gfl1/provenance.json` and `.cache/gfl1/extracted.json`.

An existing [gf-resource-downloader](https://github.com/gf-data-tools/gf-resource-downloader) acquires original resources without relying on Onlystory hosting. Its [configuration](https://github.com/gf-data-tools/gf-resource-downloader/blob/main/config.json5) supports CN/TW/KR/US/JP. Its [download code](https://github.com/gf-data-tools/gf-resource-downloader/blob/main/downloader.py) reads `resUrl`, appends `resname + .ab` for bundles and `resname + .dat` for other data. This is an implemented source-discovery route, not a hypothetical endpoint pattern.

The [gfStory-en build workflow](https://github.com/shiropantsu/gfStory-en/blob/main/.github/workflows/build.yml) uses the US manifest and downloader, then extracts images, audio and story files before publishing the viewer. It establishes a working acquisition design to adapt. It does not establish a browser importer or coverage of Onlystory's native gameplay underlays and other additions.

Two live manifest snapshots were retrieved:

| Manifest                                                                                   | Source version                    | Base bundles | Additional bundles | Data files | Declared source root                       |
| ------------------------------------------------------------------------------------------ | --------------------------------- | -----------: | -----------------: | ---------: | ------------------------------------------ |
| [US](https://raw.githubusercontent.com/gf-data-tools/gf-data-us/main/resdata_no_hash.json) | `2026082516`                      |        3,694 |              2,621 |      1,071 | `http://gfus-cdn.sunborngame.com/android/` |
| [CN](https://raw.githubusercontent.com/gf-data-tools/gf-data-ch/main/resdata_no_hash.json) | `190110`, package date 2026-09-22 |        3,693 |              2,618 |      1,071 | `http://gf-cn.cdn.sunborngame.com/pc3080/` |

These are dated snapshots, not a guarantee of the newest installed build. Both have an empty `resHttpsUrl`. HTTPS variants of the sampled asset URLs worked; HTTP-only manifest values need deliberate normalization and verification in an HTTPS release.

The complete public US [story-text tree](https://github.com/gf-data-tools/gf-data-us/tree/main/asset/avgtxt), Git tree `bb4b855be238de2725ab83104bb76bebee51bea8`, contains 3,713 `.txt` paths. All 2,253 locally extracted script names match its case-insensitive basenames, including nested `battleavg` and `va11` directories. Git blob hashes match 1,772 local raw files exactly. The remaining 481 match after converting local CRLF line endings to LF. This establishes matching original text in that public tree. It does not establish Onlystory's compiled ordering, catalog tables, complete online media, or successful HTTP retrieval of every text file. One [original chapter text](https://raw.githubusercontent.com/gf-data-tools/gf-data-us/main/asset/avgtxt/1-1-1.txt) was retrieved readably in Chrome.

Mapping the local 608 source records to the two manifests gives:

- All 356 local `.ab` source records have a logical bundle-name suffix represented in both manifests. Only 347 have an exact resource filename and declared-size match in CN, and none have an exact resource filename match in US. This reflects different platform/version packaging and must not be reported as identical files.
- Another 244 records map by logical data filename in both manifests, including CRI banks whose local names end in `.acb.bytes`.
- Eight records remain outside this simple mapping. Their five distinct names are built-in `resources.assets`, recovered GFL2 `BGE_AVG_Chapter01.acb` and its key sidecar, and native `5016.stc`/`5044.stc` tables. These need an installer/package source, table reconstruction, or a separately verified source path. A missing simple mapping does not prove the data cannot be obtained online.

One full media-bundle comparison was performed. The CN `resource_avgtexture_2017` package downloaded over HTTPS is 3,248,290 bytes with SHA-256 `10f013b7f3441b6df7919678262166c9c1e700e69efac49ed4d746f907313eda`, exactly matching the Steam EN extraction's recorded original bundle. This proves that at least one current image source can be recovered byte-for-byte from the CN CDN. The other 346 filename/size matches were not body-hashed. No complete image/audio body comparison or all-resource availability pass was performed. Neither regional manifest has yet been proved sufficient to reproduce every existing Steam EN image and audio output.

Raw bundles still require a browser extraction/conversion implementation. Current image handling uses UnityPy; current audio handling calls native vgmstream and FFmpeg. Sources: [extractor](../scripts/gfl1-extract.py), [audio](../scripts/gfl1_audio.py), [cross-game bank provenance](gfl1-pipeline.md).

## GFL2 sources and coverage

Current source extraction uses the installed Windows CN cache, recovered source books/tables, and sibling-project Addressables/GFF parsers. It is not a network importer. Sources: [book extraction](../scripts/gfl2-extract-event.py), [character extraction](../scripts/gfl2-characters.py), [media extraction](../scripts/gfl2-media.py), [video extraction](../scripts/gfl2-videos.py).

The external [srpg-kr/l2d-assets](https://github.com/srpg-kr/l2d-assets) repository explicitly publishes extracted models, textures, motions and configuration through GitHub Pages. The [viewer configuration](https://github.com/srpg-kr/srpg-kr.github.io/blob/main/src/live2d/lappdefine.ts) uses `https://srpg-kr.github.io/l2d-assets/Resources/`. This is a usable source candidate for character assets that avoids raw Unity extraction for those files.

A complete, non-truncated repository tree scan found matching resource-directory names for 375 of the 379 distinct prefab basenames referenced across 37 local character manifests. The four unmatched names are `CHA_Dmitriy_Young_NPC`, `CHA_ELID__01`, `CHA_Jiangyu_SSR_01` and `SoundOnly_02`. The last is deliberately nonvisual. Two names resemble variants in the public list, but this audit did not validate substitutions. Directory matches do not check every model dependency, expression mapping, original transform, version or hash.

For Gaia, Chrome successfully read the [model definition](https://srpg-kr.github.io/l2d-assets/Resources/CHA_Gaia_NPC_01/CHA_Gaia_NPC_01.model3.json), [MOC3](https://srpg-kr.github.io/l2d-assets/Resources/CHA_Gaia_NPC_01/CHA_Gaia_NPC_01.moc3) and [atlas PNG](https://srpg-kr.github.io/l2d-assets/Resources/CHA_Gaia_NPC_01/CHA_Gaia_NPC_01.2048/texture_00.png). The full 268,608-byte remote MOC3 has SHA-256 `98256ac07decee4cc8866d06b707c96403fc98686c12d8c4ec03501c1212e83b`, exactly matching the local Gaia model. Other files/models were not exhaustively downloaded or compared.

The current local manifests declare 3,141 unique character-file URLs, 3,172 unique background/audio media URLs and 64 unique video-file URLs. These sets can overlap and should not be added as a deduplicated total. The media manifests retain 17 unresolved records and video manifests retain two. These are snapshot inventory counts, not an assertion that every manifest file is used by a released chapter. They explain why a model provider alone cannot replace the existing library.

The [official cover downloader](../scripts/gfl2-covers.py) acquires promotional art, not original story books or sound. [GF2AssetBundleDecryption](https://github.com/nijinekoyo/GF2AssetBundleDecryption) is a public local-cache decoder; its instructions say table files are downloaded after launching the game. Neither establishes all-content automatic browser acquisition. No exhaustive online source for Onlystory's GFL2 source books, localization/content tables, backgrounds, CRI sound or movies was verified in this pass.

## Browser probe results and limits

Chrome 155.0.8059.82 fetched actual upstream resources with CORS enforced. The harness tested a loopback origin and a locally fulfilled `https://onlystory.example` document. This environment routes external traffic through local addresses, so the latter context needed Chrome's `local-network-access` permission; CORS was not disabled. Treat this as controlled browser evidence, not a deployment test from a real public domain. Each browser probe read the first response chunk and canceled the remainder. Native probes sent `Origin: https://onlystory.example` and `Range: bytes=0-1023`.

| Sample                                           | HTTPS-origin browser GET     | Native partial GET               |
| ------------------------------------------------ | ---------------------------- | -------------------------------- |
| US manifest and chapter text                     | Both 200, readable           | Both 206, allow-origin `*`       |
| US text bundle and 2017 background bundle, HTTPS | Both 200, readable           | Both 206, no allow-origin header |
| CN text bundle and 2017 background bundle, HTTPS | Both 200, readable           | Both 206, allow-origin `*`       |
| Gaia model JSON, MOC3 and texture PNG            | All 200, readable            | All 206, allow-origin `*`        |
| Four HTTP GFL1 bundle URLs                       | All blocked as mixed content | All 206 outside browser          |

The US result depends on request shape. A separate ordinary native GET to the US text bundle returned 200 and `Access-Control-Allow-Origin: *`, agreeing with Chrome's readable full GET. Its partial 206 response lacked that header. Browser range/resume must therefore be tested separately; a working ordinary download does not prove readable range responses.

The [Fetch standard](https://fetch.spec.whatwg.org/#http-cors-protocol) requires upstream permission for readable cross-origin requests. A PWA service worker or WebAssembly decoder cannot supply missing upstream permission. Existing local exports can continue to work offline, but these samples do not establish complete reconstruction on a new machine.

## What remains before an all-assets claim

GFL1 needs a versioned dependency map that accounts for every current source record, the native tables and built-in resources, plus a browser conversion path and exhaustive required-resource availability/hash checks. Its public original text is well accounted for; regional package identity needs care.

GFL2 needs verified sources for the non-model parts of the library, resolution of the unmatched visual model labels, and a dependency-level audit of the public models. A native-cache decoder is useful conversion evidence but does not answer source availability.

Neither result supplies app-exclusive access. Public source URLs and browser-side transformation logic remain reproducible outside Onlystory. Keeping dependency resolution and unpacking inside the app supplies convenience and practical friction, not secret protection.
