"""Are all the board animals (src/data/animals.ts LETTERS) FPR K words? Checked against the textbook ledger
(SAD·FPR 단어 연구 자료집 → ~/dev/sadfpr-studio/data/b2_book_FPRK.json, the source tools/check_unit1.py uses).
Prints only words, units, lessons and page counts (글 = printed, 그림 = picture) — never the textbook's sentences.
Exit 1 if any board animal is not in FPR K (user: "교재 k레벨에 없는 동물은 빼고 있는걸로만 넣어줘").
Run: python3 tools/check_fprk.py"""
import json, os, pathlib, re, sys
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parent.parent
B = json.loads(pathlib.Path(os.path.expanduser('~/dev/sadfpr-studio/data/b2_book_FPRK.json')).read_text(encoding='utf-8'))
LU = {int(k): v for k, v in B['lu'].items()}
src = (ROOT / 'src/data/animals.ts').read_text()
letters = {}                                                # every theme's words (THEMES in animals.ts), as theme:letter
for tm in re.finditer(r"\n  (\w+): \{ prefix: '\w+', letters: \{(.*?)\},\s*units:", src, re.S):
    for m in re.finditer(r"(\w+): \[([^\]]*)\]", tm.group(2)):
        letters.setdefault(f'{tm.group(1)[:3]}:{m.group(1)}', []).extend(re.findall(r"'([a-z]+)'", m.group(2)))
if not letters: sys.exit('no THEMES found in src/data/animals.ts')
cards = {int(k): set(v.get('cards', [])) for k, v in B.get('cards', {}).items()}
occ = defaultdict(lambda: {'units': set(), 'lessons': set(), 'pic': 0, 'txt': 0})
for r in B['rows']:
    o = occ[r['lemma']]
    L = r.get('lesson')
    if L:
        o['lessons'].add(L); o['units'].add(LU.get(L))
    k = str(r.get('kind', '')).lower()
    o['pic'] += 'picture' in k
    o['txt'] += 'printed' in k
bad = []
print(f'{"letter":6s} {"word":10s} {"units":12s} {"lessons":22s} 그림 글  card pages')
for l, ws in letters.items():
    for w in ws:
        o = occ.get(w)
        cp = sorted(p for p, c in cards.items() if w in c)
        if not o and not cp:
            bad.append(w); print(f'{l:6s} {w:10s} NOT IN FPR K'); continue
        o = o or {'units': set(), 'lessons': set(), 'pic': 0, 'txt': 0}
        print(f'{l:6s} {w:10s} {",".join(f"U{u}" for u in sorted(x for x in o["units"] if x)):12s} '
              f'{",".join(f"L{x}" for x in sorted(o["lessons"]))[:22]:22s} {o["pic"]:4d} {o["txt"]:3d}  {cp or ""}')
print(f'\n{sum(map(len, letters.values()))} words on {len(letters)} theme letters ·', f'NOT FPR K: {bad}' if bad else 'all FPR K words')
sys.exit(1 if bad else 0)
