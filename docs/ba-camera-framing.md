# Operation Carrot 2 camera framing

Issue [#19](https://github.com/kriss-spy/onlystory/issues/19) compares a
close-up from game footage with Onlystory remaining zoomed in during bath
dialogue. The affected chapter is `ba-jp-41085`, Operation Carrot 2, part 2.
Source row numbers below are zero-based.

## Source evidence

The installed original `public/private/ba-jp/41085/source.json` authors this
sequence over background `1956500319`, `BG_CS_Rabbit_04.jpg`:

| Rows    | Camera command                                               |
| ------- | ------------------------------------------------------------ |
| 196–197 | Set `(-930, 0)`, size `1300`                                 |
| 198–199 | Pan to `(-316, -111)` over 3500 ms, then hold for 1500 ms    |
| 200–201 | Fade to `(930, 222)`, size `1300`                            |
| 202–203 | Pan to `(250, 333)` over 3500 ms, then hold for 1500 ms      |
| 204     | Fade, `#all;hide`, no camera or background effect            |
| 205–209 | Wait, then dialogue, including the reported temperature line |

The pinned reference renderer dispatches `removeEffect` on rows with neither
a background effect nor another effect. Its camera cleanup restores the
original background scale and position. Wait and shake commands count as
effects, so they preserve the current camera framing. Replacement backgrounds
start at their base framing, with any explicit camera command applied afterward.

References:

- [Reference effect dispatcher](https://github.com/ba-archive/blue-archive/blob/4ddc9ee241f6028d724346acda190155dc98aaf6/lib/ba-story-player/lib/index.ts#L407)
- [Reference camera cleanup](https://github.com/ba-archive/blue-archive/blob/4ddc9ee241f6028d724346acda190155dc98aaf6/lib/ba-story-player/lib/layers/effectLayer/index.ts#L431)

## Fix

Onlystory previously retained the last camera coordinates indefinitely.
Completed Web Animations pans also used forwards fill, allowing them to override
later inline transforms, including instant commands within this montage.

Camera state now follows the effect lifecycle above. Each stage update captures
the displayed transform and cancels the preceding pan before applying its next
frame. Pans animate toward the inline destination without retaining a forwards
fill. This also keeps interrupted movement continuous. Command parsing uses the
same case normalization as state reconstruction.

The existing zoom scale and coordinate conversion remain unchanged. They are
approximations and have not been matched frame by frame to the original game.
The issue screenshots and source lifecycle justify restoring the full CG after
the montage; they do not establish a replacement coordinate formula.

## Verification

`state.test.ts` checks the actual montage rows, the reset at row 204, wait
retention and replacement backgrounds. `tests/ba-camera.spec.ts` plays the
montage through the actual Original scenes renderer in Chrome, verifies both
pan directions and the final computed transform, and checks direct seeking,
reload and a narrower viewport. Screenshots retain the second close-up, full
CG and reported dialogue. The reported line is also checked in English and
dark mode.

The full repository check passed with 149 unit tests and 141 import tests,
followed by the production build. Two unit tests and seven import tests skip.
It uses one worker, a 1024 MiB Node heap cap and one-CPU affinity. Native BA
database fixtures are intentionally absent; their optional download-corpus and
global-localization audits skip. Five optional native GFL1 interaction audits
also skip. Prepared small source coverage and GFL1 text fixtures come from the
earlier ticket worktree. No game assets are acquired or regenerated for this
change.

## Scene replay markers

An extra click during the montage intentionally finishes its presentation and
reveals the dialogue. Clapperboard markers above the progress bar now make
these sequences discoverable and replayable without stepping backward first.
Markers have hover/focus tooltips and work with mouse, touch and keyboard.

Blue Archive camera moves longer than the 10 ms setup commands, authored movies
and native cutscenes receive markers; shared movie passages do as well. Routine
actor effects and waits do not. Upcoming scenes beyond unanswered choices are
shown dimmed, with focus/hover explanations; they cannot seek or replay until
the selected route reaches them. Their positions use the same longest-route
estimate as the progress bar. All possible continuations are represented until
a choice excludes a branch, and equal-position alternatives stack vertically.
Already reachable scenes use their actual route positions and remain replayable.
Replaying pauses auto/fast-forward, seeks with the selected answers, and runs
the passage presentation again. Reduced motion remains respected. Movie replay
starts at zero and resets completion so Next waits for it again.

`scene-markers.test.ts` checks detection against the actual bath montage and
synthetic source commands. Browser checks cover keyboard replay from the same
passage, mouse replay after advancing, and replaying a completed movie.
