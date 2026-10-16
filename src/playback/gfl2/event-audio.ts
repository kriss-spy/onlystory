import type { AudioCue, EventProgram, SceneState } from './event-types';
import type { Sound } from './types';
import { createAudioOutput } from '../audio-output';
import { matchMedia } from '../../media-storage';

type Kind = 'music' | 'sfx';
interface Wanted {
  key: string;
  cue: string;
  kind: Kind;
  sound: Sound & { url: string };
  gain: number;
  initialGain: number;
  volumeFade: number;
  volumeDelay: number;
  fade: number;
  delay: number;
  fadeOut: number;
  instant: boolean;
  pending: boolean;
}
interface Playing {
  key: string;
  cue: string;
  kind: Kind;
  source: AudioBufferSourceNode;
  envelope: GainNode;
  gain: number;
  assetGain: number;
  fadeOut: number;
  retired: boolean;
}

const number = (value: string | undefined, fallback = 0) => {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
};
const volume = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/** Owns one mounted stage's audio. Original CRI cue scheduling is approximated
 * by the recovered waveform/layer map; source loop regions remain intact. */
export class EventAudio {
  private context: AudioContext;
  private buses: Record<Kind, GainNode>;
  private groupBuses: Record<Kind, GainNode>;
  private groupCommands: Partial<Record<Kind, string>> = {};
  private output: ReturnType<typeof createAudioOutput>;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private requests = new Set<AbortController>();
  private failed = new Set<string>();
  private missing = new Set<string>();
  private wanted = new Map<string, Wanted>();
  private loops = new Map<string, Playing>();
  private playing = new Set<Playing>();
  private revision = 0;
  private serial = 0;
  private disposed = false;
  private cache: Promise<Cache | null>;

  constructor(
    private program: EventProgram,
    private reportError: (message: string) => void,
    private audioBlocked: (blocked: boolean) => void,
  ) {
    this.context = new AudioContext();
    this.output = createAudioOutput(this.context);
    this.buses = {
      music: this.context.createGain(),
      sfx: this.context.createGain(),
    };
    this.groupBuses = {
      music: this.context.createGain(),
      sfx: this.context.createGain(),
    };
    this.groupBuses.music.connect(this.buses.music);
    this.groupBuses.sfx.connect(this.buses.sfx);
    this.buses.music.gain.value = 0.18;
    this.buses.sfx.gain.value = 0.8;
    this.buses.music.connect(this.output.input);
    this.buses.sfx.connect(this.output.input);
    this.context.onstatechange = () => {
      if (!this.disposed) this.audioBlocked(this.context.state !== 'running');
    };
    this.audioBlocked(this.context.state !== 'running');
    this.cache =
      'caches' in globalThis
        ? caches.open('onlystory.media.v1').catch(() => null)
        : Promise.resolve(null);
  }

  configure(musicVol: number, sfxVol: number) {
    if (this.disposed) return;
    this.buses.music.gain.setValueAtTime(
      volume(musicVol),
      this.context.currentTime,
    );
    this.buses.sfx.gain.setValueAtTime(
      volume(sfxVol),
      this.context.currentTime,
    );
  }

  async enable(): Promise<void> {
    if (this.disposed) return;
    await this.context.resume();
    if (this.disposed) return;
    this.audioBlocked(this.context.state !== 'running');
    // A rejected request can be retried by the explicit audio gesture.
    this.failed.clear();
    for (const wanted of this.wanted.values()) this.ensureLoop(wanted);
  }

  private async load(url: string): Promise<AudioBuffer | null> {
    if (this.disposed || this.failed.has(url)) return null;
    const existing = this.buffers.get(url);
    if (existing) {
      this.buffers.delete(url);
      this.buffers.set(url, existing);
      return existing;
    }
    const pending = this.loading.get(url);
    if (pending) return pending;
    const controller = new AbortController();
    this.requests.add(controller);
    const operation = (async () => {
      try {
        const cache = await this.cache;
        if (this.disposed) return null;
        const response =
          (await matchMedia(cache, url).catch(() => undefined)) ??
          (await fetch(url, { signal: controller.signal }));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        if (this.disposed) return null;
        const decoded = await this.context.decodeAudioData(bytes);
        if (this.disposed) return null;
        this.buffers.set(url, decoded);
        this.trimBuffers(url);
        return decoded;
      } catch {
        if (!this.disposed && !controller.signal.aborted) {
          this.failed.add(url);
          this.reportError(
            `Audio unavailable: ${url.split('/').at(-1)}. You can keep reading.`,
          );
        }
        return null;
      } finally {
        this.requests.delete(controller);
        this.loading.delete(url);
      }
    })();
    this.loading.set(url, operation);
    return operation;
  }

  private trimBuffers(keep?: string) {
    // A compressed music file can decode into tens of megabytes. Bound recent
    // inactive samples; active loop sources retain their own AudioBuffer.
    const active = new Set(
      [...this.wanted.values()].map((wanted) => wanted.sound.url),
    );
    let bytes = [...this.buffers.values()].reduce(
      (total, buffer) => total + buffer.length * buffer.numberOfChannels * 4,
      0,
    );
    for (const [url, buffer] of this.buffers) {
      if (bytes <= 96 * 1024 * 1024) break;
      if (url === keep || active.has(url)) continue;
      this.buffers.delete(url);
      bytes -= buffer.length * buffer.numberOfChannels * 4;
    }
  }

  private waveforms(cue: AudioCue, kind: Kind): Wanted[] {
    const asset = this.program.audio[cue.label];
    if (!asset) {
      if (!this.missing.has(cue.label)) {
        this.missing.add(cue.label);
        this.reportError(
          `Audio cue unavailable: ${cue.label}. You can keep reading.`,
        );
      }
      return [];
    }
    return (asset.layers ?? [asset]).flatMap((sound, index) =>
      sound.url
        ? [
            {
              key: `${kind}:${cue.label}:${index}:${sound.url}`,
              cue: cue.label,
              kind,
              sound: { ...sound, url: sound.url },
              gain: Math.max(
                0,
                number(cue.volume?.Arg2 ?? cue.command.Arg3, 1) *
                  (sound.gain ?? 1),
              ),
              initialGain: Math.max(
                0,
                number(cue.command.Arg3, 1) * (sound.gain ?? 1),
              ),
              fade: Math.max(0, number(cue.command.Arg6)),
              delay: Math.max(0, number(cue.command.Arg7)),
              volumeFade: Math.max(
                0,
                number(cue.volume?.Arg6 ?? cue.command.Arg6),
              ),
              volumeDelay: Math.max(0, number(cue.volume?.Arg7)),
              fadeOut: Math.max(
                0,
                number(cue.command.Arg5, kind === 'music' ? 0.2 : 0),
              ),
              instant: false,
              pending: false,
            },
          ]
        : [],
    );
  }

  private start(wanted: Wanted, buffer: AudioBuffer, loop: boolean): Playing {
    const source = this.context.createBufferSource();
    const envelope = this.context.createGain();
    source.buffer = buffer;
    source.loop = loop;
    source.loopStart = Math.max(
      0,
      Math.min(wanted.sound.loopStart ?? 0, buffer.duration),
    );
    source.loopEnd = Math.max(
      source.loopStart,
      Math.min(wanted.sound.loopEnd ?? buffer.duration, buffer.duration),
    );
    const now = this.context.currentTime;
    const fade = wanted.instant ? 0 : wanted.fade;
    const delay = wanted.instant ? 0 : wanted.delay;
    const initialGain = wanted.instant ? wanted.gain : wanted.initialGain;
    envelope.gain.value = fade ? 0 : initialGain;
    envelope.gain.setValueAtTime(fade ? 0 : initialGain, now);
    if (fade)
      envelope.gain.linearRampToValueAtTime(initialGain, now + delay + fade);
    if (!wanted.instant && initialGain !== wanted.gain) {
      const at = now + delay + wanted.volumeDelay;
      envelope.gain.cancelScheduledValues(at);
      envelope.gain.setValueAtTime(
        fade
          ? initialGain * Math.min(1, wanted.volumeDelay / fade)
          : initialGain,
        at,
      );
      if (wanted.volumeFade)
        envelope.gain.linearRampToValueAtTime(
          wanted.gain,
          at + wanted.volumeFade,
        );
      else envelope.gain.setValueAtTime(wanted.gain, at);
    }
    if (!loop && wanted.fadeOut > 0 && wanted.fadeOut < buffer.duration) {
      envelope.gain.setValueAtTime(
        wanted.gain,
        now + delay + buffer.duration - wanted.fadeOut,
      );
      envelope.gain.linearRampToValueAtTime(0, now + delay + buffer.duration);
    }
    source.connect(envelope);
    envelope.connect(this.groupBuses[wanted.kind]);
    const item: Playing = {
      key: wanted.key,
      cue: wanted.cue,
      kind: wanted.kind,
      source,
      envelope,
      gain: wanted.gain,
      assetGain: wanted.sound.gain ?? 1,
      fadeOut: wanted.fadeOut,
      retired: false,
    };
    this.playing.add(item);
    source.onended = () => this.release(item);
    // A seek has no original timeline time. Resume its active loop at the loop
    // region, while ordinary entry preserves the music's intro from sample 0.
    source.start(now + delay, loop && wanted.instant ? source.loopStart : 0);
    return item;
  }

  private release(item: Playing) {
    item.source.onended = null;
    item.source.disconnect();
    item.envelope.disconnect();
    this.playing.delete(item);
    if (this.loops.get(item.key) === item) this.loops.delete(item.key);
  }

  private stop(item: Playing, fade = 0, delay = 0) {
    if (item.retired) {
      if (!fade) {
        try {
          item.source.stop();
        } catch {
          /* Already stopped. */
        }
        this.release(item);
      }
      return;
    }
    item.retired = true;
    if (this.loops.get(item.key) === item) this.loops.delete(item.key);
    const now = this.context.currentTime;
    try {
      if ((fade || delay) && this.context.state === 'running') {
        item.envelope.gain.cancelScheduledValues(now);
        item.envelope.gain.setValueAtTime(
          item.envelope.gain.value,
          now + delay,
        );
        item.envelope.gain.linearRampToValueAtTime(0, now + delay + fade);
        item.source.stop(now + delay + fade);
      } else {
        item.source.stop();
        this.release(item);
      }
    } catch {
      this.release(item);
    }
  }

  private ensureLoop(wanted: Wanted) {
    const active = this.loops.get(wanted.key);
    if (active) {
      active.fadeOut = wanted.fadeOut;
      if (active.gain !== wanted.gain) {
        const now = this.context.currentTime;
        active.envelope.gain.cancelScheduledValues(now);
        active.envelope.gain.setValueAtTime(active.envelope.gain.value, now);
        const delay = wanted.instant ? 0 : wanted.volumeDelay;
        if (delay)
          active.envelope.gain.setValueAtTime(
            active.envelope.gain.value,
            now + delay,
          );
        if (!wanted.instant && wanted.volumeFade)
          active.envelope.gain.linearRampToValueAtTime(
            wanted.gain,
            now + delay + wanted.volumeFade,
          );
        else active.envelope.gain.setValueAtTime(wanted.gain, now + delay);
        active.gain = wanted.gain;
      }
      return;
    }
    if (wanted.pending) return;
    wanted.pending = true;
    void this.load(wanted.sound.url).then((buffer) => {
      wanted.pending = false;
      if (this.disposed || this.wanted.get(wanted.key) !== wanted || !buffer)
        return;
      this.loops.set(wanted.key, this.start(wanted, buffer, true));
    });
  }

  update(state: SceneState, options: { instant: boolean; changed: boolean }) {
    if (this.disposed) return;
    if (options.changed || options.instant) this.revision++;
    const revision = this.revision;
    for (const [kind, group] of [
      ['music', 'Bgm'],
      ['sfx', 'Se'],
    ] as const) {
      const command = state.soundVolumes?.[group];
      const identity = command
        ? `${command.sourceRow}:${command.Arg2}:${command.Arg6}:${command.Arg7}`
        : '';
      if (this.groupCommands[kind] === identity && !options.instant) continue;
      this.groupCommands[kind] = identity;
      const gain = this.groupBuses[kind].gain;
      const now = this.context.currentTime;
      const delay = options.instant ? 0 : Math.max(0, number(command?.Arg7));
      const fade = options.instant ? 0 : Math.max(0, number(command?.Arg6));
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      if (delay) gain.setValueAtTime(gain.value, now + delay);
      const value = Math.max(0, number(command?.Arg2, 1));
      if (fade) gain.linearRampToValueAtTime(value, now + delay + fade);
      else gain.setValueAtTime(value, now + delay);
    }
    if (options.changed && !options.instant)
      for (const command of state.audioVolumes ?? [])
        for (const item of this.playing) {
          const group = item.kind === 'music' ? 'Bgm' : 'Se';
          if (
            item.retired ||
            item.source.loop ||
            command.Arg1 !== group ||
            !item.cue.includes(command.Arg3)
          )
            continue;
          const now = this.context.currentTime;
          const gain = item.envelope.gain;
          const delay = Math.max(0, number(command.Arg7));
          const fade = Math.max(0, number(command.Arg6));
          const value = Math.max(0, number(command.Arg2, 1) * item.assetGain);
          gain.cancelScheduledValues(now);
          gain.setValueAtTime(gain.value, now);
          if (delay) gain.setValueAtTime(gain.value, now + delay);
          if (fade) gain.linearRampToValueAtTime(value, now + delay + fade);
          else gain.setValueAtTime(value, now + delay);
          item.gain = value;
        }
    // Seeking must also stop sounds from the old scene which have already
    // started. Normal text advance leaves currently audible one-shots alone.
    if (options.instant || this.context.state !== 'running')
      for (const item of [...this.playing])
        if (!item.source.loop || (options.instant && item.retired))
          this.stop(item);
    if (options.changed && !options.instant)
      for (const command of state.audioStops ?? [])
        for (const item of [...this.playing]) {
          const kind = command.Command === 'StopBgm' ? 'music' : 'sfx';
          if (
            item.kind === kind &&
            (!command.Arg1 || command.Arg1 === item.cue)
          )
            this.stop(
              item,
              Math.max(0, number(command.Arg6, 0.2)),
              Math.max(0, number(command.Arg7)),
            );
        }
    const desired = new Map<string, Wanted>();
    const cues: { cue: AudioCue; kind: Kind }[] = [
      ...(state.music ? [{ cue: state.music, kind: 'music' as const }] : []),
      ...state.ambience.map((cue) => ({ cue, kind: 'sfx' as const })),
    ];
    for (const { cue, kind } of cues)
      for (const waveform of this.waveforms(cue, kind)) {
        const wanted = this.wanted.get(waveform.key) ?? waveform;
        Object.assign(wanted, {
          gain: waveform.gain,
          initialGain: waveform.initialGain,
          volumeFade: waveform.volumeFade,
          volumeDelay: waveform.volumeDelay,
          fade: waveform.fade,
          delay: waveform.delay,
          fadeOut: waveform.fadeOut,
          instant: options.instant,
        });
        desired.set(wanted.key, wanted);
      }
    this.wanted = desired;
    this.trimBuffers();
    const incomingMusic = [...desired.values()].find(
      (wanted) => wanted.kind === 'music',
    );
    for (const [key, item] of this.loops)
      if (!desired.has(key))
        this.stop(
          item,
          options.instant
            ? 0
            : item.kind === 'music' && incomingMusic
              ? incomingMusic.fadeOut
              : item.fadeOut,
        );
    for (const wanted of desired.values()) this.ensureLoop(wanted);
    if (!options.changed || options.instant) return;
    for (const cue of state.shots)
      for (const wanted of this.waveforms(cue, 'sfx')) {
        wanted.key += `:shot:${++this.serial}`;
        void this.load(wanted.sound.url).then((buffer) => {
          if (this.disposed || revision !== this.revision || !buffer) return;
          this.start(wanted, buffer, false);
        });
      }
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
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.revision++;
    this.wanted.clear();
    for (const controller of this.requests) controller.abort();
    this.requests.clear();
    for (const item of [...this.playing]) this.stop(item);
    this.context.onstatechange = null;
    this.buses.music.disconnect();
    this.buses.sfx.disconnect();
    this.groupBuses.music.disconnect();
    this.groupBuses.sfx.disconnect();
    this.output.disconnect();
    this.buffers.clear();
    this.loading.clear();
    void this.context.close().catch(() => {});
  }
}
