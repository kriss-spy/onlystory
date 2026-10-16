# Storage and codec research

Researched 2026-10-16 against the current import scripts and official codec, browser, and standards documentation. This note supports the implementation plan; it does not claim measured savings for future games.

## Quality-preserving defaults

Keep the original video encoding, store each unique asset once, and download only the requested events and voice languages. Try stronger lossless image compression only when the result is smaller and decoded samples match. Preserve the current audio delivery files until a separate audio quality policy is chosen. Changing already compressed audio to FLAC is an archival choice, not a storage optimization.

Use three different claims precisely:

- Byte-preserving means the stored file bytes match the source file.
- Stream-preserving means encoded media packets survive a container change without re-encoding.
- Sample-preserving means decoded pixels or audio samples match a declared reference, even though file bytes differ.

## Images

`scripts/gfl2-media.py:134` already exports backgrounds with Pillow's `lossless=True`. Therefore converting those backgrounds to lossless WebP again is not a new category of savings. Benchmark higher encoder effort on a representative sample and retain the smaller valid file.

Google's encoder distinguishes lossless mode from near-lossless preprocessing. Near-lossless preprocessing changes pixels. Lossless mode also needs `-exact` to retain RGB values under fully transparent pixels. `-q 100` in the default lossy mode is not a lossless setting. In lossless mode, quality controls compression effort. Preserve relevant color metadata as well as pixels. The encoder's default metadata setting is `none`. [Google cwebp documentation](https://developers.google.com/speed/webp/docs/cwebp).

For eligible static 8-bit images, benchmark `cwebp -lossless -exact -m 6 -q 100 -metadata all`. Compare decoded dimensions and all RGBA values, including transparent RGB, using a consistent decoder outside a browser canvas. Verify color profile behavior in the player. Do not replace files unless both validity and a positive size reduction are established. Pillow needs its own exact-preservation setting verified against the installed version; setting only `lossless=True` is insufficient evidence of exact hidden RGB preservation.

PNG supports 16-bit samples and color-space metadata. Keep PNG where converting to the selected WebP path reduces sample precision or loses required color behavior. Lossless PNG recompression can change compression choices without intentionally reducing sample precision. [W3C PNG specification](https://www.w3.org/TR/png/).

Exact image deduplication should compare decoded samples plus the metadata that affects rendering. Two images that look similar in a screenshot are not established duplicates. Preserve crop, dimensions, color interpretation, and alpha semantics.

## Movies

`scripts/gfl2-videos.py` currently copies the source H.264 video with `-c:v copy` into separate Chinese and Japanese MP4s. Each output contains the same picture stream and one AAC 256 kbit/s language track. This preserves the picture encoding while duplicating its storage across languages. Its current decoded-frame assertion checks only the first two seconds, so a migration should verify the whole movie.

FFmpeg stream copy routes encoded packets from demuxer to muxer without decoding and encoding. Transcoding introduces a decoder and encoder. Its documentation notes that lossless encoders generally produce much larger output than lossy encoding. [FFmpeg streamcopy and transcoding](https://ffmpeg.org/ffmpeg.html#Streamcopy).

The quality-preserving saving is to reuse one picture stream across events and languages. It is not to decode the existing lossy H.264 into a lossless video codec. Lossless re-encoding can preserve the already decoded picture, but cannot recover information absent from the source. There is no reason to assume it will shrink this source. This is an inference from the encoding model, not a measured benchmark. A new AV1, HEVC, or ordinary H.264 encode would require a separate lossy quality decision and playback checks.

Choose between these delivery designs after a small playback prototype:

| Design                                                                                       | Storage effect                                      | Constraint                                                                      |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------- |
| One selected-language MP4 per unique movie                                                   | Avoids downloading both current copies              | No shared picture storage if both languages are retained                        |
| One MP4 with both audio tracks                                                               | Stores picture once                                 | Native `audioTracks` switching has limited browser availability                 |
| Shared fragmented video plus selected fragmented audio, fed to one media element through MSE | Stores picture once and fetches only selected audio | Requires timestamp-aligned packaging, buffering, seek, and error handling       |
| Shared video element plus separate audio element                                             | Stores picture once                                 | Application must coordinate clocks, stalls, seeks, rates, and language switches |

Mozilla currently marks `HTMLMediaElement.audioTracks` as limited availability. A mux containing multiple tracks is not enough to guarantee that the app can select them everywhere. [Mozilla audioTracks documentation](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/audioTracks).

MSE supports one media element with audio and video track buffers, and does not require support for a particular codec. The ISO BMFF byte-stream format describes initialization and fragmented media segments; ordinary MP4 files cannot simply be assumed appendable. Feature-detect the complete codec string with `MediaSource.isTypeSupported`, then prove playback. The current MSE 2 document is a working draft, so use deployed APIs and test browsers explicitly. [W3C Media Source Extensions](https://www.w3.org/TR/media-source-2/), [W3C ISO BMFF byte-stream format](https://www.w3.org/TR/mse-byte-stream-format-isobmff/).

The recommendation is an MSE prototype with the existing AAC delivery quality, one shared H.264 stream, and one audio buffer for the chosen language. Preserve the current MP4 route as a compatibility fallback until start, pause, long playback, seek, resume after buffering, language change, and offline playback pass. Separate HTML audio/video elements need a measured synchronization strategy before production use; issuing two `play()` calls is not evidence of synchronization.

For N language copies, the ideal media payload changes from roughly `N * video + sum(audio)` to `video + sum(audio)`. Savings are approximately `(N - 1) * video`, before container overhead. This is a formula, not a promise that total storage falls by half.

## Audio

`scripts/gfl2-media.py` currently decodes HCA to float WAV with the pinned vgmstream decoder, trims to the source sample count, and encodes Vorbis quality 6. Movie audio takes decoded ADX to AAC. These are delivery transcodes with added lossy compression; they must not be described as lossless exports.

FLAC preserves integer PCM, supports verification during encoding, and does not natively support floating-point samples. Its output size depends on the signal. [Xiph FLAC FAQ](https://xiph.org/flac/faq.html).

Do not convert existing Vorbis or AAC files to FLAC to save space or improve fidelity. Such a conversion preserves at most their decoded result and usually costs more bytes. To avoid an added lossy generation, regenerate from the original game stream or a declared PCM reference. Because the existing decoder produces float WAV, blindly adding `-c:a flac` can quantize those samples. First choose an integer reference with a justified precision, or keep the float reference for archival purposes. Verify sample count, channels, rate, and decoded sample hashes against that reference. Do not claim recovery of pre-game-encoding audio.

The practical default is deduplicated current delivery audio and downloads limited to the selected voice language. Offer a separately measured preservation profile only if required. Record source hashes, decoder identity, sample format, and encoding settings so a future quality change can regenerate assets without confusing them with prior versions.

## Browser storage and large libraries

CacheStorage, IndexedDB, and OPFS share browser-managed storage limits for an origin. Default storage is best effort. Persistent storage can reduce automatic eviction but is subject to browser permission decisions and does not prevent the user from clearing data. Use `navigator.storage.estimate()` as an estimate, handle quota failure, request persistence in the download flow, and re-check actual asset presence before reporting availability. [WHATWG Storage Standard](https://storage.spec.whatwg.org/), [Mozilla quota and eviction documentation](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

A 20 GB library cannot be promised merely because the APIs exist. For example, Mozilla documents a Firefox best-effort group limit of 10 GiB, with different rules for persistent storage. Device free space, other origin data, browser policy, and private browsing still matter. Show actual managed bytes and required incremental bytes before download. [Mozilla storage limits](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

Cached movie playback must handle byte ranges. Chrome's Workbox guidance requires complete assets to be cached ahead of playback and a range-aware handler; a streamed partial `206` response is not a complete offline download. It also calls for CORS handling in its service-worker recipe. Apply the relevant parts to the actual serving design rather than assuming a CacheStorage match handles native media requests automatically. [Chrome cached audio and video guidance](https://developer.chrome.com/docs/workbox/serving-cached-audio-and-video).

For large movies, avoid reading a full cache entry into an application-held ArrayBuffer simply to serve a small range. Prototype bounded-memory range serving or segmented delivery. This is an implementation recommendation, not a claim that CacheStorage itself guarantees streaming behavior in every browser.

## Desktop disk and server storage

These are separate budgets in the proposed architecture:

- A server library stores each published shared asset once; episode manifests reference it by stable content identity. Downloading fewer files saves client disk and transfer but does not shrink the server's full library.
- A desktop library stores selected assets in an application-managed directory with an index, integrity checks, free-space handling, and explicit deletion. It needs a native host or local service that can serve files and ranges. Browser OPFS remains browser-managed storage and is not a substitute for this guarantee.
- Import working files, original archives, decoded WAVs, and delivery outputs have different lifetimes. Keep originals or reproducible provenance according to policy, and remove disposable intermediates only after outputs pass verification. Report those bytes separately from the player library.

For either storage backend, deduplicate by full content digest and confirm size before reuse. Keep per-event and per-language references. Deleting an event may delete a shared file only when no retained event, pending download, or Undo operation still needs it. A filename hash prefix alone should not be treated as a collision-proof identity. These are design recommendations derived from the current shared-media requirement.
