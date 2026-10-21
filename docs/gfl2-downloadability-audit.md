# GFL2 downloadability audit

Checked 2026-10-19. **The standalone app cannot currently download all existing GFL2 stories on a new machine.** The current catalog has 715 stories across 36 collections and 117,679 passages. Every story has a scene package. This scope excludes the old opening preview and fixtures.

The existing prepared library contains all 7,914 distinct declared files on disk, including 5,769 scene assets. The independent local HTTP audit also received successful HEAD responses for every declared URL and validated all 715 section package identities and passage counts. That establishes local availability. It does not supply an external source for a fresh installation. The app has zero GFL2 acquisition recipes; the desktop downloader rejects these stories. Vite can serve and cache the local exports during development.

## Public character assets

The [srpg-kr model provider](https://github.com/srpg-kr/l2d-assets) covers Live2D files. We read all 376 matched or alias model definitions and checked all 4,147 unique referenced URLs with fresh HTTP HEAD requests, six workers, persistent HTTPS connections and retries for transport/server errors. 4,116 returned 200 with cross-origin permission. 31 returned 404 across 9 model definitions. These failures are motion references, including a duplicated 'motions/motions/' directory. Removing that duplicate fixes three URLs, all freshly checked 200 with cross-origin permission. The other 28 motion paths were also absent from the complete repository tree under their respective model directories. The complete URLs are in the [JSON report](gfl2-downloadability-audit.json). The checks did not download and hash every complete dependency body. This audit did not map the mirror motion entries to commands exercised by current Onlystory chapters. A failed mirror reference therefore does not establish that a particular chapter fails playback.

There are 377 distinct prefab names in current scenes. 373 match definition paths exactly. 'SoundOnly_02' is intentionally nonvisual. The remaining three have differently named public definitions. We downloaded each candidate's complete MOC3 and matched its SHA256 to the local MOC3:

| Local prefab            | Public definition basename | MOC3 identity      |
| ----------------------- | -------------------------- | ------------------ |
| `CHA_Dmitriy_Young_NPC` | `CHA_Dmitriy_Young_NPC_01` | Exact SHA256 match |
| `CHA_ELID__01`          | `CHA_ELID_01`              | Exact SHA256 match |
| `CHA_Jiangyu_SSR_01`    | `CHA_Jiangyu_NPC_01`       | Exact SHA256 match |

This establishes those model bodies, not matching textures, expression mappings, motion semantics or transforms. It also does not establish a complete story download.

## Other assets and limits

The story scene inventories contain 2,049 OGG files, 46 MP4 files, 18 VTT files and 895 PNG/WebP files, plus model definitions and dependencies. The images include model textures and backgrounds. No exhaustive public source mapping for the current books, localization/content tables, backgrounds, audio or movies was verified. Existing import scripts extract an installed Windows CN cache with Unity/Addressables/GFF, CRI and native media tools. The [GF2AssetBundleDecryption instructions](https://github.com/nijinekoyo/GF2AssetBundleDecryption) also operate on a local installed cache and say table files arrive after launching the game. The [exilium-tools update tracker](https://github.com/0x795E69D8/exilium-tools/tree/main/game_update_tracker) scans local game installations. Neither is a verified chapter downloader. This audit does not prove that no other source exists.

The current scene exports also retain 50 distinct unresolved kind/label pairs, repeated 288 times across 168 stories. They include expression mappings, backgrounds, audio, text gaps, one video label and character labels. These are existing source or reconstruction gaps, separate from network failures.

Raw results and repeatable probe scripts are retained under '.cache/other-game-download-audit/gfl2/'. The machine-readable report records exact counts, aliases, failures, collection coverage and verification limits. No app code or Windows package was changed.
