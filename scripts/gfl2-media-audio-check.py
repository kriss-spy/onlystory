"""Compare first-scene original HCA, prior OGG and current OGG as decoded PCM.

Reports waveform fidelity against independent vgmstream/clHCA references,
clipping and spectrum. --candidate prior proves this detects the old defect.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, r'D:/Program Files/GF2Exilium/_reverse_engineering/dorm_legs_feet/assets/python_lib')
import numpy as np

KEY = 7152097263845921


def independent_reference(raw, metadata, name):
    spec = importlib.util.spec_from_file_location('gfl2_media', ROOT / 'scripts/gfl2-media.py')
    extractor = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(extractor)
    assert extractor.digest(extractor.VGMSTREAM) == extractor.DECODER['executableSha256'], 'Independent decoder identity mismatch'
    path = ROOT / f'.cache/gfl2-media/independent-{name}.wav'
    sidecar = path.with_suffix('.reference.json')
    identity = {'hcaSha256': extractor.digest(raw), 'decoder': extractor.DECODER}
    if path.exists() and sidecar.exists() and json.loads(sidecar.read_text(encoding='utf8')) == identity:
        return path
    raw.with_suffix('.hcakey').write_bytes(KEY.to_bytes(8, 'big') + metadata['awb_subkey'].to_bytes(2, 'big'))
    result = subprocess.run([str(extractor.VGMSTREAM), '-i', '-W', '4', '-o', str(path), str(raw)], capture_output=True)
    assert result.returncode == 0, result.stderr.decode(errors='replace')
    sidecar.write_text(json.dumps(identity, indent=2) + '\n', encoding='utf8')
    return path


def pcm(path, seconds, subkey=None):
    args = ['ffmpeg', '-hide_banner', '-loglevel', 'error']
    if subkey is not None:
        args += ['-hca_lowkey', str(KEY & 0xffffffff), '-hca_highkey', str(KEY >> 32), '-hca_subkey', str(subkey)]
    args += ['-i', str(path), '-t', str(seconds), '-ac', '2', '-ar', '48000', '-f', 'f32le', '-']
    result = subprocess.run(args, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr.decode())
    return np.frombuffer(result.stdout, dtype='<f4').reshape(-1, 2), result.stderr.decode()


def metrics(value):
    mono = value.mean(axis=1).astype(np.float64)
    windows = mono[:len(mono) // 4096 * 4096].reshape(-1, 4096)
    power = np.abs(np.fft.rfft(windows * np.hanning(4096), axis=1)) ** 2
    power = np.mean(power, axis=0)
    frequencies = np.fft.rfftfreq(4096, 1 / 48000)
    return {
        'samples': len(value),
        'pcmSha256': hashlib.sha256(value.tobytes()).hexdigest(),
        'peak': float(np.max(np.abs(value))),
        'rms': float(np.sqrt(np.mean(value.astype(np.float64) ** 2))),
        'clippedFraction': float(np.mean(np.abs(value) >= 1)),
        'dcOffset': float(np.mean(value)),
        'zeroCrossingRate': float(np.mean(np.diff(np.signbit(mono)))),
        'centroidHz': float(np.sum(frequencies * power) / np.sum(power)),
        'powerAbove12kHzFraction': float(np.sum(power[frequencies >= 12000]) / np.sum(power)),
        'spectralFlatness': float(np.exp(np.mean(np.log(power[1:] + 1e-20))) / np.mean(power[1:])),
    }


def main():
    sys.stdout.reconfigure(encoding='utf8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seconds', type=float, default=20)
    parser.add_argument('--music-volume', type=float, default=0.18)
    parser.add_argument('--sound-volume', type=float, default=0.8)
    parser.add_argument('--candidate', choices=['current', 'prior'], default='current')
    parser.add_argument('--verbose', action='store_true')
    args = parser.parse_args()
    prior = ROOT.parent / 'onlystory-gfl2/resource_mapping/audio'
    cache = ROOT / '.cache/gfl2-media/audio'
    report = {'seconds': args.seconds, 'candidate': args.candidate, 'assets': {}, 'mixes': {}}
    waves = {}
    for name, new, reference in [
        ('BGM_AVG_DesolateRuins.wave0', 'BGM_AVG_DesolateRuins.BGM_AVG_DesolateRuins.wave0', 'bgm'),
        ('BGE_Rep_Storm_02.wave31', 'BGE_AVG_Chapter01.BGE_Rep_Storm_02.wave31', 'storm31'),
        ('BGE_Rep_Storm_02.wave38', 'BGE_AVG_Chapter01.BGE_Rep_Storm_02.wave38', 'storm38'),
    ]:
        old_pcm, _ = pcm(prior / (name + '.ogg'), args.seconds)
        metadata = json.loads((cache / (new + '.json')).read_text(encoding='utf8'))
        candidate = prior / (name + '.ogg') if args.candidate == 'prior' else Path(metadata['output'])
        new_pcm, _ = pcm(candidate, args.seconds)
        hca_pcm, stderr = pcm(cache / (new + '.hca'), args.seconds, metadata['awb_subkey'])
        independent, _ = pcm(independent_reference(cache / (new + '.hca'), metadata, reference), args.seconds)
        count = min(len(old_pcm), len(new_pcm), len(hca_pcm), len(independent))
        old_pcm, new_pcm, hca_pcm, independent = old_pcm[:count], new_pcm[:count], hca_pcm[:count], independent[:count]
        difference = new_pcm.astype(np.float64) - hca_pcm
        noise = np.mean(difference ** 2)
        snr = float(10 * np.log10(np.mean(hca_pcm.astype(np.float64) ** 2) / noise)) if noise else None
        independent_error = new_pcm.astype(np.float64) - independent
        independent_noise = np.mean(independent_error ** 2)
        independent_snr = float(10 * np.log10(np.mean(independent.astype(np.float64) ** 2) / independent_noise)) if independent_noise else 999
        correlation = float(np.corrcoef(new_pcm.reshape(-1), independent.reshape(-1))[0, 1])
        report['assets'][name] = {
            'new': metrics(new_pcm), 'prior': metrics(old_pcm), 'nativeFfmpegHca': metrics(hca_pcm),
            'independentHca': metrics(independent), 'exportVsIndependentSnrDb': independent_snr,
            'exportVsIndependentCorrelation': correlation,
            'newVsPriorMaxAbsError': float(np.max(np.abs(new_pcm - old_pcm))),
            'exportVsNativeFfmpegSnrDb': snr,
            'hcaDecodeStderr': stderr,
        }
        waves[name] = new_pcm
    count = min(map(len, waves.values()))
    bgm = waves['BGM_AVG_DesolateRuins.wave0'][:count]
    storm = waves['BGE_Rep_Storm_02.wave31'][:count] + waves['BGE_Rep_Storm_02.wave38'][:count]
    report['mixes']['stormBedsAtUnity'] = metrics(storm)
    report['mixes']['readerVolumes'] = metrics(bgm * args.music_volume + storm * args.sound_volume)
    report['mixes']['allVolumesOne'] = metrics(bgm + storm)
    report['mixes']['musicOnly'] = metrics(bgm * args.music_volume)
    output = ROOT / f'.cache/gfl2-media/first-scene-audio-check-{args.candidate}.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf8')
    if args.verbose:
        print(json.dumps(report, indent=2))
    else:
        print('Candidate:', args.candidate)
        for name, asset in report['assets'].items():
            print(name, 'correlation', round(asset['exportVsIndependentCorrelation'], 6), 'SNR dB', round(asset['exportVsIndependentSnrDb'], 3), 'peak', round(asset['new']['peak'], 6), 'DC', round(asset['new']['dcOffset'], 8))
        mix = report['mixes']['readerVolumes']
        print('Default first-scene mix peak', round(mix['peak'], 6), 'clipped channel samples', int(round(mix['clippedFraction'] * mix['samples'] * 2)))
        print('Full measured report:', output)
    assert all(a['exportVsIndependentSnrDb'] > 20 and a['exportVsIndependentCorrelation'] > 0.99 for a in report['assets'].values()), 'Export does not match independent keyed clHCA reference PCM'
    if report['mixes']['readerVolumes']['clippedFraction']:
        raise SystemExit('FAIL: Default first-scene sum clips beyond full scale')


if __name__ == '__main__':
    main()
