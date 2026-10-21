# Omitted battle notices

The reader marks Blue Archive main-story boundaries where the pinned official
`ScenarioModeDBSchema` has both front and back scenario groups. The source exporter
keeps those group lists in `scripts/ba-library.json` as `mainStory.phase` and
`mainStory.modeIds`. The last front group and first back group delimit gameplay
that Onlystory does not play.

Run `node scripts/build-battle-boundaries.mjs` after refreshing that inventory.
The unit check compares the committed boundary map with the source definitions.
The reader shows a notice at front-story completion and at the first passage of
the back story, including direct entry. Auto reading and fast-forward pause there
so the notice remains visible until the reader continues.

This mapping covers the verified BA main-story front/back boundaries. It does not
infer gameplay from battle words in titles, numbering gaps, gunfire effects, or
unrelated story transitions. Other games and BA event battle boundaries need
equivalent source metadata before they can be marked reliably.
