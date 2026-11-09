"""Grid search for the reading rule on tools/qa/stt_eval.ts's output.
usage: python3 tools/qa/stt_grid.py <eval.json>
rule = exact OR (gap < G AND rgap < V AND sT > M AND pNo < N)
  exact : the free transcript is the word (src/core/readCheck.ts exactReading, computed by the game's code)
  gap   : log P(free transcript) - log P(target or one of its alts)
  rgap  : best rival (rivals starting with a letter in X are left out, like RULE.freeOnsets) - target
  sT    : log P(target or one of its alts) — tiny for audio that isn't the word
Prints the current rule, then the best rules: correct readings per voice / condition vs everything that must fail."""
import itertools
import json
import sys
from collections import defaultdict

R = json.load(open(sys.argv[1]))
for r in R:
    r['gap'] = r['sFree'] - r['sT']


def rgap(r, X):
    v = [s for w, s in r['rv'].items() if w[0].lower() not in X]
    return (max(v) - r['sT']) if v else -99


def make(G, V, M, N, X='b'):
    return lambda r: r['exact'] or (r['gap'] < G and rgap(r, X) < V and r['sT'] > M and r['pNo'] < N)


POS = [r for r in R if r['should']]
NEG = [r for r in R if not r['should']]
POS_GROUPS = sorted({r['voice'] for r in POS})
NEG_KINDS = sorted({r['kind'] for r in NEG})


def rates(rule):
    pv = {v: 100 * sum(rule(r) for r in POS if r['voice'] == v) / max(1, sum(1 for r in POS if r['voice'] == v)) for v in POS_GROUPS}
    pk = {k: 100 * sum(rule(r) for r in POS if r['kind'] == k) / max(1, sum(1 for r in POS if r['kind'] == k)) for k in sorted({r['kind'] for r in POS})}
    nk = {k: 100 * sum(rule(r) for r in NEG if r['kind'] == k) / max(1, sum(1 for r in NEG if r['kind'] == k)) for k in NEG_KINDS}
    pos = 100 * sum(rule(r) for r in POS) / len(POS)
    neg = 100 * sum(rule(r) for r in NEG) / len(NEG)
    speech = [r for r in NEG if r['kind'] not in ('music', 'noise')]
    sp = 100 * sum(rule(r) for r in speech) / max(1, len(speech))
    return pos, neg, sp, pv, pk, nk


def show(label, rule):
    pos, neg, sp, pv, pk, nk = rates(rule)
    print(f'{label:34s} pass {pos:5.1f}% | wrong pass {neg:5.1f}% (speech {sp:5.1f}%)')
    print('   voices  ' + ' '.join(f'{v}:{x:.0f}' for v, x in pv.items()))
    print('   kinds   ' + ' '.join(f'{v}:{x:.0f}' for v, x in pk.items()))
    print('   wrong   ' + ' '.join(f'{v}:{x:.0f}' for v, x in nk.items()))


COUNTS = ', '.join(f"{k} {sum(1 for r in NEG if r['kind'] == k)}" for k in NEG_KINDS)
print(f'{len(POS)} must pass · {len(NEG)} must not ({COUNTS})')
show('Jenga rule gap<8 rgap<2 sT>-10', make(8, 2, -10, 0.5))
show('RULE gap<6 rgap<2 sT>-7.5 pNo<.5', make(6, 2, -7.5, 0.5))
best = []
for G, V, M, N in itertools.product([2, 3, 4, 5, 6, 8, 99], [1, 2, 3, 99], [-12, -10, -9, -8, -7, -6, -5, -4], [0.3, 0.5]):
    pos, neg, sp, pv, pk, nk = rates(make(G, V, M, N))
    best.append((pos, neg, sp, min(pv.values()), (G, V, M, N)))
print('\nbest pass rate with wrong passes (speech) under 3 / 5 / 8 %:')
for cap in (3, 5, 8):
    ok = [b for b in best if b[2] < cap]
    if not ok:
        print(f'  < {cap}%: none'); continue
    b = max(ok, key=lambda b: (b[0], b[3]))
    show(f'  <{cap}%: gap<{b[4][0]} rgap<{b[4][1]} sT>{b[4][2]} pNo<{b[4][3]}', make(*b[4]))
