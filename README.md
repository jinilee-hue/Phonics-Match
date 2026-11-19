# Phonics Match

FPR K 낱말로 하는 파닉스 매치3 게임. 같은 그림 3개를 맞추면 튜터가 "/x/ /x/ word"를 읽어 주고, 아이가 따라 읽으면 코인을 받아 드레스룸에서 튜터를 꾸며요. 주제는 동물·사물·과일 세 가지예요.

- 플레이: https://jinilee-hue.github.io/Phonics-Match/
- 3D 튜터로 보기: https://jinilee-hue.github.io/Phonics-Match/?tutor=3d

## 개발

- `npm ci` → `npm run dev` (http://127.0.0.1:5197/). 개발 서버의 `?tutor=3d`는 `../Phonics-Match-3D`를 띄운 :5198을 그대로 불러와요.
- 3D 튜터를 고친 뒤 배포하려면 `sh tools/sync_t3d.sh`로 `public/t3d`에 복사하고 커밋해요.
- `main` 브랜치에 푸시하면 GitHub Actions가 빌드해서 GitHub Pages에 올려요 (`.github/workflows/deploy.yml`).

## 파닉스 공통 규칙 (2026-11-19, `../phonics-kit`)

- 따라 읽기 판정: 첫 화면 오른쪽 위 열쇠 버튼에 phonics-api 키를 넣은 기기에서는 회사 서버(`/v1/speech/analyze`, 사내 Wav2Vec2 —
  녹음은 저장하지 않음)가 들은 소리열을 단어·판 위 다른 단어와 비교해요(`src/core/apiCheck.ts`). 점: 초록 = 서버, 회색 = 기기 안.
  "/m/ /m/ monkey"처럼 첫소리를 먼저 반복해도 통과, 다른 단어는 "Almost!", 단어와 거리가 먼 소리(옆 사람 말)는 시도로 치지 않고 다시 읽어 줘요.
  키가 없거나 오프라인·혼잡·6초 초과면 기기 안 whisper가 판정 — 이때 목소리는 기기 밖으로 나가지 않아요. 키는 코드·저장소에 넣지 않아요.
- 단어 음성·/m/: lesson pack FP.K.U1L1에 있는 단어(monkey mouse fox mug mop doll kite egg gift)는 pack 음성(`tools/pack_voice.py`
  → `tools/build_mouth_cues.py` → `tools/voice_ver.py`). 판의 그림(타일)은 그림카드가 아니라서 게임 그림 그대로예요.
- 기대 소리열: `python3 tools/build_phonemes.py` → `src/data/phonemes.json` (서버 G2P, 세 주제 70단어).
- QA: `uv run --with playwright==1.62.0 python tools/qa/say_api.py [api|device]` — 가짜 마이크로 말하기 차례 5가지(단어 · 아이 목소리 · 음가 반복 · 다른 단어 · 옆 사람 한국어).
