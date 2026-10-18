"""Bounded selection and media inventory for the GFL1 event milestone."""
import re

MILESTONE_CAMPAIGNS = (-1, -10, -11, -12, -13, -24, -25, -26, -27, -28, -41)


# One installed legacy TIP asset has verified GB18030 corner-bracket bytes.
# A hash guard prevents this exception from becoming encoding guessing.
LEGACY_ENCODINGS = {'-71-15-EXT': ('b85a53ff10befbfabf866c97eb8b67428ffa50311c41f39e74f4670595c17b54', 'gb18030')}


def decode_script(name, raw):
    import hashlib
    try:
        return raw.decode('utf-8-sig'), None
    except UnicodeDecodeError:
        expected = LEGACY_ENCODINGS.get(name)
        actual = hashlib.sha256(raw).hexdigest()
        if expected is None or actual != expected[0]:
            raise
        text = raw.decode(expected[1], errors='strict')
        if text.encode(expected[1], errors='strict') != raw:
            raise ValueError('Legacy source encoding failed exact round trip')
        return text, {'script': name, 'encoding': expected[1], 'sha256': actual,
                      'bytes': len(raw), 'roundTrip': True}


def select_scripts(texts, campaigns=(), extra_scripts=()):
    extra = {script.lower() for script in extra_scripts}
    return {name: text for name, text in texts.items()
            if name.lower() in extra or re.fullmatch(r'1-\d+-[12]', name)
            or any(name.startswith(f'{campaign}-') for campaign in campaigns)}


def expression_requests(text):
    expressions = {}
    for line in text.splitlines():
        header = line.split('||', 1)[0] if '||' in line else ''
        actors = re.split('[;；]', header)
        for value in re.findall(r'<Pic>(.*?)</Pic>', line):
            actors.extend(re.split(r'[\[\]&,]', value))
        for actor in actors:
            match = re.search(r'(?:^|>)([^()<>|；]+)\((\d+)\)', actor.strip())
            if match:
                name = match[1].strip().removesuffix('#隐身')
                expressions.setdefault(name, set()).add(int(match[2]))
    return expressions


def media_requests(text):
    backgrounds = {int(x) for x in re.findall(r'<BIN>(\d+)</BIN>', text)}
    for panel in re.findall(r'<ShootPanel>(.*?)</ShootPanel>', text, re.S):
        backgrounds.update(int(x) for x in re.findall(r'%%bgnum=(\d+)', panel))
    for value in re.findall(r'<CG>(.*?)</CG>', text):
        backgrounds.update(int(x.strip()) for x in value.split(',') if x.strip().isdigit())
    return sorted(backgrounds), set(expression_requests(text))


def native_event_campaigns(resources):
    import hashlib
    from importlib import import_module
    catalog = import_module('gfl1-catalog')
    table = resources / 'stc/5186.stc'
    raw = table.read_bytes()
    _, rows = catalog.decode_stc(raw, catalog.PLAYBACK_FIELDS)
    selected = []
    campaigns = []
    for row in rows:
        values = [int(value) for value in row['story_campaign_id'].split(',') if value]
        if values and all(value < 0 for value in values):
            selected.append(row['id'])
            campaigns.extend(values)
    story_table = resources / 'stc/5044.stc'
    story_raw = story_table.read_bytes()
    _, stories = catalog.decode_stc(story_raw, catalog.STORY_FIELDS)
    native_refs = set()
    for row in stories:
        if int(row['campaign']) not in campaigns:
            continue
        for field, keyed in [('start',False),('scripts',False),('first',False),('mid',False),('end',False),('fail',False),('round',True),('point',True),('step_start_story',True),('step_end_story',True)]:
            for script, _ in catalog.script_refs(row[field], keyed):
                native_refs.add(script.replace('\\','/').rsplit('/',1)[-1])
    return tuple(dict.fromkeys(campaigns)), {'mode':'all-native-events','table':table.name,
        'sha256':hashlib.sha256(raw).hexdigest(),'replayIds':selected,
        'nativeReferences': sorted(native_refs), 'storyTableSha256': hashlib.sha256(story_raw).hexdigest()}



def prime_caches(source, output):
    import shutil
    output.mkdir(parents=True, exist_ok=True)
    names = {'image-cache.json','prefab-index.json','audio-cache.json','gameplay-texture-cache.json'}
    for path in source.iterdir():
        if path.name in names or path.name.endswith('.streams.json'):
            destination = output / path.name
            if path.is_file() and not destination.exists():
                shutil.copy2(path, destination)
    if source.resolve() != output.resolve() and (source / 'recovered-banks').is_dir():
        shutil.copytree(source / 'recovered-banks', output / 'recovered-banks', dirs_exist_ok=True)
    seed = output / 'extraction-seed.json'
    if (source / 'extracted.json').is_file() and not seed.exists():
        shutil.copy2(source / 'extracted.json', seed)
