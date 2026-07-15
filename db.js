// db.js — 데이터베이스 연결 담당 파일
// ⚠️ 이 파일은 수정할 필요가 없습니다. server.js에서 import해서 쓰기만 하면 됩니다.

// pg = Node.js에서 PostgreSQL에 접속하게 해주는 라이브러리 (Day 2에서 설치했던 그것)
import pg from "pg";

// Pool = DB 연결 통로 묶음.
// 요청이 올 때마다 새로 접속하면 느리니까, 연결을 미리 만들어두고 돌려쓰는 방식
const pool = new pg.Pool({
  // 접속 주소는 코드에 직접 쓰지 않고 .env 파일에서 읽어온다 (Day 2: "비밀은 코드 밖에")
  // process.env.DATABASE_URL이 undefined면 → .env가 없거나, npm run dev로 실행 안 한 것
  connectionString: process.env.DATABASE_URL,
});

// server.js에서 `import pool from "./db.js"`로 가져다 쓴다
export default pool;