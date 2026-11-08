"""Animal words in FPR K by first letter (m a s t p): lessons, units, pages, 글/그림, p387 card — candidates for the board.
Prints words and page numbers only. Run: python3 tools/check_animals.py"""
import json, os, pathlib
from collections import defaultdict

B = json.loads(pathlib.Path(os.path.expanduser('~/dev/sadfpr-studio/data/b2_book_FPRK.json')).read_text(encoding='utf-8'))
LU = {int(k): v for k, v in B['lu'].items()}
LP = {int(k): v for k, v in B['lp'].items()}
P387 = set(B['cards']['387']['cards'])
KIND = {'printed': '글', 'picture': '그림', 'printed+picture': '글+그림'}
occ = defaultdict(lambda: defaultdict(set))
for r in B['rows']:
    if r.get('lesson'):
        occ[r['lemma']][r['lesson']].add((r['page'], KIND.get(str(r.get('kind', '')).lower(), str(r.get('kind', '')))))
lesson_of = lambda p: next((L for L, (a, b) in LP.items() if a <= p <= b), None)

ANIMALS = {
    'm': ['monkey', 'mouse', 'mole', 'moose', 'mule', 'moth', 'mosquito', 'mice'],
    'a': ['ant', 'alligator', 'ape', 'anteater', 'antelope', 'armadillo'],
    's': ['seal', 'snake', 'squirrel', 'swan', 'sheep', 'spider', 'skunk', 'starfish', 'snail', 'shark', 'sloth', 'seahorse', 'sparrow'],
    't': ['tiger', 'turtle', 'turkey', 'toad', 'tadpole', 'toucan'],
    'p': ['pig', 'panda', 'penguin', 'parrot', 'puppy', 'pup', 'pony', 'peacock', 'pelican', 'polar bear', 'porcupine', 'pigeon', 'poodle', 'possum', 'pet', 'pets'],
}
for letter, ws in ANIMALS.items():
    print(f'-- {letter} --')
    for w in ws:
        v = B['words'].get(w)
        if not v:
            continue
        les = occ.get(w, {})
        u1 = sorted((L, p, k) for L, xs in les.items() if LU.get(L) == 1 for p, k in xs)
        rest = sorted({L for L in les if LU.get(L) != 1})
        tg = [p for p in v.get('tg', []) if 9 <= p <= 76]
        print(f'  {w:10s} Unit1: {[f"L{L} p{p} {k}" for L, p, k in u1] or "-"}  p387: {w in P387}  TG(U1 pages): {tg or "-"}'
              f'  later: {[f"L{L}/U{LU.get(L)}" for L in rest] or "-"}')
