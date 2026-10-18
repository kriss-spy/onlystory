"""Resolve logical cues through the installed AudioTemplate before decoding CRI banks."""
import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path


def load_verified_aliases(path=None):
    registry = json.loads(Path(path or Path(__file__).with_name('gfl1-audio-aliases.json')).read_text(encoding='utf-8'))
    if registry.get('version') != 1 or registry.get('region') != 'Steam EN':
        raise ValueError('Expected a Steam EN verified audio alias registry')
    result = {}
    for alias in registry.get('aliases', []):
        key = (alias.get('kind'), alias.get('cue'))
        if (key[0] not in {'bgm', 'sfx'} or not isinstance(key[1], str) or not key[1]
                or key in result or not isinstance(alias.get('stream'), str) or not alias['stream']
                or not re.fullmatch(r'[\w.-]+', alias.get('bank', '')) or '..' in alias['bank']
                or not re.fullmatch(r'[a-f0-9]{64}', alias.get('bankSha256', ''))
                or not isinstance(alias.get('evidence'), list) or not alias['evidence']):
            raise ValueError(f'Invalid or duplicate verified audio alias: {key}')
        for file in ([{'path': alias['bankSource'], 'sha256': alias['bankSha256']}] if alias.get('bankSource') else []) + alias.get('sidecars', []):
            relative = file.get('path', '')
            if (not isinstance(relative, str) or not relative.startswith('recovered-banks/')
                    or '\\' in relative or '..' in relative
                    or not re.fullmatch(r'[a-f0-9]{64}', file.get('sha256', ''))):
                raise ValueError(f'Invalid recovered native bank path: {key}')
        result[key] = alias
    return result


def audio_mapping(kind, cue, mappings, aliases):
    native = mappings.get(cue)
    alias = aliases.get((kind, cue))
    if alias is None:
        return native or {'stream': cue, 'bank': 'AVG' if kind == 'sfx' else 'BGM'}, None
    target = {'stream': alias['stream'], 'bank': alias['bank']}
    if native is not None and native != target:
        raise ValueError(f'Verified alias conflicts with the current AudioTemplate: {cue}')
    return target, alias


def reusable_audio(prior, kind, entry, bank_hash, library):
    return bool(prior and prior.get('kind') == kind and prior.get('template') == entry
                and prior.get('sha256') == bank_hash
                and (library / prior['url'].lstrip('/')).is_file())


def alias_scope_matches(alias, scripts):
    if not alias.get('sourceScopes'):
        return True
    approved = {(scope['script'], scope['row']) for scope in alias['sourceScopes']}
    tag = 'BGM' if alias['kind'] == 'bgm' else 'SE(?:[12])?'
    pattern = re.compile(r'<' + tag + r'>\s*' + re.escape(alias['cue']) + r'\s*</' + tag + '>')
    occurrences = {(script, row) for script, text in scripts.items()
                   for row, line in enumerate(text.splitlines(), 1) if pattern.search(line)}
    return bool(occurrences) and occurrences <= approved


def parse_template(text, categories=None):
    result = {}
    for line in text.splitlines():
        fields = line.split('//', 1)[0].strip().split('|')
        if len(fields) >= 4 and fields[1] and fields[2] and (categories is None or fields[0] in categories):
            result[fields[1]] = {'stream': fields[2], 'bank': fields[3]}
    return result


def find_stream(streams, name):
    matches = [s for s in streams if name in [n.strip() for n in s['streamInfo']['name'].split(';')]]
    if not matches:
        matches = [s for s in streams if name.casefold() in [n.strip().casefold() for n in s['streamInfo']['name'].split(';')]]
    if not matches:
        raise ValueError(f'Expected one CRI stream named {name}, found {len(matches)}')
    return min(matches, key=lambda stream: stream['streamInfo']['index'] or 1)


def discover_cues(text):
    stops = {'', 'Empty', 'SE_Empty', 'BGM_Empty', 'BGM_PAUSE'}
    shooting = {match.group(1).strip() for panel in re.findall(r'<ShootPanel>(.*?)</ShootPanel>', text, re.S)
                for field in re.findall(r'%%audio=([^%<]*)', panel)
                for item in field.split(',')
                if (match := re.fullmatch(r'(.+)-\d+(?:\.\d+)?', item.strip()))}
    return {'bgm': {cue.strip() for cue in re.findall(r'<BGM>(.*?)</BGM>', text)} - stops,
            'sfx': ({cue.strip() for cue in re.findall(r'<SE(?:[12])?>([^<>]*)</SE(?:[12])?>', text) if not cue.strip().startswith('Stop_')} | shooting) - stops}


def recover_audio(resources, output, library, manifest, vgmstream, ffmpeg):
    import UnityPy
    bundle = next(resources.glob('*assettextes.ab'))
    env = UnityPy.load(str(bundle))
    template = next(obj.read() for obj in env.objects if obj.type.name == 'TextAsset' and obj.read().m_Name == 'AudioTemplate')
    raw = template.m_Script.encode('utf-8', 'surrogateescape')
    (output / 'AudioTemplate.txt').write_bytes(raw)
    manifest['audioTemplate'] = {'bundle': bundle.name, 'asset': 'AudioTemplate', 'sha256': hashlib.sha256(raw).hexdigest()}
    manifest['sources'] = [s for s in manifest['sources'] if not s['file'].endswith('assettextes.ab')] + [{'file': bundle.name, 'sha256': hashlib.sha256(bundle.read_bytes()).hexdigest(), 'bytes': bundle.stat().st_size}]
    template_text = raw.decode('utf-8-sig')
    mappings = {'bgm': parse_template(template_text, {'AudioBGM'}), 'sfx': parse_template(template_text, {'AudioBT', 'AudioUI'})}
    aliases = load_verified_aliases()
    text = '\n'.join(manifest['scripts'].values())
    cues = discover_cues(text)
    manifest['missing'] = [m for m in manifest['missing'] if m['kind'] not in {'bgm', 'sfx'}]
    manifest['audio'] = {}
    manifest['sfx'] = {}
    cache_path = output / 'audio-cache.json'
    cached_audio = json.loads(cache_path.read_text(encoding='utf-8')) if cache_path.exists() else []
    previous = {p['cue']: p for p in cached_audio + manifest.get('audioProvenance', [])}
    manifest['audioProvenance'] = []
    inventories = {}
    for kind, names in cues.items():
        for cue in sorted(names):
            if not vgmstream or not ffmpeg:
                manifest['missing'].append({'kind': kind, 'cue': cue})
                continue
            try:
                entry, alias = audio_mapping(kind, cue, mappings[kind], aliases)
            except ValueError as error:
                manifest['missing'].append({'kind': kind, 'cue': cue, 'reason': str(error)})
                continue
            physical = entry['stream']
            if alias is not None and not alias_scope_matches(alias, manifest['scripts']):
                manifest['missing'].append({'kind': kind, 'cue': cue, 'reason': 'Source cue occurs outside the verified native-script repair scope.'})
                continue
            candidates = ([output / alias['bankSource']] if alias and alias.get('bankSource') else
                          [resources / (entry['bank'] + '.acb.bytes')] if alias else
                          [resources / (n + '.acb.bytes') for n in [physical, cue, entry['bank']] + (['AVG'] if kind == 'sfx' else [])])
            source = next((p for p in candidates if p.exists()), None)
            if source is None:
                manifest['missing'].append({'kind': kind, 'cue': cue, 'stream': physical, 'reason': 'No current AudioTemplate entry or exact stream/cue/bank file in installed Steam EN resources; original script cue retained without substituting another track.'})
                continue
            bank_hash = hashlib.sha256(source.read_bytes()).hexdigest()
            if alias is not None and bank_hash != alias['bankSha256']:
                manifest['missing'].append({'kind': kind, 'cue': cue, 'reason': 'Verified alias bank hash changed; native correspondence must be reviewed again.'})
                continue
            sidecars = []
            invalid_sidecar = False
            for file in alias.get('sidecars', []) if alias else []:
                sidecar = output / file['path']
                if not sidecar.is_file() or hashlib.sha256(sidecar.read_bytes()).hexdigest() != file['sha256']:
                    manifest['missing'].append({'kind': kind, 'cue': cue, 'reason': 'A verified native audio-bank sidecar is absent or has changed.'})
                    invalid_sidecar = True
                    break
                sidecars.append(sidecar)
                identity = {'file': file['path'], 'sha256': file['sha256'], 'bytes': sidecar.stat().st_size}
                manifest['sources'] = [s for s in manifest['sources'] if s['file'] != identity['file']] + [identity]
            if invalid_sidecar:
                continue
            identity = {'file': alias.get('bankSource', source.name) if alias else source.name, 'sha256': bank_hash, 'bytes': source.stat().st_size}
            manifest['sources'] = [s for s in manifest['sources'] if s['file'] != source.name] + [identity]
            prior = previous.get(cue)
            if reusable_audio(prior, kind, entry, bank_hash, library):
                manifest['audio' if kind == 'bgm' else 'sfx'][cue] = prior['url']
                manifest['audioProvenance'].append(dict(prior, **({'verifiedAlias': alias} if alias else {})))
                continue
            if source not in inventories:
                acb = output / source.name.removesuffix('.bytes')
                shutil.copyfile(source, acb)
                for sidecar in sidecars:
                    shutil.copyfile(sidecar, output / sidecar.name)
                for awb in [source.with_name(source.name.replace('.acb.bytes', '.awb.bytes')), source.with_name(source.name.replace('.acb.bytes', '.awb'))]:
                    if awb.exists():
                        shutil.copyfile(awb, acb.with_suffix('.awb'))
                inventory_path = output / (acb.name + '.streams.json')
                cached_inventory = json.loads(inventory_path.read_text(encoding='utf-8')) if inventory_path.exists() else {}
                if cached_inventory.get('sha256') == bank_hash:
                    streams = cached_inventory['streams']
                else:
                    info = subprocess.run([vgmstream, '-m', '-I', '-s', '1', '-S', '0', str(acb)], check=True, capture_output=True, text=True)
                    streams = [json.loads(line) for line in info.stdout.splitlines() if line.startswith('{')]
                inventories[source] = (acb, streams)
                (output / (acb.name + '.streams.json')).write_text(json.dumps({'sha256': bank_hash, 'streams': streams}, indent=2), encoding='utf-8')
            acb, streams = inventories[source]
            try:
                stream = find_stream(streams, physical)
            except ValueError as error:
                manifest['missing'].append({'kind': kind, 'cue': cue, 'stream': physical, 'reason': str(error)})
                continue
            duplicate = next((record for record in previous.values()
                              if record['sha256'] == bank_hash
                              and record['stream']['index'] == stream['streamInfo']['index']
                              and (library / record['url'].lstrip('/')).is_file()), None)
            if duplicate is not None:
                recovered = dict(duplicate, cue=cue, kind=kind, template=entry)
                recovered.pop('verifiedAlias', None)
                if alias:
                    recovered['verifiedAlias'] = alias
                manifest['audio' if kind == 'bgm' else 'sfx'][cue] = recovered['url']
                manifest['audioProvenance'].append(recovered)
                previous[cue] = recovered
                cache_path.write_text(json.dumps(list(previous.values()), indent=2), encoding='utf-8')
                continue
            print(f'Decoding {kind} {cue}', flush=True)
            index = stream['streamInfo']['index'] or 1
            wav = output / (cue + '.wav')
            subprocess.run([vgmstream, '-i', '-s', str(index), '-o', str(wav), str(acb)], check=True, capture_output=True)
            target = library / 'private/gfl1/audio' / (cue + '.ogg')
            target.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run([ffmpeg, '-v', 'error', '-y', '-i', str(wav), '-c:a', 'libvorbis', '-q:a', '5', str(target)], check=True)
            wav.unlink()
            media_hash = hashlib.sha256(target.read_bytes()).hexdigest()
            hashed = target.with_name(cue + '.' + media_hash[:20] + '.ogg')
            target.replace(hashed)
            manifest['audio' if kind == 'bgm' else 'sfx'][cue] = '/private/gfl1/audio/' + hashed.name
            manifest['audioProvenance'].append({'cue': cue, 'kind': kind, 'template': entry, 'bank': source.name,
                'sha256': bank_hash, 'stream': stream['streamInfo'], 'selection': 'First native name-matching subsong by bank index; exact case preferred', 'matchingStreamIndexes': [item['streamInfo']['index'] for item in streams if physical.casefold() in [n.strip().casefold() for n in item['streamInfo']['name'].split(';')]], 'sampleRate': stream['sampleRate'],
                'samples': stream['numberOfSamples'], 'loop': stream['loopingInfo'], 'url': '/private/gfl1/audio/' + hashed.name,
                'mediaSha256': media_hash})
            previous[cue] = manifest['audioProvenance'][-1]
            if alias:
                previous[cue]['verifiedAlias'] = alias
            cache_path.write_text(json.dumps(list(previous.values()), indent=2), encoding='utf-8')
