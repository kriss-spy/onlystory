# GFL2 character holograms and shadows

Investigated 2026-10-16 against the installed GFL2 cache and the existing decoded Assembly-CSharp. These are offline original artifact observations, ILSpy decompilations, and Microsoft D3DDisassemble output. No original game runtime was observed; these are not retained REA Evidence IDs.

## Source chain

The coherent decoded assembly is `../onlystory-gfl2/resource_mapping/Assembly-CSharp.current.decoded.dll`, SHA-256 `5c580d8df29bb37d5f1f4070e81ea427d20e2c99cadcdb23f813cf212ddbd9ff`. Focused decompilations are in `.cache/gfl2-ilion-runtime/`.

`Utage.AdvCommandAddEffect.OnStartFade` calls `AdvGraphicObject.AddPrefabEffect`. Despite the method name, this path duplicates the actor RawImage and loads a Material, not a particle prefab. `ILDMAADEIIG.PCPBLFNFPPK` resolves `Assets/ArtsResource/Effect/AVG/<effect name>.mat`. The clone is created once and reused; a blank effect name removes it. The original actor's ScriptColor becomes `commColor=(.61,.78,.91,1)` and is reset to white when clearing the effect. Duration/delay control clone visibility. Character expression changes do not inherently clear the effect.

Materials and Texture2D assets are resolved through the existing catalogue and decoded read-only by UnityPy. `.cache/gfl2-ilion/inspect-hologram-focused.py` reproduces extraction and shader disassembly; `.cache/gfl2-ilion/inspect-shadow.py` extracts the shadow shader. Original serialized material/shader trees and disassemblies are under `.cache/gfl2-ilion-hologram/`. D3D bytecode is extracted with UnityPy's ShaderProgram parser, then passed to Windows `d3dcompiler_47.dll!D3DDisassemble`.

The runtime texture assets (103,184 bytes) are recorded with full SHA-256 in `public/private/gfl2-effects/manifest.json`; source-generated metadata is `src/generated/gfl2-effects.json`. Scene imports include these in offline file lists only where AddEffect uses them.

## Hologram variants

All 263 Ilion AddEffect commands use two material names: 233 `SenCharEff_CommunStart_holo_01`, 30 `SenCharEff_Plot_CommunStart_holo_02`. In M22003, rows 189 and 361 activate the plot variant on 星期五闭眼.

`AdvGraphicObject.GetCharacterMeterial` overrides `_MainColor` with `(.09,.46,.74,.78)*2^2.2`. Its unlit alternative uses `2^3.4`. The cached material itself has a different saved color; using only the serialized color misses this override. The raw material `_Brightness` values are irrelevant to these particular compiled shaders; `_MainTexBrightness` is the consumed property.

### Plot variant

Shader `gf_shader/vfx/UV_Effect_Base_Fast`, unmodified vertex program blob 0 and fragment blob 16. Actor RawImage supplies `_MainTex`. Other source textures:

- `_MaskTex=mask_011x`, 256x256, scale `(0,40)`, offset `(.37,0)`, panner `(0,.008)`.
- `_TurbulenceTex=mask_021_4x`, 512x512, scale `(7,7)`, normal panner `(.006,0)`.
- `_Mask` has no texture, so its default is white.
- `_UVEffectPower=.16`, `_MainTexContrast=.6`, `_MainTexBrightness=.5`, `_AdditionalAlpha=1`, `_Gradient=1`.

Let `uv` be the original actor RawImage UV, Unity's bottom-up convention; `t` is `_Time.y` (seconds). The vertex shader applies each panner **before** the texture ST transform:

```
noiseUV = (uv + (.006,0)*t) * (7,7)
maskUV  = (uv + (0,.008)*t) * (0,40) + (.37,0)
mainUV  = uv + sample(noise,noiseUV).r * .16
main    = sample(actor,mainUV)
mask    = sample(maskTexture,maskUV).r
alpha   = saturate(pow(main.r * mask,.6) * vertexColor.a * MainColor.a)
rgb     = pow(main.rgb * GlobalSfxIntensityScale * .5,.6) * vertexColor.rgb * MainColor.rgb
```

`_Gradient=1` makes the compiled horizontal clipping product zero; no clipping occurs in this material configuration. Texture samples repeat. This is a displaced, animated noisy scanline layer, not just a blue opacity tint. The fragment also reads `_Mask` at original actor UV; its default white multiplier is 1.

### Standard variant

Shader `gf_shader/vfx/UV_Effect_Base_Mask_Fast`, vertex blob 0 and fragment blob 32. The original `SenCharEff_CommunStart_holo_02` texture (32x128) is used for both mask and turbulence. Although the saved Material also assigns it to `_MainTex`, RawImage binds the actor render texture to `_MainTex` at draw time.

```
noiseUV = uv + (0,-.15)*t
noise   = sample(scanlineTexture,noiseUV).r
mainUV  = uv + noise * .06
main    = sample(actor,mainUV)
maskUV  = (uv + (0,.03)*t) * (1,5)
alpha   = main.a * sample(scanlineTexture,maskUV).r * vertexColor.a * MainColor.a
rgb     = main.rgb * GlobalSfxIntensityScale * vertexColor.rgb * MainColor.rgb
```

`_Dis=1` means the compiled `noise + _Dis - .5 < 0` discard does not remove normal nonnegative samples. Contrast and MainTexBrightness are 1.

Both materials use RGB `SrcAlpha, OneMinusSrcAlpha`; they are not additive blend materials. HDR blue color values can nonetheless brighten the output. The plot variant writes alpha with `Zero, OneMinusSrcAlpha`, while the standard writes `One, OneMinusSrcAlpha`.

## Exact shadow shader

`AdvGraphicObjectRenderTextureImage.Init` selects `ShaderManager.RenderTextureExt` for Custom rendering. That names `Unlit/Utage-RenderTextureExt`. `AdvGraphicObject.InitRenderTextureImage` sets the graphic's initial MaskHeight once; later command overrides are shader state, not actor-local crop coordinates.

Fragment program blob 1 consumes `_DarkRampMask` at material byte 80 and `_MaskHeight` at byte 84. Vertex blob 0 produces Unity ComputeScreenPos coordinates from the projected scene position. The shadow calculation is:

```
q = clamp(1 - screenUV.y - MaskHeight, 0, 1)
factor = 1 + DarkRampMask * (q^5 - 1)
output.rgb = adjustedSample.rgb * factor
output.a = adjustedSample.a
```

For browser coordinates measured downward from the scene's top, `q=clamp(sceneTopY-MaskHeight,0,1)`. This is a **screen-space** ramp, not an actor texture gradient. Letterbox bars must be excluded from the normalized scene viewport. Shadow does not reduce alpha. Setting MaskHeight=1 and DarkRampMask=1 creates an entirely black silhouette. M22003 rows 11/12, 37/38, and 77/78 use precisely those values.

## Browser implementation and remaining limits

### Closed-eye expressions

The user's recording reference for M22003:211 shows Friday with closed eyes.
Her recovered Idle expression explicitly overwrites both `ParamEyeLOpen` and
`ParamEyeROpen` with zero. The browser Cubism runtime then ran its default blink
controller after expressions and overwrote both values with one between blinks.
This caused the visible eye opening despite the correct expression asset.

The original `Live2D.Cubism.Framework.CubismEyeBlinkController` defaults to
`BlendMode = Multiply`; its focused decompilation is retained in
`.cache/gfl2-ilion-runtime/CubismEyeBlinkController.cs`. The browser adapter now
applies the same multiplication when the pinned SDK blink updates eye parameters.
Expression-defined closure and partial eye opening survive, while open-eye
expressions retain natural blinking. `gfl2-expression.spec.ts` reproduces the
original failure using the real Friday model, then tests 420 frames each of Idle
and the open-eye Serious expression across a deterministic blink cycle.

The KA-1-1 overlap was a separate lifecycle error. Original `AdvGraphicLayer.FadeOut`
keeps an outgoing object in its manager until a delayed fade starts. A repeated
`Character` in that interval updates the existing object and does not redraw it.
The old reducer instead removed it immediately and created a permanent replacement.
M22003 rows 34/35 resurrected 克莱妲投放, and rows 165/166 resurrected 白区女性.
Both should be gone at passage M22003:176. Pending delayed removals now suppress
those same-batch redraws, retain source fade/delay for playback, and allow fresh
draws on later passages. Repeated character commands also retain explicit shadow
height overrides. Focused decompilations are in `.cache/ilion-layout/`.

`event-removal.test.ts` covers this command sequence and explicit effect clearing.
`gfl2-scene-effects.spec.ts` checks the reported passage after reload, shadow
pixels against the recovered equation at 1× and 2× display density with letterboxing,
animated blue output against unfiltered original character pixels, and cached
texture loading for the second hologram variant when network requests fail.

`src/playback/gfl2/hologram-filter.ts` uses the recovered textures and scrolling UVs. Its browser composition was subsequently adjusted against the user's game reference, as described below. `shadow-filter.ts` provides the recovered screen-space equation. The actor rectangle passed to the hologram filter must be its actual original render crop in CSS screen coordinates, including camera/layer transform, rather than a tight alpha-only bound.

Not established by offline evidence: original runtime GlobalSfxIntensityScale/exposure, original UI framebuffer alpha processing, Unity HDR bloom, exact transient crossfades, and the original running game's speaker-dependent hologram material switch. The earlier browser composite preserved opaque actor coverage; the reference-guided follow-up below replaces that choice. Pixel-exact matching remains unverified.

## Follow-up audit against the user's original-game reference

The first browser port looked much brighter and more sharply striped than the original-game recording. A second source audit found three actual port defects and corrected them without fitting arbitrary color/opacity values to a screenshot:

1. The original texture objects specify repeat wrapping, bilinear filtering, and complete mip chains: mask_011x has 9 levels, mask_021_4x 10, standard scanline 8. The first port kept Pixi's default clamp wrap and called `fract(UV)` in the shader. That loses the original continuous texture derivatives at repeated boundaries. The port now uses hardware repeat and mipmapped linear sampling with continuous UVs.
2. The first port used Pixi's default fragment mediump math. The source DXBC is float32, and the fortyfold mask transform plus accumulated time needs adequate precision. The port now declares highp fragment floats.
3. The first port unpremultiplied actor RGB before the power/color calculation. The original DXBC directly consumes the sampled RGB. The port now does the same. This particularly affects antialiased or translucent model pixels.

Additional source findings: `_GlobalSfxIntensityScale` is set through `ODGGCGEMNGM.CBMLKHCFHKL`; its only managed caller found in the decoded Assembly-CSharp is `GameScene.IKGJPAEMAIK`, which selects `globalSfxIntensityScale` or `globalSfxIntensityScaleGodMode`. Both field initializers are **1**, so there is no support for reducing the browser's default intensity merely to match the screenshot. A particular serialized scene could override those fields; that remains unverified.

`AdvRenderTextureSpace.CreateTexture` uses `new RenderTexture(width,height,16,RenderTextureFormat.ARGB32)` with default read/write color space. Its Custom camera clears transparent and selects `GFRenderPipelineAsset_UI_Renderer`. The default read/write behavior follows active project color space. Installed `globalgamemanagers` is encrypted and was not decoded in this pass, so active project color space and native material property upload conversion remain unresolved. Texture metadata records `m_ColorSpace=1`; this alone does not establish the entire material/render-target/display conversion chain. No additional gamma transform was guessed.

The source explicitly multiplies all four blue color components, including alpha, by `2^2.2` when constructing the Color. That is not a port's accidental alpha scaling. The material's plot alpha-write behavior and the final SpriteCamera output composition also remain distinct from per-actor Pixi filter composition. Those require additional evidence before a claim of pixel-exact tone matching.

## Softer browser composition, 2026-10-16

The user's paired screenshots of 爵士 show a translucent, muted blue projection in the game and opaque, clipped cyan bands in the browser. Applying the recovered HDR overlay directly to the actor did not reproduce the game's final camera output. The earlier source audit established material math, not final visual fidelity.

The browser now uses a blue luminance tint at 62% opacity, scan-mask modulation between 0.97 and 1.03, and centered horizontal distortion of at most 0.001 actor widths. RGB and alpha are both scaled for Pixi's premultiplied blending. Before the delayed effect activates, the original actor remains unchanged. These are reference-guided SDR presentation values, not newly recovered game constants or a claim of pixel-exact reproduction.

The regression renders the real plot hologram over black and white backgrounds to check transmission, rejects clipped cyan bands, and checks that faint animation remains visible. It failed on transmission before the change. Browser checks also cover the standard material, cached texture loading, source shadows, and the reported 爵士 scene at M15033:204. Review screenshots are in `private-review/events/`.
