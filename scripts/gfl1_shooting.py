"""Export installed William shooting models without substituting character art."""
import hashlib
import json
import math


def fade_motion(tree):
    """Convert native unweighted Unity Hermite curves to identical cubic Beziers."""
    curves = []
    segments_count = points_count = 0
    for curve_index, (name, curve) in enumerate(zip(tree['ParameterIds'], tree['ParameterCurves'], strict=True)):
        keys = curve['m_Curve']
        if not keys:
            continue
        if any(key['weightedMode'] != 0 for key in keys):
            raise ValueError('Weighted native shooting motion needs explicit conversion')
        segments = [keys[0]['time'], keys[0]['value']]
        points_count += 1
        for left, right in zip(keys, keys[1:]):
            dt = (right['time'] - left['time']) / 3
            if not math.isfinite(left['outSlope']) or not math.isfinite(right['inSlope']):
                segments.extend([2, right['time'], right['value']])
                points_count += 1
            else:
                segments.extend([1, left['time'] + dt, left['value'] + left['outSlope'] * dt,
                                 right['time'] - dt, right['value'] - right['inSlope'] * dt,
                                 right['time'], right['value']])
                points_count += 3
            segments_count += 1
        curves.append({'Target': 'Parameter', 'Id': name, 'Segments': segments,
                       'FadeInTime': tree['ParameterFadeInTimes'][curve_index],
                       'FadeOutTime': tree['ParameterFadeOutTimes'][curve_index]})
    return {'Version': 3, 'Meta': {'Duration': tree['MotionLength'], 'Fps': 30, 'Loop': True,
            'AreBeziersRestricted': True, 'CurveCount': len(curves), 'TotalSegmentCount': segments_count,
            'TotalPointCount': points_count, 'UserDataCount': 0, 'TotalUserDataSize': 0,
            'FadeInTime': tree['FadeInTime'], 'FadeOutTime': tree['FadeOutTime']}, 'Curves': curves}


def recover_shooting(resources, library, manifest):
    import UnityPy
    bundle = next(resources.glob('*live2dnewgunwilliam1.ab'))
    bundle_hash = hashlib.sha256(bundle.read_bytes()).hexdigest()
    env = UnityPy.load(str(bundle))
    base = 'assets/resources/dabao/live2dnew/gun/william_1/'
    relative = 'private/gfl1/live2d/' + bundle_hash[:20]
    provenance = []
    result = {}
    for native, role in [('destroy', 'target'), ('normal', 'gun')]:
        destination = library / relative / native
        destination.mkdir(parents=True, exist_ok=True)
        prefix = base + native + '/'
        models = {'Version': 3, 'FileReferences': {'Moc': 'model.moc3', 'Textures': ['texture_00.png'], 'Motions': {}}}
        clips = {}
        for source, ptr in env.container.items():
            if not source.startswith(prefix):
                continue
            record = {'asset': source, 'pathId': ptr.path_id, 'role': role}
            if source.endswith('model_moc.asset'):
                raw = bytes(ptr.read_typetree()['_bytes'])
                if raw[:4] != b'MOC3':
                    raise ValueError('Native model is not Cubism 3')
                (destination / 'model.moc3').write_bytes(raw)
            elif source.endswith('texture_00.png'):
                ptr.read().image.save(destination / 'texture_00.png', 'PNG')
                raw = (destination / 'texture_00.png').read_bytes()
            elif source.endswith('.motion3.json'):
                raw = ptr.read().m_Script.encode('utf-8', 'surrogateescape')
                name = source.rsplit('/', 1)[-1].removesuffix('.motion3.json')
                clips[name] = raw
            elif native == 'normal' and source.endswith('.fade.asset'):
                name = source.rsplit('/', 1)[-1].removesuffix('.fade.asset')
                raw = json.dumps(fade_motion(ptr.read_typetree()), allow_nan=False, separators=(',', ':')).encode()
                clips[name] = raw
                record['conversion'] = 'Unweighted Unity Hermite keyframes to equivalent cubic Bezier segments; infinite tangents retain native step interpolation'
            else:
                continue
            record.update(sha256=hashlib.sha256(raw).hexdigest(), bytes=len(raw))
            provenance.append(record)
        motion_map = {}
        for group, names in [('Idle', sorted(n for n in clips if n.startswith('daiji'))), ('Combo', sorted(n for n in clips if n.startswith('combo')))]:
            models['FileReferences']['Motions'][group] = []
            for index, name in enumerate(names):
                (destination / (name + '.motion3.json')).write_bytes(clips[name])
                models['FileReferences']['Motions'][group].append({'File': name + '.motion3.json'})
                motion_map[str((111 if group == 'Idle' else 201) + index)] = {'group': group, 'index': index, 'name': name}
        (destination / 'model3.json').write_text(json.dumps(models, indent=2), encoding='utf-8')
        result[role] = {'modelUrl': '/' + relative + '/' + native + '/model3.json', 'motions': motion_map}
    result['provenance'] = {'bundle': bundle.name, 'sha256': bundle_hash, 'models': provenance,
        'association': 'Native William_1 gun model bundle; normal atlas depicts commander gun, destroy atlas depicts injured William',
        'motionMapping': 'Numeric 111+ idle and 201+ combo mapping inferred from script and numbered native clips; negative control codes are not model motions',
        'wrapper': 'Script prefab name retained as association key; native wrapper behavior is not reconstructed from IL2CPP'}
    result['assets'] = ['/' + path.relative_to(library).as_posix() for path in sorted((library / relative).rglob('*')) if path.is_file()]
    manifest.setdefault('shooting', {})['NPC_William_live2d_2_New_Live2D'] = result
    manifest['sources'] = [s for s in manifest['sources'] if s['file'] != bundle.name] + [{'file': bundle.name, 'sha256': bundle_hash, 'bytes': bundle.stat().st_size}]
    return result
