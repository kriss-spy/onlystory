# Other games: downloadability audit

This records the audit before the all-BA downloader was implemented. See
[BA download recipes](ba-download-recipes.md) for the current implementation.

Checked 2026-10-19. Scope: every current non-preview Onlystory catalog entry for Girls' Frontline 1/2 and Blue Archive, excluding Project SEKAI and design fixtures. Three parallel game audits and a separate runtime inventory check distinguish prepared development assets from acquisition on a new machine.

The complete libraries cannot currently be downloaded in the released standalone app without an Onlystory asset backend. Windows acquisition is implemented for the Blue Archive prologue only. The browser supports manual original-file import for that prologue. GFL1, GFL2 and the remaining BA chapters need source/conversion recipes.

| Game            | Available stories | Additional incomplete entries | Declared local files reachable | Implemented Windows acquisition |
| --------------- | ----------------: | ----------------------------: | -----------------------------: | ------------------------------: |
| GFL1            |             2,253 |                             1 |                  7,358 / 7,358 |                               0 |
| GFL2            |               715 |                             0 |                  7,914 / 7,914 |                               0 |
| Blue Archive JP |             1,659 |                             0 |                15,624 / 15,624 |                      1 prologue |

## What was checked for every catalog entry

The [inventory automation](../scripts/audit-download-inventory.mjs) loads the actual development catalog, enumerates each chapter's asset list, expands all 2,374 scene-program file inventories, and sends HTTP HEAD requests for every deduplicated declared file. It also checks scene version, chapter identity and passage count. All 30,896 declared file URLs responded successfully, with no HTML fallback pages or scene-inventory mismatches. This covers 4,627 available stories plus the one incomplete GFL1 entry.

Run the development server in the existing `psmux -L codex` session, then repeat the local check with:

```powershell
node scripts/audit-download-inventory.mjs
```

Use `ONLYSTORY_AUDIT_URL` to select another development origin. Detailed per-story and per-file results are saved to `.cache/other-game-download-audit/local-inventory.json`; the runtime catalog snapshot is beside them. The audit uses persistent HEAD connections to avoid exhausting Windows ephemeral ports.

This verifies declared files in the prepared local library. It does not establish public upstream sources, full response-body integrity, decoding or offline playback of every story. Provenance gaps omitted from the declared file arrays remain separate findings.

## Public-source findings

- [GFL1](gfl1-downloadability-audit.md): all 2,253 available stories' original texts were freshly downloaded and verified against retained hashes/content. All 1,200 mapped package URLs passed HEAD checks with expected lengths. Eight source records remain unmapped; regional package identity and native conversion still require work. No standalone extraction/conversion downloader exists.
- [GFL2](gfl2-downloadability-audit.md): fresh GETs retrieved 376 public model definitions. HEAD checks of their 4,147 dependency URLs returned 4,116 successes and 31 missing motion references, three of which have working corrected paths. These references were not mapped to motions exercised by each imported chapter, so a broken mirror reference does not establish a chapter playback failure. Three differently named model candidates have MOC3 bodies matching local hashes. This does not establish complete equivalent models or public sources for the imported story books, backgrounds, audio and movies. No standalone downloader exists.
- [Blue Archive JP](ba-downloadability-audit.md): all 2,842 recorded endpoints responded, including 2,835 official sources. Official sources lack CORS permission, and Chrome failed representative requests from all four official source families. Windows can fetch these sources, but only the prologue has the required import recipe; the other 1,658 chapters do not.

Full media downloads, conversion and offline playback were not repeated for every story. Endpoint availability, model-file existence and successful local serving must not be described as complete new-machine download verification. These findings cover the pinned imported builds and access from this machine at the recorded time, rather than every game region or future source availability.

The [combined evidence summary](other-game-downloadability-audit.json) links the per-game records and fingerprints the exhaustive local result. Application code and release binaries were not changed for this audit. The live development server remains available at `http://127.0.0.1:4173`; attach with `psmux -L codex attach -t onlystory-dev`.
