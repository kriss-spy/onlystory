# Original GFL2 video voice languages

The installed game selects Chinese audio at zero-based USM track 0, Japanese at
track 1, and Korean at track 2. This is established by the game's managed code,
not the stream order or a guessed language tag.

## Source chain

The already recovered assembly is
`../onlystory-gfl2/resource_mapping/Assembly-CSharp.current.decoded.dll`, SHA-256
`5c580d8df29bb37d5f1f4070e81ea427d20e2c99cadcdb23f813cf212ddbd9ff`.
Existing ILSpy output is retained in `.cache/gfl2-ilion-videos/`:

- `CriWareAudioController.cs`, lines 712–725: `JDJGKDGAGPA()` reads
  `AccountNetCmdHandler.AFBNNAPBAMA()` and switches 0 to `CN`, 1 to `JP`, 2 to
  `KR`. SHA-256 `731198ec5b070e13cfaf5415e926f0661c03479ac9b22f49eba936904fa5104d`.
- `AccountNetCmdHandler.cs`, lines 4194–4200: `AFBNNAPBAMA()` reads the integer
  `AvgVoiceKey`. Lines 641–660: `BADFBCLHHHL` reads and writes the same setting;
  when absent it defaults to 1. SHA-256
  `89fd482a67381a04e6e800fc26c7e042cacaeb4c3d128fe3025d27233441d018`.
- `CriWareVideoPlayer.cs`, lines 285–290 and 420–423: the movie player passes
  `BADFBCLHHHL` directly to CRI `SetAudioTrack`, with an audio-stream-count
  check. SHA-256 `85bfd94792221dd9449409730907a9a6d82d662d269e085e325e48f711db6b45`.

These are static managed-decompilation observations. They have no REA Evidence
IDs and do not claim observed game execution. USM track indices are zero-based;
vgmstream's subsong `-s` selector is one-based.

## Browser export

`scripts/gfl2-videos.py` emits two single-audio MP4 files for every recovered
movie. Each keeps the original H264 picture packets and includes only the
selected original ADX stream, decoded with pinned vgmstream r2117 and encoded to
AAC 256 kbit/s. Separate files avoid depending on browser support for selecting
alternative audio tracks inside MP4.

The manifest's `voices['zh-CN']` and `voices.ja` entries contain the URL and
zero-based `sourceAudioTrack`. The base `url` aliases Chinese. The original
three-track files remain on disk so old URLs continue to resolve, but the active
manifest inventories only the new language files and existing subtitles.
Chinese WebVTT cues retain their original timing for both voice choices.

All eight outputs were checked for exactly one AAC stream and unchanged decoded
picture pixels over the first two seconds. Hashes and sizes are recorded in
`public/private/gfl2-ilion/videos/manifest.json`. Korean audio remains in the
original USM but is outside the two requested voice choices. Dialogue without
an original voice asset remains unvoiced.

Each exported AAC stream was also decoded and compared with the corresponding
original vgmstream WAV over its first 25 seconds (the whole clip for 12202).
All samples were finite; correlations ranged from 0.9963 to 0.9997. Results are
retained in `.cache/gfl2-ilion-videos/voice-audio-verification.json`.
