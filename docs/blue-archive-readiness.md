# Blue Archive integration readiness

Checked against the project code on 2026-10-16. The project is ready to start a real Blue Archive integration. It is not yet a verified Blue Archive story player, and no real Blue Archive story is currently imported.

## What can be reused

- `src/model.ts` already includes game ID `ba`. Episodes, events, chapters, optional branches, choices, saves, bookmarks, text/video steps and localized text share one model.
- `src/catalog.ts` and `src/catalog-source.ts` group episodes by game and collection; they do not require GFL2 event IDs. Catalog search, release order and common navigation can be reused.
- `src/pages/Reader.tsx` provides progress seeking, next/previous navigation, history, choices, checkpoints and settings. `src/components/Stage.tsx` handles common text/video presentation.
- `src/media-storage.ts` downloads URL-based asset sets with shared transfers and browser caching. `scripts/library-server.mjs` serves canonical assets, aliases and ranges independently of game identity.
- GFL2 scene commands, Live2D assets and shaders stay under `src/playback/gfl2/`. The Blue Archive adapter should not emit fake GFL2 commands merely to get through the current loader.

Existing BA entries in `src/fixtures.ts` are fictional interface checks available through `/lab`. They do not demonstrate source extraction, real story order or visual fidelity.

## Integration work still needed

| Area | Current evidence | Required next change |
| --- | --- | --- |
| Source input | No real BA script/assets supplied or imported | Select a specific server, language and source version, then inspect one real story and its referenced assets. Retain source provenance. |
| Catalog registration | `src/content.ts` imports GFL2-generated manifests and creates GFL2 episodes | Add a BA manifest adapter with stable `ba-` IDs, original titles, chapter order, release dates and verified covers. Keep it independent of GFL2 recovery. |
| Chapter loading | `Episode.content.format` only permits `gfl2-text-v1`; `loadEpisode` always calls `decodeTextSection` | Add format-based decoding for BA or a validated common node format. Validate IDs, branch targets and source/scene alignment at that boundary. |
| Scene playback | `SceneHost.tsx` explicitly dispatches GFL2 renderers; unknown renderers show an unavailable message | Implement a BA renderer from observed source commands, or start with an explicitly labeled original-text-only import. Preserve commands that cannot yet be rendered and report unsupported behavior. |
| Assets and audio | Current source recovery and `shareGameAssets` workflow are GFL2-oriented; movie language selection has only been validated with GFL2 | Add BA asset discovery/import and integrity checks, then exercise actual stills, character presentation, BGM/SFX, voice and movies present in the selected story. Do not assume BA uses Cubism or GFL2 material behavior. |
| Locale and player name | Text types are `en`/`zh-CN`; voices are `zh-CN`/`ja`; the default player name and placeholder substitution were built for GFL2 | Match the chosen BA source languages and name syntax. Extend language types/settings only for actual imported material. Prevent GFL2's default name from leaking into BA dialogue. |
| Downloads | Common file transfers work, but real scene manifests and selection currently follow the GFL2 payload shape | Ensure all BA chapter and asset URLs enter the download manifest and that reopening/seeking works with media requests blocked. |
| Reader information | Reader/settings copy describes GFL2 fidelity, source rows and movie-only voice support | Show capabilities and limitations from the selected adapter rather than applying GFL2 claims to BA. |

## First real story acceptance

Use one short real story with its original title, identity, order, source text and all referenced media. Include at least one real choice when the chosen source has choices. Confirm that every source step is accounted for; do not flatten branches or silently discard unknown commands.

Verify it through the ordinary `/games/ba` catalog and reader, not only `/lab`: open, advance, seek forward and backward, reload a deep link, make/revisit a choice, save/resume, bookmark, reach the end, download, and seek with media requests blocked. Check the rendered character/CG against game evidence. Add failures for missing assets and mismatched chapter data.

The first adapter and decoder should be proven by that story before bulk importing BA events. No broad reader rewrite is justified by the current evidence. GFL2 remains usable while BA registration, decoding and presentation are added through the specific boundaries above.
