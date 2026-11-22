# Phonics Match

FPR K 낱말로 하는 파닉스 매치3 게임. 같은 그림 3개를 맞추면 튜터가 "/x/ /x/ word"(첫소리 두 번 + 단어)를 읽어 주고, 아이가 따라 읽으면 코인을 받아 드레스룸에서 튜터를 꾸며요. 주제는 동물·사물·과일 세 가지예요.

- 플레이: https://jinilee-hue.github.io/Phonics-Match/
- 3D 튜터로 보기: https://jinilee-hue.github.io/Phonics-Match/?tutor=3d

## 개발

- `npm install`(또는 `npm ci`) → `npm run dev` (http://127.0.0.1:5197/). 개발 서버의 `?tutor=3d`는 `../Phonics-Match-3D`를 띄운 :5198을 그대로 불러와요.
- 빌드: `npm run build` (`tsc --noEmit && vite build`, `base: './'`). `npm run preview`는 포트 5198이라 3D 서버와 겹쳐요.
- 3D 튜터를 고친 뒤 배포하려면 `sh tools/sync_t3d.sh`로 `public/t3d`에 복사하고 커밋해요.
- `main` 브랜치에 푸시하면 GitHub Actions가 빌드해서 GitHub Pages에 올려요 (`.github/workflows/deploy.yml`, Node 22).
- 주소 옵션(QA용): `?fake`(마이크 대신 `__pm.fakeMic.queue`의 답) · `?seed=N` · `?log`(콘솔 `[pm]` 로그) · `?level=N` · `?play`(타이틀 건너뛰기) · `?theme=animals|objects|fruit` · `?tutor=3d` · `?t3d=<url>` · `?debug`(phonics-api 시도를 화면에 표시). 테스트 훅은 `window.__pm`.

## 게임 규칙

- 타이틀 PLAY → 테마 카드(Animals · Fruits · Things, 처음엔 항상 Animals) → Play. 그 테마에서 깬 가장 높은 레벨의 다음 레벨부터 시작해요(레벨 선택 화면은 없음).
- 미션 카드("Level N · Phonics Mission")에 목표가 나와요: 글자별로 터뜨릴 그림 수.
- 판은 5×4칸, 그림 다섯 종류. 이웃한 두 그림을 바꿔 같은 그림 3개 이상이 한 줄이 되면 터지고, 새 그림이 떨어지며 연쇄(Combo)가 이어져요. 줄이 안 되는 스왑은 되돌아가고 이동 수도 줄지 않아요.
- 터진 그림에서 글자 배지와 금빛 글자가 나오고, 미션 글자면 왼쪽 미션 카드로 날아가 집계돼요.
- 스왑 한 번에 튜터는 첫 웨이브에서 가장 큰 그룹 하나만 읽어요("Wow! /p/ /p/ pig!", 연쇄면 "Amazing!"). 이어서 아이의 말하기 차례(아래).
- 움직일 수가 없으면 자동으로 섞어요. 미션을 다 채우면 클리어, 이동이 0이 되면 실패("Out of Moves!"). 레벨 클리어는 말하기와 무관해요.
- 별: 남은 이동이 34% 이상 3개, 12% 이상 2개, 그 밖 1개. 결과 카드: Home · Dress up · Retry / Next.

## 테마와 레벨 (`src/data/animals.ts`)

교재 유닛 순서대로 유닛마다 보드 하나(글자 다섯 칸), 보드마다 6레벨. 빈칸(`''`)은 앞 유닛 글자 복습이고 레벨마다 바뀌어요. 한 글자에 단어가 둘이면 레벨마다 번갈아 나와요.

| 테마 | 보드 | 고정 레벨 | 단어 |
|---|---|---|---|
| Animals (`a_*`) | U1 m a s t p · U2 i c f d + 복습 · U3 h o r b l · U4 e g x + 복습 2 · U6 z + 복습 4 | 30 | 25 |
| Things (`o_*`) | U1~U6 (U3은 o가 없어 복습 1칸) | 36 | 39 |
| Fruit (`f_*`) | a g l p w 한 보드 | 6 | 6 |

- 유닛 안 6레벨(`INTRO`): 이동 15→20, 목표 1글자 6개 → 2~3글자(글자당 4~8개), 미션 글자가 더 잘 떨어지는 보정(`bias`) 0.12→0.05. z 한 글자짜리 U6 보드는 z가 모든 미션에 들어가는 `REVIEW` 표.
- 고정 레벨 뒤: 한 레벨에 한 보드씩 돌며 미션을 만들어요(2~3글자, 글자당 6개에서 최대 14개, 이동 22→최소 16).
- x는 fox의 끝소리예요. 판의 그림은 그림카드가 아니라 게임 그림(3D 클레이) 그대로예요.
- 단어를 바꾸면 `python3 tools/check_fprk.py`로 모두 FPR K 단어인지 확인해요(아니면 exit 1).

## 코인과 튜터 꾸미기

- 말하기 차례 통과 +10, 레벨 클리어 +(15 + 별 × 5).
- 드레스룸(타이틀: 튜터 오른쪽 아래 둥근 버튼, 게임: 코인 옆 버튼, 결과 카드의 Dress up): 코인으로 사서 바로 입고, 산 것은 눌러서 입기/벗기. 부위(slot)마다 하나씩.
- 아이템 표 `src/ui/items.ts`: 학사모(무료, 처음부터 착용) 포함 12개, 유료 11개 합계 710코인. 헤드폰은 `?tutor=3d`에서만 보여요.
- 이동 처리 중이거나 말하기 카드가 떠 있으면 드레스업 버튼은 막혀요(흔들림).

## 저장

| localStorage 키 | 내용 |
|---|---|
| `pm-save-v1` | 게임 자체 저장 `{coins, level(동물), best{레벨: 별}, owned[], worn{slot: id}, theme, levels{테마: 레벨}}` — 동물은 `best['3']`, 다른 테마는 `best['objects:3']` (`src/core/store.ts`) |
| `phonics.progress` | 파닉스 게임 공통 기록(phonics-kit `phonics-progress.js` 복사본, 런처가 읽음). 레벨이 끝날 때마다 `PhonicsProgress.played('phonics-match', {level, stars, won, movesLeft, theme})`, 실패면 `{level, stars: 0, won: false, theme}` |
| `pm-lang` | 튜터 목소리 언어 `'ko'`(처음) / `'en'` |
| `pm-settings-v1` | 볼륨(음소거 토글) |
| `phonics_api_key` | phonics-api 키(교사가 입력, 코드·저장소에 넣지 않음) |

기기 하나에 저장 하나예요. `resetSave()`는 있지만 부르는 UI는 없어요.

## 말하기 차례 (`src/game/game.ts` `sayItTurn`)

1. 튜터가 읽은 뒤 말하기 카드(그림 + 단어, 글자 강조)와 마이크가 나와요. "Your turn! Say it!"(첫 레벨 처음엔 방법 안내) → 듣기 6초. 그동안 보드는 잠겨요.
2. 통과 → +10 코인, 차례 끝.
3. 틀림 → "Almost! Listen again." + /x/ /x/ word 다시 읽기 → 다시 듣기. **2번 틀리면 "Good try!"** 로 끝(코인 없음).
4. 조용함 → 다시 읽어 주고 한 번 더 기다려요(9초). 레벨의 첫 무음 때는 먼저 흰 장갑이 JUMP 버튼을 두 번 누르며 "Want to skip? Tap the jump button!". **두 번째 무음이면 코인 없이 넘어가요.**
5. **JUMP**(말하기 카드 오른쪽 위 초록 버튼) → 바로 끝, 코인 없음.
6. 판정할 수 없음(마이크 없음·거부·권한 창 무응답 14초, whisper가 30초 넘게 로딩 중이거나 실패) → 바로 끝, 코인 없음.

- 듣기는 JUMP와 경주해요(`Promise.race`): 마이크 프레임이 끊겨도(오디오 컨텍스트 정지, 마이크 분리) 판이 잠긴 채 남지 않아요. `src/core/mic.ts`는 벽시계로도 끝내요(대기 + 3초, 목소리가 시작됐으면 최대 길이 + 3초). 정리(마이크 닫기, 음악 복귀, 카드 숨김)는 `finally`에서 항상 해요.
- 마이크 권한 창이 1.2초 넘게 떠 있으면 튜터가 "Tap allow, so I can hear you!"라고 말해요.

### 판정 순서 (`src/core/listen.ts`)

1. **phonics-api** — 타이틀 왼쪽 위 열쇠 버튼으로 키를 넣은 기기. 녹음 한 번을 `/v1/speech/analyze`(사내 Wav2Vec2, 녹음은 저장하지 않음)에 보내고, `PhonicsAPI.judge`가 들은 소리열을 단어 · 판 위 다른 단어 · 같은 글자 단어와 비교해요(`src/core/apiCheck.ts`, 기대 소리열 `src/data/phonemes.json`). ok → 통과, 다른 단어이거나 단어에 가까운 소리(소리당 0.7 이하) → 틀림, 그 밖(옆 사람 말 등) → 시도로 치지 않고 무음처럼 다시 읽어 줘요. "/m/ /m/ monkey"처럼 첫소리를 먼저 반복해도 통과해요.
2. **기기 안 whisper** — 키가 없거나 오프라인·혼잡·6초 초과면(실패 뒤 1분은 서버를 쉼) whisper-tiny.en(transformers.js 워커, `src/core/stt.ts`·`sttWorker.ts`·`sttCheck.ts`, 모델·런타임 `public/stt/` 약 55 MB)이 판정해요. 목소리는 기기 밖으로 나가지 않아요. 단어가 아니면서 시도처럼 들리지도 않는 소리는 무음으로 쳐요(`triedWord`). 모델은 타이틀에서 1.5초 뒤 미리 받기 시작해요.
3. 둘 다 안 되면 판정하지 않고 코인 없이 넘어가요.

열쇠 버튼의 점: 초록 = 서버, 회색 = 기기 안. 키는 코드·저장소에 넣지 않아요.

## 힌트

8초 동안 아무것도 안 하면 맞출 수 있는 줄이 빛나고 흰 장갑이 끄는 방향을 보여 주며 튜터가 "Look here!"라고 말해요. 그 뒤로 판을 건드릴 때까지 **15초마다 음성과 장갑을 반복**하고, 판을 건드리면 사라지고 8초부터 다시 세요. 첫 레벨 처음엔 바로 힌트와 방법 안내가 나와요.

## 언어

- 국기 토글은 **타이틀에만** 있어요(오른쪽 위). 처음 방문은 **한국어**, 선택은 `pm-lang`에 남아요.
- 바뀌는 건 **튜터 목소리만**: `t:` 대사가 `k:` 한국어 녹음으로 바뀌어요(`src/core/audio.ts`). 글자 소리와 단어는 늘 영어, 화면 글자(Level, Moves, Mission Clear!, 테마·아이템 이름)도 영어예요.

## 음성

- 튜터 대사 32줄 × 영어·한국어: `tools/build_voice.py` → `public/voice/`, `src/data/voice.json`(phonics-api TTS `en-US-AvaMultilingualNeural`, 파닉스 게임 공통 튜터 목소리). 단어·글자 소리는 FPR K 공식 녹음.
- 레슨팩 FP.K.U1L1에 있는 단어(monkey mouse fox mug mop doll kite egg gift)와 /m/은 팩 음성으로 바꿔 넣어요: `uv run --with numpy python tools/pack_voice.py` → `uv run --with numpy python tools/build_mouth_cues.py` → `python3 tools/voice_ver.py`.
- 기대 소리열: `python3 tools/build_phonemes.py` → `src/data/phonemes.json`(서버 G2P, 세 주제 70단어). 단어를 더하면 다시 돌려요.
- 배경음악: `tools/make_bgm.py` → `public/bgm.mp3`.

## 도구 (`tools/`)

| 스크립트 | 하는 일 |
|---|---|
| `build_voice.py` · `pack_voice.py` · `build_mouth_cues.py` · `voice_ver.py` | 대사·단어 음성 / 레슨팩 음성 / 입모양(Rhubarb) → `mouth.json` / 클립 캐시 버전 |
| `build_phonemes.py` | phonics-api 기대 소리열 |
| `build_art.py` · `tiles.py` · `cut_sprites.py` · `art_boxes.py` · `matte.py` | 목업에서 그림 자르기·타일 얼굴 크기 맞춤 → `public/art/`, `art.json` |
| `title_deco.py` · `letter_counters.py` · `clean_bg.py` · `final_bg.py` · `membrane.py` | 타이틀 장식, 글자 구멍, 배경 정리 |
| `star_shadow.py` · `feet_mask.py` · `refit_wear.py` | 결과 별 그림자, 신발 아래 발 마스크, 착용 그림 보정 |
| `check_fprk.py` · `check_unit1.py` · `check_animals.py` | 보드 단어가 FPR K 장부에 있는지 |
| `make_bgm.py` · `sync_t3d.sh` | 배경음악, 3D 튜터 복사 |

## QA (`tools/qa/`, 헤드리스 — 사용자 브라우저는 쓰지 않음)

- `uv run --with playwright==1.62.0 python tools/qa/say_api.py [api|device]` — 가짜 마이크로 말하기 차례 5가지(단어 · 아이 목소리 · 음가 반복 · 다른 단어 · 옆 사람 한국어).
- `uv run --with playwright python tools/qa/shot.py http://127.0.0.1:5197/ <prefix> 1600 900 title,game,pop` — 화면 캡처 + 실제 이동(로그에 `heard <word>: ok`).
- `uv run --with playwright --with pillow python tools/qa/layout_check.py <base> <out>` — 4개 창 크기에서 배치·클릭. (`hud_game.py`는 옛 HUD용, 쓰지 않음)
- `node tools/qa/word_check.ts` · `node tools/qa/noword_check.ts` — 기기 안 판정이 단어마다 자기 단어만 받는지 / 단어 아닌 소리를 받는지.
- 인식 규칙 재튜닝: `stt_words.ts` → `stt_set.py` → `stt_eval.ts` → `stt_grid.py` · `stt_tail.ts`.
- 그 밖: `mix.py`(레벨별 보드 구성) · `lipsync.py` · `cue_lag.py` · `clock_check.py`(립싱크) · `voice_check.ts` · `ko_check.py`(음성 다시 듣기) · `title_orbit.py` · `sprite_edges.py`(타이틀 그림).

## 파일

| 파일 | 역할 |
|---|---|
| `src/main.ts` | 부팅, 화면·카드 전환, 테마 카드, 결과, 드레스업 연결, 언어 토글, `window.__pm` |
| `src/game/game.ts` · `grid.ts` · `board.ts` | 레벨·스왑·연쇄·말하기 차례·힌트 / 매치 논리 / 보드 표시·입력 |
| `src/data/animals.ts` | 테마·유닛·단어·허용 표현(`ALTS`)·라이벌·레벨 표 |
| `src/core/listen.ts` · `mic.ts` · `apiCheck.ts` · `stt.ts` · `sttWorker.ts` · `sttCheck.ts` · `readCheck.ts` · `lastPart.ts` | 말하기 판정 |
| `src/core/audio.ts` · `speech.ts` · `lang.ts` · `store.ts` | 소리·음악 / 대사 재생 / 언어 / 저장 |
| `src/ui/` | 타이틀·시연(`title.ts`, `demo.ts`), 튜터·입모양(`tutor.ts`, `mouth.ts`), 드레스룸(`shop.ts`, `items.ts`), 이펙트·HUD·손·상단 버튼(`fx.ts`, `hud.ts`, `hand.ts`, `corner.ts`), 화면 맞춤(`stage.ts`, 2752×1536 디자인 스테이지) |
| `src/vendor/phonics-api.js` · `phonics-progress.js` | phonics-kit 복사본 — kit을 고친 뒤 다시 복사 |
| `public/` | `art/` 그림, `voice/` 음성, `stt/` whisper 모델·런타임, `t3d/` 3D 튜터 복사본, `bgm.mp3` |

`index.html`의 일시정지(`#pause`)·설정(`#settings`) 카드는 지금 여는 버튼이 없어요.
