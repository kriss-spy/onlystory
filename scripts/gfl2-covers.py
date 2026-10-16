"""Fetch event PV cover art published by the official GFL2 CN website."""
import hashlib
import json
from pathlib import Path
import sys
import subprocess
import urllib.request
from io import BytesIO

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, 'D:/Program Files/GF2Exilium/_reverse_engineering/dorm_legs_feet/assets/python_lib')
from PIL import Image

API = 'https://gf2-web-preregister-api.sunborngame.com/website/video_list?page=1&limit=200'
EVENTS = {
    'gfl2-daiyan-revised': (6, '异乡乐徽'),
    'gfl2-cafe-revised': (8, '方糖特调沙龙'),
    'gfl2-interwoven': (10, '交织突进'),
    'gfl2-trace': (12, '循迹追演'),
    'gfl2-quartet': (14, '狂想四重奏'),
    'gfl2-glass-island': (16, '玻璃岛的驻行者'),
    'gfl2-cn-4011': (19, '驻足之地'),
    'gfl2-cn-4012': (21, '拂晓的回响'),
    'gfl2-cn-4013': (23, '远日点'),
    'gfl2-cn-4015': (27, '逃离赛博格'),
    'gfl2-cn-4016': (29, '纪念日礼赞'),
    'gfl2-cn-4017': (31, '共诉隐匿时'),
    'gfl2-cn-4018': (33, '密米尔的返演'),
    'gfl2-cn-4020': (37, '烟火迎春归'),
    'gfl2-cn-4021': (39, '素银匿信'),
    'gfl2-cn-4022': (41, '匿影而行'),
    'gfl2-cn-4023': (43, '错位锚定'),
    'gfl2-cn-4025': (47, '镜茧与囚蝶'),
    'gfl2-cn-4026': (49, '心跳游乐园'),
    'gfl2-cn-4027': (51, '沉没夜潮'),
    'gfl2-cn-4028': (53, '火花之罪'),
    'gfl2-cn-4032': (57, '虚境新始'),
    'gfl2-cn-4033': (59, '歧路双规'),
    'gfl2-cn-4035': (63, '前进吧，王牌配送员！'),
    'gfl2-cn-4037': (65, '铸碑者的黎明'),
    'gfl2-cn-4039': (69, '信号波中毒依赖'),
    'gfl2-cn-4040': (71, '瑞骋迎春至'),
    'gfl2-cn-4041': (73, '月下安魂曲'),
    'gfl2-cn-4042': (75, '镜像冗余'),
    'gfl2-cn-4044': (79, '琥珀月光'),
    'gfl2-cn-4045': (81, '忒弥斯棋局'),
    'gfl2-cn-4046': (83, '梦中的永无岛'),
    'gfl2-cn-4050': (89, '寂静的匹丝缇'),
    # The publisher's API calls the initial 静默突触 PV 镜像突触.
    'gfl2-cn-4052': (93, '镜像突触'),
}


def fetch(url):
    return subprocess.check_output(['curl.exe', '--fail', '--silent', '--show-error', '--location', '--max-time', '20', '--retry', '2', '--retry-all-errors', url], timeout=70)


def main():
    response = json.loads(fetch(API))
    assert response['code'] == 0
    videos = {item['id']: item for item in response['data']['list']}
    path = ROOT / 'src/cover-art.json'
    artwork = json.loads(path.read_text('utf8'))
    output = ROOT / 'public/private/covers'
    output.mkdir(parents=True, exist_ok=True)
    for slug, (identity, title) in EVENTS.items():
        existing = artwork['events'].get(f'gfl2:{slug}', {})
        previous_file = ROOT / ('public' + existing.get('url', '/absent'))
        if existing.get('officialVideoId') == identity and previous_file.exists() and hashlib.sha256(previous_file.read_bytes()).hexdigest() == existing.get('sha256'):
            continue
        item = videos[identity]
        assert title in item['title'], (identity, item['title'])
        # The official CDN occasionally drops TLS for a desktop image. Its
        # separately published mobile PV cover remains the same event artwork.
        keys = ['pc_main_pic_url', 'phone_main_pic_url', 'pc_sub_pic_url', 'phone_sub_pic_url']
        for key in keys:
            url = item[key]
            assert url.startswith('https://gf2-cn.cdn.sunborngame.com/')
            try:
                data = fetch(url)
                with Image.open(BytesIO(data)) as image:
                    image.verify()
                break
            except (OSError, SyntaxError, TimeoutError, subprocess.SubprocessError):
                if key == keys[-1]:
                    raise
        sha = hashlib.sha256(data).hexdigest()
        destination = output / f'{slug}.{sha[:12]}{Path(url).suffix}'
        destination.write_bytes(data)
        with Image.open(destination) as image:
            width, height = image.size
            image.verify()
        artwork['events'][f'gfl2:{slug}'] = {
            'url': '/private/covers/' + destination.name, 'position': '50% 50%',
            'width': width, 'height': height, 'source': url,
            'page': 'https://gf2-mobile.sunborngame.com/Service',
            'api': API, 'officialVideoId': identity, 'officialTitle': item['title'],
            'sha256': sha,
        }
        print(f'{slug}: {width}x{height}', flush=True)
        path.write_text(json.dumps(artwork, ensure_ascii=False, indent=2) + '\n', 'utf8')


if __name__ == '__main__':
    main()
