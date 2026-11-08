# Phonics Match

FPR K 낱말로 하는 파닉스 매치3 게임. 같은 그림 3개를 맞추면 튜터가 "/x/ /x/ word"를 읽어 주고, 아이가 따라 읽으면 코인을 받아 드레스룸에서 튜터를 꾸며요. 주제는 동물·사물·과일 세 가지예요.

- 플레이: https://jinilee-hue.github.io/Phonics-Match/
- 3D 튜터로 보기: https://jinilee-hue.github.io/Phonics-Match/?tutor=3d

## 개발

- `npm ci` → `npm run dev` (http://127.0.0.1:5197/). 개발 서버의 `?tutor=3d`는 `../Phonics-Match-3D`를 띄운 :5198을 그대로 불러와요.
- 3D 튜터를 고친 뒤 배포하려면 `sh tools/sync_t3d.sh`로 `public/t3d`에 복사하고 커밋해요.
- `main` 브랜치에 푸시하면 GitHub Actions가 빌드해서 GitHub Pages에 올려요 (`.github/workflows/deploy.yml`).
