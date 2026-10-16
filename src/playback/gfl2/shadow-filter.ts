import { Filter } from 'pixi.js';

// Original Unlit/Utage-RenderTextureExt pixel shader. ComputeScreenPos uses
// the scene viewport, so the ramp must not move with an actor's own bounds.
export const SHADOW_GLSL = `
uniform float uShadowDarkness;
uniform float uShadowHeight;
uniform vec2 uSceneViewport;
float sceneShadow() {
  float screenTopY = (outputFrame.y + vTextureCoord.y * inputSize.y - uSceneViewport.x) / uSceneViewport.y;
  float q = clamp(screenTopY - uShadowHeight, 0.0, 1.0);
  return 1.0 + uShadowDarkness * (q*q*q*q*q - 1.0);
}`;

export class ShadowFilter extends Filter {
  constructor(resolution: number) {
    super(
      undefined,
      `
      varying vec2 vTextureCoord;
      uniform sampler2D uSampler;
      uniform highp vec4 inputSize;
      uniform highp vec4 outputFrame;
      ${SHADOW_GLSL}
      void main() {
        vec4 color = texture2D(uSampler, vTextureCoord);
        gl_FragColor = vec4(color.rgb * sceneShadow(), color.a);
      }
    `,
      { uShadowDarkness: 0, uShadowHeight: 0, uSceneViewport: [0, 720] },
    );
    this.resolution = resolution;
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
