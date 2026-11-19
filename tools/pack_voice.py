"""Word clips and /m/ from the lesson pack FP.K.U1L1 (phonics-kit rule 2026-11-19: content = the lesson pack).
Every w:<word> the pack has official audio for (monkey, mouse, fox, mug, mop, doll, kite, egg, gift) and s:m are re-cut
from the pack into public/voice + src/data/voice.json (phonics-kit/tools/pack_voice.py); nothing else changes.
Run after tools/build_voice.py (or alone after a pack update), then:
  uv run --with numpy python tools/build_mouth_cues.py && python3 tools/voice_ver.py
usage: uv run --with numpy python tools/pack_voice.py
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(pathlib.Path.home() / 'Documents/Jini/2026/Phonics/phonics-kit/tools'))
import pack_voice  # noqa: E402

if __name__ == '__main__':
    pack_voice.apply(ROOT, word_db=-17, sound_db=-18)   # the levels build_voice.py uses for words / letter sounds
