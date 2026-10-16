# Real GFL2 review excerpt

The normal event now has [full scene playback](gfl2-scenes.md). This page records
the separate original opening preview and the earlier scope audit.

This opening presentation preview remains at `/read/gfl2/gfl2-a33001-opening`, linked from `/lab`. The normal library now opens the [complete event in text mode](gfl2-full-text.md). The preview retains its own saves, bookmarks and scene renderer.

## What is original

- Twelve Chinese text commands from A33001, source rows 1–43, content IDs 233001001–233001012, in their original order.
- Original 希娅 speaker attribution, resolved by the earlier prototype.
- Both assigned CGs, the white background, original BGM and recovered sound effects.
- Thirty-one before-text commands, retained with source rows and arguments.
- The original BGM loop region at 6.4–134.4 seconds and two storm loops at 0–27.5 and 0–38.5 seconds.

No narration, translations, choices or character portraits were invented for this excerpt. The English text preference falls back to the original Chinese. The source voice columns are empty; this excerpt has no spoken voice track.

## Scope and approximations

The excerpt ends at the mind-loading system message, before the first Character command at row 45. The final UI explicitly says the opening excerpt has ended and later character presentation is not connected. It does not label the whole event complete.

The renderer handles background layers, layer changes, fade delays/curves, message-window distinctions, audio cues, loop regions, stops and approximate PunchPosition motion. The shader mask/darkening and motion curves remain browser approximations inherited from the prototype. CRI random thunder sequencing and original per-layer gains are unresolved. No frame/audio comparison with a running game is claimed.

Original CG proportions are preserved with letterboxing. The common dialogue panel intentionally differs from the game's UI. These are useful feedback points: CG framing, how much the text box covers, Chinese readability, scene-first versus reading desk, history access and auto/fast-forward behavior.

History, bookmark entry and direct links reconstruct the visual state and active loop cues. They restart loop audio rather than recovering its exact elapsed timestamp and do not replay past one-shot effects. Ordinary forward playback executes the current passage's cues. Leaving the reader disposes audio, animations and scene layers.

## Private import

`scripts/import-gfl2.mjs` reads the existing prototype without changing it. It checks the excerpt identity, supported command names and recovered audio output hashes, then copies fifteen referenced media files. Only six audio files are played here; extra thunder samples remain preserved but unplayed. A provenance ledger records copied-file hashes, and a hash identifies the original opening JSON.

The default source is `../onlystory-gfl2/prototype`. `ONLYSTORY_GFL2_PROTOTYPE` can override it. Import runs before dev/build and during npm setup. Generated story data and copied assets are ignored. The production output includes the imported private data; this task does not publish it.

Fictional stories are now reachable only through `/lab`, `/games/gfl2?examples=1` and `/manage?examples=1`. Other game catalogs state that no real stories have been imported.

## Verification

The initial real-content run passed six model tests and twelve Chrome browser tests. Follow-up scene-click regression checks cover mouse input at 487×661, touch reveal/advance, text selection and choices. The real-media tests require the local prototype and skip explicitly where it is absent.

The Chrome walkthrough checks all twelve original passages, both CGs, original speaker and system messages, decoded audio, loop boundaries, storm stop, final cleanup, history rewind, bookmark restoration and progress. A fetched CG is compared with its copied-file SHA-256. A separate 320×700 check verifies real Chinese content and the empty PJSK catalog. Another test downloads the original media, sets the browser offline and continues reading with cached CGs and decoded audio. Existing fixture tests continue checking choices and video, which this real excerpt does not contain.

This preview supports feedback on a known story. It does not establish complete GFL2 playback or real PJSK/BA support.

## Distance to the complete event

An audit of the local recovered event books found 30 scripts, A33001–A33030, with 14,007 nonempty commands and 4,443 Text rows. The local event index groups these into 24 entries with 15 distinct chapter titles. The earlier text prototype has all 4,443 localized lines, but its numeric content-ID order and missing speakers do not establish correct scene playback.

This reader currently plays 12 of those text rows. A33001 alone has 92 Text rows; the opening catalog entry spans A33001 and A33002, with 187 Text rows total. This is an opening excerpt, not a completed chapter.

The full-text milestone is now implemented with the complete-book converter, localization joins and explicit presentation limits. See [gfl2-full-text.md](gfl2-full-text.md). The source audit here records how its scope was established.

Full audiovisual presentation is a larger milestone. The recovered books contain 4,982 Character and 894 CharacterOff commands. Their references include 53 distinct Character identifiers, 63 background labels, 232 sound-effect cues and 46 BGM labels. These are script-reference counts, not verified counts of usable media assets. Character assets/poses/motion, the remaining backgrounds/audio, camera/effect commands and timing still need mapping, implementation and comparison. Recognizing a command name does not establish support for all its argument variants. No reliable completion date follows from these counts.
