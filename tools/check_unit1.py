"""Are the five board animals FPR K Unit 1 (Lessons 1-5) words? Checked against the textbook ledger
(SAD·FPR 단어 연구 자료집 → ~/dev/sadfpr-studio/data/b2_book_FPRK.json; the same source Magic Block's words use).
Prints only words, lessons, pages and kinds (글 = printed, 그림 = picture) — never the textbook's sentences.
Also lists, per Unit 1 lesson, the words that start with the lesson's letter (to pick textbook animals from).
Run: python3 tools/check_unit1.py"""
import json, os, pathlib
from collections import defaultdict

B = json.loads(pathlib.Path(os.path.expanduser('~/dev/sadfpr-studio/data/b2_book_FPRK.json')).read_text(encoding='utf-8'))
print('keys:', sorted(B.keys()))
LU = {int(k): v for k, v in B['lu'].items()}
LP = {int(k): v for k, v in B['lp'].items()}
U1 = sorted(L for L, u in LU.items() if u == 1)
print('Unit 1 lessons:', U1, '· pages', {L: LP.get(L) for L in U1})
cards = B.get('cards', {})
print('picture-card pages:', {k: (v.get('title') or v.get('label') or '', len(v.get('cards', []))) for k, v in cards.items()})
P387 = set(cards.get('387', {}).get('cards', []))

KIND = {'printed': '글', 'picture': '그림', 'printed+picture': '글+그림'}
occ = defaultdict(lambda: defaultdict(set))          # lemma → lesson → {(page, kind)}
for r in B['rows']:
    L = r.get('lesson')
    if not L:
        continue
    occ[r['lemma']][L].add((r['page'], KIND.get(str(r.get('kind', '')).lower(), str(r.get('kind', '')))))

ANIMALS = [('monkey', 'm', 1), ('ant', 'a', 2), ('alligator', 'a', 2), ('seal', 's', 3), ('snake', 's', 3), ('tiger', 't', 4), ('pig', 'p', 5)]
print('\n== the five board animals ==')
for w, letter, want in ANIMALS:
    v = B['words'].get(w)
    les = occ.get(w, {})
    u1 = {L: sorted(x) for L, x in les.items() if LU.get(L) == 1}
    other = {L: sorted(p for p, _ in x) for L, x in les.items() if LU.get(L) != 1}
    print(f'{w:10s} /{letter}/ (Lesson {want}) · in FPR K: {"yes" if v else "NO"} · Unit 1: {u1 or "-"} · p387 card: {w in P387}'
          f' · other units: {{{", ".join(f"L{L}(U{LU.get(L)}) p{ps}" for L, ps in sorted(other.items()))}}}')

print('\n== Unit 1 words starting with each lesson letter (lesson pages + p387 cards) ==')
for L in U1:
    words = sorted(w for w, les in occ.items() if L in les)
    print(f'Lesson {L} (p{LP[L][0]}-{LP[L][1]}): {len(words)} words')
    for letter in 'mastp':
        hit = [w for w in words if w.startswith(letter)]
        if hit:
            print(f'   {letter}: {", ".join(hit)}')
print('p387 cards:', ', '.join(sorted(P387)))
