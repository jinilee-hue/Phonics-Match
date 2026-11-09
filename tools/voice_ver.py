"""Stamp a content version for every voice clip into src/data/voice.json ("ver": {file: md5[:8]}). core/audio.ts loads
each clip as voice/<file>?v=<ver>, so a re-recorded clip (same file name) is never played from a browser's cache —
GitHub Pages caches public/ files for 10 minutes, and right after a deploy the user heard the OLD theme line
("동물, 사물, 과일") over the new card order (user: "안내 순서가 안맞는데").
build_voice.py stamps it too; run this after any change to a clip outside the full build:
  python3 tools/voice_ver.py            (→ prints the files whose version changed)"""
import hashlib
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
VJ = ROOT / 'src' / 'data' / 'voice.json'


def versions(clips):
    files = sorted({c[0] for c in clips.values()})
    return {f: hashlib.md5((ROOT / 'public' / 'voice' / f).read_bytes()).hexdigest()[:8] for f in files}


if __name__ == '__main__':
    v = json.loads(VJ.read_text(encoding='utf-8'))
    old = v.get('ver', {})
    v['ver'] = versions(v['clips'])
    VJ.write_text(json.dumps(v, indent=0, ensure_ascii=False), encoding='utf-8')
    changed = sorted(f for f, h in v['ver'].items() if old.get(f) != h)
    print(f"{len(v['ver'])} clips stamped · changed: {changed if len(changed) < 12 else f'{len(changed)} files'}")
