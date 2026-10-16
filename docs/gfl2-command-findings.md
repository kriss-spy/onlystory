# GFL2 event command findings

Investigated 2026-10-16. Scope is the recovered A33001 through A33030 books for 金翅雀与橄榄枝 and the current decoded Assembly-CSharp. These are offline book observations and coherent ILSpy decompilations. No game runtime was executed. These are not retained REA Evidence IDs.

## Reproduce

Run `node scripts/gfl2-command-audit.mjs` for a summary. Pass a books directory and an output JSON path to retain every argument value, frequency, first source row, and complete argument variant. The audit never changes recovered books.

The exact source assembly is `../onlystory-gfl2/resource_mapping/Assembly-CSharp.current.decoded.dll`. Its SHA-256 was previously recorded as `5c580d8df29bb37d5f1f4070e81ea427d20e2c99cadcdb23f813cf212ddbd9ff`. The original source assembly hash is `c8b82e2cdefd6585274c6bada0981a6000a3f882b3a82c9c9bc296dbfd76fb57`. See the sibling `resource_mapping/findings.md` and `decode_evidence.json`.

The existing decompiler is `D:/Program Files/GF2Exilium/_reverse_engineering/tools/ilspycmd.exe`. Example command, with paths resolved from this project:

```powershell
& 'D:/Program Files/GF2Exilium/_reverse_engineering/tools/ilspycmd.exe' -t Utage.AdvCommandCharacter '../onlystory-gfl2/resource_mapping/Assembly-CSharp.current.decoded.dll'
```

REA 6.4.0 generic `decompile` reported native-provider unavailability for this managed assembly. ILSpy provides the source claims below; they must not be called REA retained evidence. Existing coherent source caches in `../onlystory-gfl2/current_book_probe` corroborate Bg, Tween, Text, and wait base classes.

## Dynamic entities are essential

Compiled `grid.rows` contain zero placeholders for dynamic argument expressions. Restore `grid.entityDataList[i].originalStrings` at the corresponding `grid.entityIndexTbl[i]` row index before reading arguments. All eleven dynamic rows are ZoomCamera commands:

| Book   | Entity row indices         |
| ------ | -------------------------- |
| A33001 | 70, 79, 196, 223, 253, 275 |
| A33003 | 456                        |
| A33020 | 549, 635                   |
| A33021 | 367, 384                   |

Their original arguments are `SpriteCamera, &needSize, &needX, &needY`, followed by easing, duration and delay. Treating compiled zero as zoom would make the view disappear. The audit script restores these original cells.

Param has only five literal variants across all 33 rows:

- `needSize=(3.6/3.2)`, five occurrences.
- `needSize=(3.6/3.6)`, five occurrences.
- `needSize=(3.6/3)`, one occurrence.
- `needX=(100*0/(-1/needSize+1))`, eleven occurrences.
- `needY=(100*0/(-1/needSize+1))`, eleven occurrences.

The first and third zooms are 1.125 and 1.2. The reset gives zoom 1. At zoom 1 the coordinate expressions calculate 0/0; `LetterBoxCamera.RefreshCamera` explicitly replaces NaN coordinates with Vector2.zero. A small bounded arithmetic parser or recognition of these exact expressions suffices. Never use JavaScript eval on imported story text.

## Coordinate system

The following facts come from exact decompiled methods, not estimates based on names:

- `LetterBoxCamera.OnCanvasResolutionChange` sets nominal width 1600 and height 900.
- `LetterBoxCamera.RefreshCamera` uses `720f / (2 * pixelsToUnits) / Zoom2D` specifically for the GameObject named SpriteCamera. Other camera names use CurrentSize.y instead of 720. Its default pixelsToUnits is 100.
- At a 16:9 view, SpriteCamera therefore shows 1280 by 720 logical scene units at zoom 1.
- `AdvGraphicLayerDefault.ResetCanvasRectTransform` sets layer position to settings X/Y/Z divided by GraphicManager.PixelsToUnits, and its scale to settings Scale divided by that same value.
- The original layer sheet sets 中 to (0,-300), 左 to (-300,-300), and 右 to (300,-300). Their order is 190. BgDefault order is 5, BgCG 31, EffectLayer 35, 黑屏 210.
- `AdvGraphicObject.SetCommandPostion` sets only explicitly supplied Arg4/Arg5 coordinates; blank cells retain position. None of the event Character commands supplies Arg4 or Arg5.
- A typical character graphic setting has X=0, Y=251, RenderRect=0,0,800,800 and Scale=.29. Its displayed render texture is centered at the layer position plus graphic.Position, e.g. (±300,-49).
- `AdvRenderTextureSetting.Init` makes the texture pixel dimensions RenderRect dimensions times RenderTextureScale. `AdvGraphicObjectRenderTextureImage.ChangeResourceOnDraw` divides those dimensions back by RenderTextureScale when sizing its visible RawImage. RenderTextureScale=3 is supersampling, not a threefold larger actor.
- `AdvRenderTextureSpace.CreateRoot` uses graphic.Scale divided by pixelsToUnits; its orthographic camera size is RenderTextureSize.y divided by pixelsToUnits, by 2, and by RenderTextureScale. The model's Cubism canvas PixelsPerUnit and the prefab's transform scale still contribute. Do not multiply an exported model canvas width by .29 without applying those original units.

The browser can use a 1280 by 720 logical canvas, render each character to its original 800 by 800 transparent crop, and place that crop with the actual layer and graphic coordinates. Prefab/Cubism unit conversion must come from extracted model metadata. Flexible/wider screen configurations and a runtime screenshot comparison remain unverified.

## Command arguments

All numbered arguments below are the named Arg columns, not zero-based array indices.

| Command and count          | Verified meaning                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bg, 217                    | AdvCommandBgBase: Arg1 texture label; Arg3 background layer; Arg6 fade seconds default .2; Arg7 delay default 0; Arg8 easing default Linear. An existing same object in the requested layer is retained. Each layer has a default object; a different label crossfades/replaces that default.                                                                                   |
| BgOff, 173                 | AdvCommandBgOff: Arg1 object or layer label, blank means all background objects. Arg6 fade default .2, Arg7 delay 0, Arg8 easing Linear.                                                                                                                                                                                                                                        |
| Character, 4,982           | AdvCommandCharacter and AdvCharacterInfo: Arg1 actor label; Arg2 expression timeline; Arg3 character layer; Arg4/5 explicit local position overrides; Arg6 fade default .2; Arg7 delay 0; Arg8 easing Linear. The command updates an existing actor's pattern instead of creating a duplicate. New actors get a .04-second minimum draw delay when the requested delay is zero. |
| CharacterOff, 894          | Arg1 actor label, blank means all characters; a layer lookup is attempted if no actor is found. Arg6 fade default .2, Arg7 delay 0, Arg8 easing Linear.                                                                                                                                                                                                                         |
| Sprite, 106                | AdvCommandSprite: Arg1 instance name; Arg2 texture label defaults to instance name; Arg3 layer; Arg4/5 position; Arg6 fade .2; Arg7 delay 0; Arg8 easing Linear. The only event variant is BG_None_Black_02 on 黑屏 at (0,0), fade .8, delay 0.                                                                                                                                 |
| SpriteOff, 106             | AdvCommandSpriteOff: Arg1 sprite label; blank means all; Arg6 fade .2, Arg7 delay 0, Arg8 easing Linear. Event variant is BG_None_Black_02, fade .8, delay 0.                                                                                                                                                                                                                   |
| Param, 33                  | AdvCommandParam parses an assignment expression from Arg1 and applies it through engine.Param.CalcExpression. See the complete five-variant list above.                                                                                                                                                                                                                         |
| Tween, 330                 | AdvCommandTween: Arg1 target, Arg2 type, Arg3 key=value options, Arg4 easing, Arg5 loop mode/count, Arg8 replace. WaitType overrides legacy Arg6 wait. Arg7 is **not read** by this class. Timing comes from Arg3 start/delay/time.                                                                                                                                             |
| TweenOff, 2                | AdvCommandTweenOff: Arg1 object or layer, blank means all; Arg7 stop delay. It stops playing endless-loop tweens, not every finite tween. Event targets are BG_Yellow_TemporaryOffice_Day_01 at A33020:778 and BgDefault at A33028:551.                                                                                                                                         |
| ZoomCamera, 11             | AdvCommandZoomCamera: Arg1 camera name; Arg2 zoom default 1; Arg3/4 zoom center; Arg5 easing; Arg6 duration default .2; Arg7 delay. All event arguments 2 through 4 are restored dynamic references.                                                                                                                                                                            |
| Particle, 56               | AdvCommandParticle: Arg1 instance label; Arg2 particle resource label defaults to Arg1; Arg3 layer defaults to SpriteManager.DefaultLayer; Arg6 fade default 0; Arg7 delay 0; Arg8 easing Linear. Resource settings select original Unity particle prefabs.                                                                                                                     |
| ParticleOff, 30            | AdvCommandParticleOff: Arg1 instance, blank means all particles; Arg2 stop mode default Default; Arg6 fade .2; Arg7 delay 0. Original Unity particle stop behavior is not reproduced by a static overlay.                                                                                                                                                                       |
| AddEffect, 56              | AdvCommandAddEffect plus AdvCommandRuleFadeBase: Arg1 target; Arg2 attached prefab effect; Arg3 vague .2; Arg4 clear true; Arg5 target variable; Arg6 duration .2; Arg7 delay 0; Arg8 multiplier 1. Event uses two communication hologram effect prefabs; no other transition fields are supplied.                                                                              |
| SetShaderFloat, 183        | AdvCommandSetShaderFloat: Arg1 target or special group; Arg2 property; Arg3 from float; Arg4 to float; Arg5 useDefaultValue integer, parsed but not referenced later in this class; Arg6 duration default 0; Arg7 delay.                                                                                                                                                        |
| SetShaderColor, 156        | AdvCommandSetShaderColor: same slots, with Arg3/4 colors default white. Arg2 is always _Color in this event. AllBgLayers and AllCharacterLayers address groups.                                                                                                                                                                                                                 |
| ChangeLayer, 3             | AdvCommandChangeLayer: Arg1 object, Arg2 reposition mode default KeepGlobal, Arg3 destination layer; Arg6 fade .2; Arg7 delay 0. All event commands move the existing background to BgFrontForChange with zero fade/delay; they must not create a second copy.                                                                                                                  |
| Wait, 106                  | AdvCommandWait: Arg6 seconds, with engine.Config.SkipSpped applied during skip.                                                                                                                                                                                                                                                                                                 |
| ChangeMessageWindow, 1,220 | Arg1 window setting; observed four values are recorded in the audit. This changes dialogue presentation, not story position.                                                                                                                                                                                                                                                    |
| Text, 4,443                | AdvCommandText: Arg1 display speaker, often a numeric localized content ID; Arg2 character identity for speaker highlighting/voice; Arg3 comma-separated actors excluded from gray-out; Arg4 secondary speakers; Arg7 fade default .5, Arg8 text fade default Arg7-.2. WindowType can override the active window.                                                               |
| EndScenario, 30            | Ends the source book; not an asset command.                                                                                                                                                                                                                                                                                                                                     |

The total is 14,007 commands across 30 books.

## Expressions and active actors

AdvGraphicObjectLive2D.PatterSplitChar is `|`. Each element is `expression,time`; times are absolute offsets from the command's start after Arg7 delay, not durations to accumulate. For `Idle,0|Happy,0.5`, set Idle immediately and Happy at .5 seconds. A new Character command cancels that actor's previous pending pattern timeline.

The whole event has 259 distinct Arg2 pattern strings for 53 actor labels. Arg3 is always 中, 左 or 右. Pattern names are source expression/animation selectors; they are not independent background or portrait files. AdvCharacterInfo also recognizes Off and Character tags, though this event's literal pattern variants should be checked before implementing extra tag syntax.

An actor remaining present between text commands is intentional. Only CharacterOff, replacement on the same single-character layer, or actual source transitions should remove it. Text.Arg2 and Text.Arg3 matter for active-speaker gray-out. Numeric Text.Arg2 identities need the game's CharacterSetting name/ID mapping; do not compare only the localized displayed speaker string.

## Tweens and waits

The event's six tween types are PunchPosition 127, MoveTo 102, ShakePosition 39, ColorTo 6, ScaleTo 51, and ScaleFrom 5.

The original iTween class stores `start` separately and its Start coroutine waits that number of seconds before beginning. It also stores `delay` independently. Do not interpret `start` as a coordinate. AdvITweenPlayer converts positional X/Y/Z by pixelsToUnits unless the target is under 2D space and islocal=true. MoveTo islocal=true therefore uses local scene pixel coordinates; world conversion needs the layer transform.

All event loop arguments are blank or loop=0/1/2/3. iTweenData.IsEndlessLoop is true when loop mode is enabled and count is <=0, so loop=0 is endless. Empty Arg5 has no loop mode. A finite loop=1 is one repetition according to the original player accounting, not endless.

AdvCommandWithDelayBase defaults to PageWaitSkippable; Character overrides the blank WaitType to InputWaitSkippable. AdvCommandEffectBase defaults to Default. Explicit event wait modes are NoWait for all AddEffect and ZoomCamera, 325 Tween rows and 135 shader-float rows; five Tween rows use PageWaitSkippable. Remaining shader-float rows have blank WaitType. These names are engine scheduling modes, not a universal instruction to await every transition before showing text.

## Fidelity limits

Original backgrounds, BGM cues, character model expressions and layer positions are directly supported by source metadata. Shader _MaskHeight, _DarkRampMask, _BlurMode, _Radius and _Brightness occur in this event. Their argument flow is verified, but an exact browser implementation requires the original shader equations. A CSS blur/tint approximation must be identified as an approximation. Unity particle prefabs and communication effects also require their own rendering work for exact reproduction. Audio cue extraction and the full Cubism asset chain are handled by separate investigations.
