import {
  Filter,
  Texture,
  WRAP_MODES,
  MIPMAP_MODES,
  SCALE_MODES,
} from 'pixi.js';
import assets from '../../generated/gfl2-effects.json';
import { cachedResponse } from './resources';
import { SHADOW_GLSL } from './shadow-filter';

export type HologramTextures = {
  mask: Texture;
  turbulence: Texture;
  release: () => void;
};

export async function loadHologramTextures(
  effect: string,
  signal?: AbortSignal,
): Promise<HologramTextures> {
  const entry = (
    assets.effects as Record<string, { mask: string; turbulence: string }>
  )[effect];
  if (!entry) throw new Error(`Unknown GFL2 hologram material: ${effect}`);
  const loaded = new Map<string, Texture>();
  const release = () => {
    for (const texture of loaded.values()) texture.destroy(true);
    loaded.clear();
  };
  try {
    for (const url of new Set([entry.mask, entry.turbulence])) {
      const response = await cachedResponse(url, signal);
      const blob = URL.createObjectURL(await response.blob());
      try {
        const texture = await Texture.fromURL(blob);
        // Original Texture2D settings are bilinear, repeat, full mip chains.
        // Hardware repeat preserves derivatives across scanline boundaries.
        texture.baseTexture.wrapMode = WRAP_MODES.REPEAT;
        texture.baseTexture.setStyle(SCALE_MODES.LINEAR, MIPMAP_MODES.POW2);
        loaded.set(url, texture);
        signal?.throwIfAborted();
      } finally {
        URL.revokeObjectURL(blob);
      }
    }
    return {
      mask: loaded.get(entry.mask)!,
      turbulence: loaded.get(entry.turbulence)!,
      release,
    };
  } catch (error) {
    release();
    throw error;
  }
}

// Keep the recovered material textures and scrolling UVs, but composite for
// the browser's premultiplied SDR target. The game's final camera composition
// is not reproduced by applying its HDR overlay directly to an opaque actor.
export class HologramFilter extends Filter {
  constructor(effect: string, textures: HologramTextures, resolution: number) {
    super(
      undefined,
      `
      precision highp float;
      varying vec2 vTextureCoord;
      uniform sampler2D uSampler;
      uniform sampler2D uMask;
      uniform sampler2D uTurbulence;
      uniform highp vec4 inputSize;
      uniform highp vec4 outputFrame;
      uniform vec4 uActorFrame;
      uniform float uTime;
      uniform float uPlot;
      uniform float uHoloAlpha;
      ${SHADOW_GLSL}
      vec2 textureUV(vec2 unityUV) { return vec2(unityUV.x, 1.0-unityUV.y); }
      vec4 sourceAt(vec2 unityUV) {
        vec2 topUV=textureUV(unityUV);
        vec2 filterUV=(uActorFrame.xy+topUV*uActorFrame.zw-outputFrame.xy)/inputSize.xy;
        if(any(lessThan(topUV,vec2(0.0))) || any(greaterThan(topUV,vec2(1.0)))) return vec4(0.0);
        return texture2D(uSampler,filterUV);
      }
      void main() {
        vec2 pixel=outputFrame.xy+vTextureCoord*inputSize.xy;
        vec2 uv=textureUV((pixel-uActorFrame.xy)/uActorFrame.zw);
        vec4 original=texture2D(uSampler,vTextureCoord);
        vec2 noiseUV=mix(uv+vec2(0.0,-0.15)*uTime,(uv+vec2(0.006,0.0)*uTime)*7.0,uPlot);
        float noise=texture2D(uTurbulence,textureUV(noiseUV)).r;
        vec4 main=sourceAt(uv+vec2((noise-0.5)*0.002,0.0));

        vec2 maskUV=mix((uv+vec2(0.0,0.03)*uTime)*vec2(1.0,5.0),(uv+vec2(0.0,0.008)*uTime)*vec2(0.0,40.0)+vec2(0.37,0.0),uPlot);
        float mask=texture2D(uMask,textureUV(maskUV)).r;
        float luminance=dot(main.rgb,vec3(0.2126,0.7152,0.0722));
        vec3 tint=mix(main.rgb,vec3(luminance)*vec3(0.55,1.10,1.30),0.82);
        // Faint bands modulate the projection; they never become emissive bars.
        tint*=0.97+0.06*mask;
        float opacity=0.62;
        vec3 projected=tint*sceneShadow()*opacity;
        gl_FragColor=mix(original,vec4(projected,original.a*opacity),uHoloAlpha);
      }
    `,
      {
        uMask: textures.mask,
        uTurbulence: textures.turbulence,
        uPlot: effect === 'SenCharEff_Plot_CommunStart_holo_02' ? 1 : 0,
        uTime: 0,
        uHoloAlpha: 1,
        uActorFrame: [0, 0, 1280, 720],
        uShadowDarkness: 0,
        uShadowHeight: 0,
        uSceneViewport: [0, 720],
      },
    );
    this.resolution = resolution;
  }
  update(seconds: number) {
    this.uniforms.uTime = seconds;
  }
  setActorFrame(x: number, y: number, width: number, height: number) {
    this.uniforms.uActorFrame = [x, y, Math.max(1, width), Math.max(1, height)];
  }
  setShadow(
    darkness: number,
    height: number,
    top: number,
    sceneHeight: number,
  ) {
    this.uniforms.uShadowDarkness = darkness;
    this.uniforms.uShadowHeight = height;
    this.uniforms.uSceneViewport = [top, sceneHeight];
  }
}
