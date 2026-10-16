import type { Cubism4InternalModel } from 'pixi-live2d-display/cubism4';

export function applyOriginalBlinkBlend(internal: Cubism4InternalModel) {
  const blink = internal.eyeBlink;
  if (!blink) return;
  const update = blink.updateParameters.bind(blink);
  // Unity's CubismEyeBlinkController uses Multiply. The browser SDK instead
  // overwrites parameters after expressions, reopening deliberately closed eyes.
  // Its pinned blink implementation only calls this setter on the model.
  const target = Object.create(internal.coreModel) as typeof internal.coreModel;
  target.setParameterValueById =
    internal.coreModel.multiplyParameterValueById.bind(internal.coreModel);
  blink.updateParameters = (_model, seconds) => update(target, seconds);
}
