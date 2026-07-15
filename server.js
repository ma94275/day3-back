// server.js — 방명록 API 서버 (오늘 여러분이 완성할 파일)
//
// 만들 것: GET /messages (목록 조회), POST /messages (글 추가)
// 요청/응답 JSON 모양은 요구사항 명세서의 [API 계약]을 따를 것 — 프론트 팀과의 약속!
//
// 진행 순서 (Day 2에서 했던 그대로):
// 1) express, cors, pool(./db.js) import
// 2) 앱 생성, 미들웨어 등록  ← POST 받으려면 뭐가 필요했지? (Day 2: TypeError ... reading 'text')
// 3) GET /messages   — pool.query로 SELECT, 결과는 rows에 들어있다
// 4) POST /messages  — INSERT ... RETURNING * 로 방금 넣은 행을 돌려받아 응답
// 5) app.listen(3000)
//
// ✅ 검증은 화면 말고 Thunder Client로 먼저! (프론트가 아직 없어도 백은 완성 확인 가능)