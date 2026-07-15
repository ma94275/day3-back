// server.js — 방명록 API 서버 (완성본)

import express from "express";
import cors from "cors";
import pool from "./db.js"; // db.js가 만들어둔 DB 연결 통로

const app = express();

app.use(cors());

// POST로 오는 JSON body를 읽게 해주는 미들웨어
// 이 줄이 없으면? → req.body가 undefined → Day 2에서 봤던 TypeError
app.use(express.json());

// [GET /messages] 방명록 전체 목록
app.get("/messages", async (req, res) => {
  // 최신 글이 위로 오도록 정렬 (id가 클수록 나중에 쓴 글)
  const result = await pool.query("SELECT * FROM messages ORDER BY id DESC");
  res.json(result.rows); // 조회 결과는 항상 rows 안에 (배열)
});

// [POST /messages] 방명록 글 추가
app.post("/messages", async (req, res) => {
  const { name, content } = req.body; // 구조 분해 — Day 1 문법이 여기서도

  // $1, $2 = 자리표시자. 값을 SQL 문자열에 직접 붙이지 않는 안전한 방식
  // RETURNING * = 방금 INSERT된 행(id, created_at 포함)을 그대로 돌려받는다
  //               → 프론트가 이 응답을 목록에 바로 추가할 수 있음
  const result = await pool.query(
    "INSERT INTO messages (name, content) VALUES ($1, $2) RETURNING *",
    [name, content],
  );

  res.status(201).json(result.rows[0]); // 201 = "만들어졌음" (Day 2 상태 코드)
});

// [DELETE /messages/:id] 방명록 글 삭제 (심화 미션)
app.delete("/messages/:id", async (req, res) => {
  // :id는 문자열로 들어온다 — Day 2의 그 함정. pg의 $1 비교는 괜찮지만 습관대로 Number()
  const id = Number(req.params.id);

  // RETURNING *: 지워진 행이 돌아오면 → 진짜 있던 글
  //              rows가 비어 있으면 → 그 id의 글이 애초에 없음 (404 판단 근거)
  const result = await pool.query(
    "DELETE FROM messages WHERE id = $1 RETURNING *",
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "그 글은 없습니다" });
  }
  res.json(result.rows[0]);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`방명록 서버 실행 중: http://localhost:${PORT}`);
});
