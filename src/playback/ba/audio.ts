import type { BaAssets } from './types';
import { baResource } from './resources';
import { createAudioOutput } from '../audio-output';

export class BaAudio {
  readonly context = new AudioContext();
  private output = createAudioOutput(this.context);
  private musicBus = this.context.createGain();
  private soundBus = this.context.createGain();
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private music?: AudioBufferSourceNode;
  private sounds = new Set<AudioBufferSourceNode>();
  private playedSounds: string[] = [];
  private revision = 0;
  private soundRevision = 0;
  private current = 999;
  private disposed = false;
  private requests = new AbortController();
  constructor(
    private assets: BaAssets,
    private report: (message: string) => void,
    private blocked: (value: boolean) => void,
  ) {
    this.musicBus.connect(this.output.input);
    this.soundBus.connect(this.output.input);
    this.context.onstatechange = () => {
      if (!this.disposed) this.blocked(this.context.state !== 'running');
    };
    this.blocked(this.context.state !== 'running');
  }
  configure(music: number, sound: number) {
    this.musicBus.gain.value = Math.max(0, Math.min(1, music));
    this.soundBus.gain.value = Math.max(0, Math.min(1, sound));
  }
  async enable() {
    await this.context.resume();
    this.blocked(this.context.state !== 'running');
  }
  private buffer(url: string) {
    const pending = this.buffers.get(url);
    if (pending) return pending;
    const result = baResource(url, this.requests.signal)
      .then((r) => r.arrayBuffer())
      .then((b) => this.context.decodeAudioData(b));
    this.buffers.set(url, result);
    void result.catch(() => this.buffers.delete(url));
    return result;
  }
  async prepare() {
    await Promise.all(
      Object.entries(this.assets.sounds)
        .filter(
          ([name]) =>
            name === 'UI_FX_BG_UnderFire' ||
            name.startsWith('SFX_Emoticon_Motion_'),
        )
        .map(([, url]) => this.buffer(url)),
    );
  }
  setMusic(id: number) {
    if (this.disposed || id === this.current) return;
    this.current = id;
    const revision = ++this.revision;
    this.music?.stop();
    this.music = undefined;
    const asset = this.assets.music[id];
    if (!asset) return;
    void this.buffer(asset.url)
      .then((buffer) => {
        if (this.disposed || revision !== this.revision) return;
        const source = this.context.createBufferSource();
        const gain = this.context.createGain();
        gain.gain.value = asset.gain;
        source.buffer = buffer;
        source.loop = true;
        source.loopStart = Math.max(0, asset.loopStart);
        source.loopEnd =
          asset.loopEnd > asset.loopStart
            ? Math.min(buffer.duration, asset.loopEnd)
            : buffer.duration;
        source.connect(gain);
        gain.connect(this.musicBus);
        source.onended = () => {
          source.disconnect();
          gain.disconnect();
        };
        this.music = source;
        source.start();
      })
      .catch((e) => {
        if (!this.disposed) this.report(String(e));
      });
  }
  playSound(name: string) {
    if (this.disposed || !name) return;
    const url = this.assets.sounds[name];
    if (!url) {
      this.report(`Original sound unavailable: ${name}`);
      return;
    }
    const revision = this.soundRevision;
    void this.buffer(url)
      .then((buffer) => {
        if (this.disposed || revision !== this.soundRevision) return;
        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.connect(this.soundBus);
        this.sounds.add(source);
        this.playedSounds.push(name);
        if (this.playedSounds.length > 32) this.playedSounds.shift();
        source.onended = () => {
          this.sounds.delete(source);
          source.disconnect();
        };
        source.start();
      })
      .catch((e) => {
        if (!this.disposed) this.report(String(e));
      });
  }
  stopSounds() {
    this.soundRevision++;
    for (const sound of this.sounds) sound.stop();
    this.sounds.clear();
  }
  get diagnostics() {
    return {
      context: this.context.state,
      music: this.current,
      activeMusic: !!this.music,
      sounds: this.sounds.size,
      playedSounds: [...this.playedSounds],
      buffers: this.buffers.size,
      musicVolume: this.musicBus.gain.value,
      soundVolume: this.soundBus.gain.value,
    };
  }
  dispose() {
    this.disposed = true;
    this.revision++;
    this.requests.abort();
    this.music?.stop();
    this.stopSounds();
    this.output.disconnect();
    this.musicBus.disconnect();
    this.soundBus.disconnect();
    this.context.onstatechange = null;
    void this.context.close();
  }
}
