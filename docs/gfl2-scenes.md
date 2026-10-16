# 金翅雀与橄榄枝 scene playback

All 24 sections and 4,443 original passages now use recovered backgrounds,
Live2D characters and music in the common reader. Passage IDs, bookmarks, saves
and URLs are preserved. Start at `/read/gfl2/gfl2-event-3478101`; the first
character scene is `?line=A33001%3A56`.

## Recovered assets

- All 63 background labels and the additional black-screen Sprite label resolve.
  There are 62 original lossless images. Two labels reference the same custom
  black prefab, represented explicitly as solid black.
- All 53 Character labels resolve: 52 visible labels and intentional SoundOnly.
  Both commander variants are included. The 53 distinct Cubism models contain
  318 expression entries and 640 files.
- All 46 BGM and 232 sound-effect labels resolve. The 353 media files preserve
  source loop boundaries. Compound cues retain original waveforms, with
  documented scheduling approximations.

Runtime character and media files total about 402 MB, shared between chapters.
Raw HCA data and extraction caches live outside `public` in `.cache/gfl2-media`.
Detailed provenance and reproduction commands are in
[character recovery](gfl2-character-findings.md),
[media recovery](gfl2-media-findings.md) and
[command semantics](gfl2-command-findings.md).

## Playback and restoration

`scripts/gfl2-scenes.mjs` attaches original presentation commands to each text
boundary and retains source-book resets and exit commands. Text import restores
eleven dynamic camera arguments from the original entity table; the exported
grid's numeric placeholders are not the original commands.

Chapter presentation data loads separately. A pure reducer computes immutable
scene states. The adapter stays behind `SceneHost`; the common reader does not
acquire GFL2 commands or Live2D assumptions.

The WebGL player uses the recovered 1280 by 720 logical scene, layer positions,
orders, graphic scales, prefab scales and Cubism pixels per unit. Characters
move between original slots and use original expression indices and scheduled
expression changes. Both female commander models follow the protagonist
preference. Render-texture crops are applied; supersampling does not enlarge
the characters. Color and blur filters use the canvas backing-buffer resolution.
Pixi's default 1× intermediate textures previously downsampled characters on
denser displays, despite the original atlases being intact.

Backgrounds and models load as needed. Audio fetches and decodes active cues,
keeps continuing BGM between passages, and bounds its inactive decoded buffer
cache. Both full-event and legacy opening players mix through a shared output
compressor with makeup gain canceled. This preserves quiet audio levels while
reducing peaks when music and ambience overlap at high volume. Browser audio
may require the speaker icon to enable playback.

Seeking, history and reload restore the target scene and looping cues without
replaying earlier one-shot sounds. Fast-forward uses instant state changes.
Async loads are canceled or discarded when no longer current. Leaving a scene
closes its audio context, destroys WebGL objects and releases blob URLs.

Settings offer Scene first, Reading desk and Text only. Text only stops scene
playback while retaining the same passage, navigation and saves. Downloads
include scene dependencies, female models and local Cubism Core. Downloaded
chapters work offline in an already loaded app. Opening the whole application
offline still needs the planned desktop host or offline shell.

## Fidelity boundaries

Original model artwork, expression parameters, backgrounds and audio are used.
This is a browser reconstruction; no frame or sound comparison against a
running game is claimed.

Fades, motion curves, camera changes and tint/blur/darkening approximate Unity.
Source waits are retained, but reading advances at text boundaries instead of
reproducing the complete Utage scheduler. Unity particle prefabs, attached
hologram effects and original mask shaders are not rendered. Voice is not
connected. Five compound sound cues use documented loop-bed or first-variant
playback instead of exact CRI random sequencing.

One script asks 布瑟尔 for `Think`, while its settings define only `Idle`. The
source inconsistency is preserved in the character recovery manifest; no
replacement expression was invented.

## Verification

The final local run passed 19 unit tests, 8 import tests and 40 Chrome browser
tests, plus production build, formatting and the independent character/media
verifiers. The production dependency audit reported no vulnerabilities.

Import checks all 24 scene packages against all 4,443 passage IDs, verifies
local dependencies and includes female assets in offline lists. Independent
extractors verify character/media hashes and source references. Reducer tests
cover all recovered books, expression schedules, actor slots, parameters,
camera resets, audio stops and immutable seeks.

Chrome checks load all 52 visible labels and both female models on real story
routes, inspect later scenes in both themes and phone/desktop sizes, and test
scene/BGM restoration, rapid seeks, reload, text-only switching and offline
downloads. Broader reader tests retain chapter continuation, fast-forward,
branches, saved points and the original opening preview.

Quality regressions exercise rendered output. The character test compares the
real tinted Gaia model against an unfiltered, full-resolution RGB reference at
125% and 200% display scaling. The former 1× filter retained only about 63% and
39% of that edge detail; the matching-resolution filter passes the 90% minimum.
The audio tests render the real opening player graph through Chromium's OGG
decoder into a 135-second offline audio buffer at default and maximum volume.
Before output protection, the corrected source mix at maximum volume reached
1.70769 with 28,911 clipped channel samples. After protection it reached 0.82189
with zero clipped samples. A quiet sine-wave check verifies that the compressor
does not boost quiet audio. The independent source-decoder comparison is
documented in the media recovery findings.
