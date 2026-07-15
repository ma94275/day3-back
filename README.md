# 방명록 API 서버 (팀 백엔드)

## 실행 순서
1. `npm install` — package.json의 라이브러리 설치 (express, pg, cors)
2. `.env.example`을 복사해 `.env` 생성, 팀 Supabase 접속 문자열 입력
3. `npm run dev` — Day 2와 같은 명령. --watch(자동 재시작) + --env-file(.env 로딩)이 들어있다

## 연결이 안 될 때 (Day 2 공식)
- `ECONNREFUSED` → Supabase까지 **못 간 것**. .env 미로딩 의심 → `console.log(process.env.DATABASE_URL)` 확인
- `password authentication failed` → Supabase까지 **간 것**. 비밀번호만 다시 확인