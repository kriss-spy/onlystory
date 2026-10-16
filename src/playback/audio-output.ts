/** Combine original tracks without clipping the device output when their
 * independent volume controls are high. Quieter audio passes at unity gain. */
export function createAudioOutput(context: BaseAudioContext) {
  const output = context.createDynamicsCompressor();
  output.threshold.value = -3;
  output.knee.value = 0;
  output.ratio.value = 20;
  output.attack.value = 0;
  output.release.value = 0.05;
  // Web Audio adds automatic makeup gain. Cancel that fixed boost so quiet
  // tracks retain their volume and recovered peaks have output headroom.
  // https://www.w3.org/TR/webaudio/#computing-the-makeup-gain
  const normalize = context.createGain();
  const makeupDb = -output.threshold.value * (1 - 1 / output.ratio.value) * 0.6;
  normalize.gain.value = 10 ** (-makeupDb / 20);
  output.connect(normalize);
  normalize.connect(context.destination);
  return {
    input: output,
    disconnect() {
      output.disconnect();
      normalize.disconnect();
    },
  };
}
