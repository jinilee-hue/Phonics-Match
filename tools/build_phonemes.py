"""Expected phonemes for the phonics-api read check -> src/data/phonemes.json {word: [ARPABET]}: every word of the three
themes (the w: clips in src/data/voice.json — the board words and every rival are among them), from the company
phonics-api's own G2P (phonics-kit/tools/papi.py g2p, cached). Re-run after adding a word.
usage: python3 tools/build_phonemes.py      (key: ~/.config/phonics-api/key — never printed)
"""
import json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(pathlib.Path.home() / 'Documents/Jini/2026/Phonics/phonics-kit/tools'))
import papi  # noqa: E402

words = sorted(k[2:] for k in json.loads((ROOT / 'src/data/voice.json').read_text())['clips'] if k.startswith('w:'))
table = papi.g2p(words, log=lambda *a: None)
(ROOT / 'src/data/phonemes.json').write_text(json.dumps(dict(sorted(table.items())), separators=(',', ':')) + '\n')
print(f'{len(table)} words -> src/data/phonemes.json')
