import type { Command, Opening } from './types';
import { createAudioOutput } from '../audio-output';

const num = (value: string | undefined, fallback = 0) =>
  Number.isFinite(parseFloat(value ?? '')) ? parseFloat(value!) : fallback;
const curves: Record<string, string> = {
  Linear: 'linear',
  EaseInSine: 'cubic-bezier(.47,0,.745,.715)',
  EaseOutSine: 'cubic-bezier(.39,.575,.565,1)',
};
interface Layer {
  label: string;
  layer: string;
  order: number;
  element: HTMLDivElement;
  shade: HTMLDivElement;
}
interface Playing {
  cue: string;
  kind: 'music' | 'sfx';
  source: AudioBufferSourceNode;
  envelope: GainNode;
  volume: GainNode;
}

// This adapter covers the recovered opening's commands. It is deliberately not
// the shared cross-game script format. Source rows and arguments stay intact.
export class Gfl2OpeningPlayer {
  private layers = new Map<string, Layer>();
  private animations = new Set<Animation>();
  private playing = new Set<Playing>();
  private pending = new Map<string, number>();
  private buffers = new Map<string, AudioBuffer>();
  private imageUrls = new Set<string>();
  private timers = new Set<number>();
  private context: AudioContext;
  private output: ReturnType<typeof createAudioOutput>;
  private ready: Promise<void>;
  private epoch = 0;
  private serial = 0;
  private index = -1;
  private disposed = false;
  private reduced = false;
  private volumes = { music: 0.18, sfx: 0.8 };

  constructor(
    private root: HTMLElement,
    private data: Opening,
    private report: (message: string) => void,
    private audioState: (blocked: boolean) => void,
  ) {
    this.context = new AudioContext();
    this.output = createAudioOutput(this.context);
    this.context.onstatechange = () => {
      if (!this.disposed) audioState(this.context.state === 'suspended');
    };
    audioState(this.context.state === 'suspended');
    const requested = new Set<string>();
    for (const step of data.steps)
      for (const command of step.commands) {
        if (command.Command !== 'Se' && command.Command !== 'Bgm') continue;
        const asset = data.assets.audio[command.Arg1];
        for (const sound of asset?.layers ?? (asset ? [asset] : []))
          if (sound.url) requested.add(sound.url);
      }
    this.ready = Promise.all(
      [...requested].map(async (url) => {
        try {
          const cache =
            'caches' in window
              ? await caches.open('onlystory.media.v1').catch(() => null)
              : null;
          const response = (await cache?.match(url)) ?? (await fetch(url));
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const buffer = await this.context.decodeAudioData(
            await response.arrayBuffer(),
          );
          if (!this.disposed) this.buffers.set(url, buffer);
        } catch {
          if (!this.disposed)
            report(
              `Audio unavailable: ${url.split('/').at(-1)}. You can keep reading.`,
            );
        }
      }),
    ).then(() => {});
  }

  configure(music: number, sfx: number, reduced: boolean) {
    this.volumes = { music, sfx };
    this.reduced = reduced;
    for (const item of this.playing)
      item.volume.gain.value = this.volumes[item.kind];
    if (reduced) for (const animation of this.animations) animation.finish();
  }
  async enableAudio() {
    await this.context.resume();
    this.audioState(this.context.state === 'suspended');
  }
  private delay(seconds: number, epoch: number) {
    if (!seconds) return Promise.resolve(epoch === this.epoch);
    return new Promise<boolean>((resolve) => {
      const timer = window.setTimeout(() => {
        this.timers.delete(timer);
        resolve(!this.disposed && epoch === this.epoch);
      }, seconds * 1000);
      this.timers.add(timer);
    });
  }
  private rank(layer: string) {
    return this.data.assets.layerOrders[layer] ?? 10;
  }
  private makeLayer(label: string, layerName: string) {
    const existing = this.layers.get(label);
    if (existing) return existing;
    const asset = this.data.assets.backgrounds[label];
    if (!asset) throw new Error(`Background unavailable: ${label}`);
    const element = document.createElement('div');
    element.className = 'native-layer';
    element.dataset.label = label;
    const layer: Layer = {
      label,
      layer: layerName || 'BgDefault',
      order: ++this.serial,
      element,
      shade: document.createElement('div'),
    };
    element.style.zIndex = String(this.rank(layer.layer) * 1000 + layer.order);
    if (asset.url) {
      const image = document.createElement('img');
      image.alt = '';
      void this.loadImage(image, asset.url, this.epoch);
      image.onerror = () => {
        if (!this.disposed)
          this.report(
            `Background unavailable: ${label}. You can keep reading.`,
          );
      };
      if (label === '白') image.style.objectFit = 'fill';
      element.append(image);
    } else element.style.background = asset.color ?? '#000';
    layer.shade.className = 'native-shader';
    element.append(layer.shade);
    this.root.append(element);
    this.layers.set(label, layer);
    return layer;
  }
  private async loadImage(image: HTMLImageElement, url: string, epoch: number) {
    let objectUrl: string | undefined;
    try {
      const cache =
        'caches' in window ? await caches.open('onlystory.media.v1') : null;
      const response = await cache?.match(url);
      if (response) objectUrl = URL.createObjectURL(await response.blob());
    } catch {
      /* Network paths still work when CacheStorage is disabled. */
    }
    if (this.disposed || epoch !== this.epoch) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      return;
    }
    if (objectUrl) this.imageUrls.add(objectUrl);
    image.src = objectUrl ?? url;
  }
  private async fade(
    layer: Layer,
    to: number,
    command: Command,
    epoch: number,
  ) {
    if (!(await this.delay(num(command.Arg7), epoch))) return;
    const duration = this.reduced ? 0 : num(command.Arg6, 0.2);
    if (duration) {
      const animation = layer.element.animate(
        [{ opacity: getComputedStyle(layer.element).opacity }, { opacity: to }],
        {
          duration: duration * 1000,
          easing: curves[command.Arg8] ?? 'linear',
          fill: 'forwards',
        },
      );
      this.animations.add(animation);
      await animation.finished.catch(() => {});
      this.animations.delete(animation);
      if (epoch !== this.epoch || this.disposed) return;
      layer.element.style.opacity = String(to);
      animation.cancel();
    } else layer.element.style.opacity = String(to);
  }
  private stopItem(item: Playing) {
    try {
      item.source.stop();
    } catch {
      /* Already ended. */
    }
    item.source.disconnect();
    item.envelope.disconnect();
    item.volume.disconnect();
    this.playing.delete(item);
  }
  private async playSound(command: Command, epoch: number, seek: boolean) {
    const asset = this.data.assets.audio[command.Arg1];
    if (!asset) throw new Error(`Unknown audio cue ${command.Arg1}`);
    const kind = command.Command === 'Bgm' ? 'music' : 'sfx';
    if (kind === 'music')
      this.stopSound({
        ...command,
        Command: 'StopBgm',
        Arg1: '',
        Arg6: '0',
        Arg7: '0',
      });
    const key = `${kind}:${command.Arg1}`;
    const ticket = ++this.serial;
    this.pending.set(key, ticket);
    await this.ready;
    if (
      this.disposed ||
      epoch !== this.epoch ||
      this.pending.get(key) !== ticket
    )
      return;
    for (const sound of asset.layers ?? [asset]) {
      if (!sound.url) continue;
      const loop = sound.loop ?? command.Arg2.toLowerCase() === 'true';
      if (seek && !loop) continue;
      const buffer = this.buffers.get(sound.url);
      if (!buffer) continue;
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.loop = loop;
      source.loopStart = sound.loopStart ?? 0;
      source.loopEnd = Math.min(
        sound.loopEnd ?? buffer.duration,
        buffer.duration,
      );
      const envelope = this.context.createGain();
      const volume = this.context.createGain();
      const gain = num(command.Arg3, 1) * (sound.gain ?? 1);
      const now = this.context.currentTime;
      envelope.gain.setValueAtTime(num(command.Arg6) && !seek ? 0 : gain, now);
      if (num(command.Arg6) && !seek)
        envelope.gain.linearRampToValueAtTime(gain, now + num(command.Arg6));
      if (!loop && num(command.Arg5) && num(command.Arg5) < buffer.duration) {
        envelope.gain.setValueAtTime(
          gain,
          now + buffer.duration - num(command.Arg5),
        );
        envelope.gain.linearRampToValueAtTime(0, now + buffer.duration);
      }
      volume.gain.value = this.volumes[kind];
      source.connect(envelope);
      envelope.connect(volume);
      volume.connect(this.output.input);
      const item: Playing = {
        cue: command.Arg1,
        kind,
        source,
        envelope,
        volume,
      };
      this.playing.add(item);
      source.onended = () => {
        source.disconnect();
        envelope.disconnect();
        volume.disconnect();
        this.playing.delete(item);
      };
      source.start(0, seek && loop ? source.loopStart : 0);
    }
  }
  private stopSound(command: Command) {
    const kind = command.Command === 'StopBgm' ? 'music' : 'sfx';
    for (const key of this.pending.keys())
      if (
        key.startsWith(`${kind}:`) &&
        (!command.Arg1 || key === `${kind}:${command.Arg1}`)
      )
        this.pending.delete(key);
    for (const item of this.playing)
      if (item.kind === kind && (!command.Arg1 || item.cue === command.Arg1)) {
        const now = this.context.currentTime;
        const delay = num(command.Arg7);
        const duration = num(command.Arg6, 0.2);
        item.envelope.gain.cancelScheduledValues(now);
        item.envelope.gain.setValueAtTime(
          item.envelope.gain.value,
          now + delay,
        );
        item.envelope.gain.linearRampToValueAtTime(0, now + delay + duration);
        item.source.stop(now + delay + duration);
      }
  }
  private async execute(
    command: Command,
    epoch: number,
    seek: boolean,
  ): Promise<void> {
    const name = command.Command;
    if (name === 'ChangeMessageWindow') return;
    if (name === 'Bg') {
      const layer = this.makeLayer(command.Arg1, command.Arg3);
      if (seek) layer.element.style.opacity = '1';
      else {
        layer.element.style.opacity = '0';
        await this.fade(layer, 1, command, epoch);
      }
    } else if (name === 'BgOff') {
      const layers = [...this.layers.values()].filter(
        (layer) => layer.label === command.Arg1 || layer.layer === command.Arg1,
      );
      await Promise.all(
        layers.map(async (layer) => {
          if (!seek) await this.fade(layer, 0, command, epoch);
          if (epoch === this.epoch) {
            layer.element.remove();
            this.layers.delete(layer.label);
          }
        }),
      );
    } else if (name === 'ChangeLayer') {
      const layer = this.layers.get(command.Arg1);
      if (layer) {
        layer.layer = command.Arg3;
        layer.element.style.zIndex = String(
          this.rank(layer.layer) * 1000 + layer.order,
        );
      }
    } else if (name === 'SetShaderFloat') {
      const layer = this.layers.get(command.Arg1);
      if (!layer) return;
      const value = num(command.Arg4, num(command.Arg3));
      if (command.Arg2 === '_DarkRampMask')
        layer.shade.style.background = `linear-gradient(transparent,rgba(0,0,0,${Math.max(0, Math.min(1, value))}))`;
      else if (command.Arg2 === '_MaskHeight')
        layer.shade.style.clipPath = `inset(${Math.max(0, 1 - value) * 100}% 0 0)`;
      else throw new Error(`Unsupported shader parameter: ${command.Arg2}`);
    } else if (name === 'Tween') {
      if (command.Arg2 !== 'PunchPosition')
        throw new Error(`Unsupported tween: ${command.Arg2}`);
      if (seek || this.reduced) return;
      const parameters = Object.fromEntries(
        [...command.Arg3.matchAll(/(\w+)\s*=\s*([-\d.]+)/g)].map((match) => [
          match[1],
          Number(match[2]),
        ]),
      );
      if (!(await this.delay(parameters.start ?? 0, epoch))) return;
      const layer = this.layers.get(command.Arg1);
      if (!layer) return;
      const scale = this.root.clientHeight / 1080;
      const x = (parameters.x ?? 0) * scale;
      const y = (parameters.y ?? 0) * scale;
      const animation = layer.element.animate(
        [0, 1, -0.7, 0.4, -0.2, 0].map((gain) => ({
          transform: `translate(${x * gain}px,${y * gain}px)`,
        })),
        { duration: (parameters.time ?? 1) * 1000, easing: 'ease-in-out' },
      );
      this.animations.add(animation);
      await animation.finished.catch(() => {});
      this.animations.delete(animation);
    } else if (name === 'Bgm' || name === 'Se')
      await this.playSound(command, epoch, seek);
    else if (name === 'StopBgm' || name === 'StopSe')
      this.stopSound(seek ? { ...command, Arg6: '0', Arg7: '0' } : command);
    else if (name === 'Wait') {
      if (!seek) await this.delay(num(command.Arg1), epoch);
    } else
      throw new Error(
        `Unsupported command ${name} at source row ${command.sourceRow}`,
      );
  }
  async show(index: number) {
    const seek = index !== this.index + 1;
    if (seek) this.reset();
    const epoch = this.epoch;
    const from = seek ? 0 : index;
    this.index = index;
    for (let i = from; i <= index; i++)
      for (const command of this.data.steps[i].commands) {
        if (this.disposed || epoch !== this.epoch) return;
        const effect = this.execute(command, epoch, seek);
        if (
          seek ||
          ['Default', 'Skippable', 'SkippableOnWaitThread'].includes(
            command.WaitType,
          )
        )
          await effect;
        else
          void effect.catch((error) => {
            if (!this.disposed && epoch === this.epoch)
              this.report(error.message);
          });
      }
  }
  private reset() {
    this.epoch++;
    this.pending.clear();
    for (const animation of this.animations) animation.cancel();
    this.animations.clear();
    for (const item of this.playing) this.stopItem(item);
    for (const layer of this.layers.values()) layer.element.remove();
    this.layers.clear();
    for (const url of this.imageUrls) URL.revokeObjectURL(url);
    this.imageUrls.clear();
  }
  dispose() {
    this.disposed = true;
    this.reset();
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.output.disconnect();
    void this.context.close();
  }
  get diagnostics() {
    return {
      context: this.context.state,
      buffers: this.buffers.size,
      playing: [...this.playing].map((item) => ({
        cue: item.cue,
        kind: item.kind,
        loop: item.source.loop,
        loopStart: item.source.loopStart,
        loopEnd: item.source.loopEnd,
      })),
      layers: [...this.layers.keys()],
    };
  }
}
