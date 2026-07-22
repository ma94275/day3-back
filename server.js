// server.js — 방명록 API 서버 (완성본)

import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";
import pool from "./db.js"; // db.js가 만들어둔 DB 연결 통로
import authRouter from "./auth.js"; // 이메일 인증 회원가입/로그인 라우터

const app = express();

app.use(cors());

// POST로 오는 JSON body를 읽게 해주는 미들웨어
// 이 줄이 없으면? → req.body가 undefined → Day 2에서 봤던 TypeError
app.use(express.json());

// /auth/* 로 들어오는 요청은 auth.js가 통째로 담당
// (예: POST /auth/signup, POST /auth/verify, POST /auth/login)
app.use("/auth", authRouter);

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

// [POST /messages/:id/like] 방명록 글 좋아요
app.post("/messages/:id/like", async (req, res) => {
  const id = Number(req.params.id); // :id는 문자열로 들어온다 — 아래 DELETE와 같은 함정

  // likes = likes + 1: 현재 값을 DB에서 직접 읽어서 더하기 때문에
  // 여러 명이 동시에 눌러도 요청이 유실되지 않는다 (서버 메모리에 값을 들고 있다가 덮어쓰는 방식과 다름)
  const result = await pool.query(
    "UPDATE messages SET likes = likes + 1 WHERE id = $1 RETURNING *",
    [id],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "그 글은 없습니다" });
  }
  res.json(result.rows[0]);
});

// [GET /messages/:id/comments] 방명록 글의 댓글 목록
app.get("/messages/:id/comments", async (req, res) => {
  const messageId = Number(req.params.id);

  // 댓글은 대화 흐름이라 위(목록)와 반대로 오래된 게 먼저 오도록 정렬
  const result = await pool.query(
    "SELECT * FROM comments WHERE message_id = $1 ORDER BY id ASC",
    [messageId],
  );
  res.json(result.rows);
});

// [POST /messages/:id/comments] 방명록 글에 댓글 추가
app.post("/messages/:id/comments", async (req, res) => {
  const messageId = Number(req.params.id);
  const { name, content } = req.body;

  // 댓글부터 INSERT하면 없는 글 id로도 DB의 FK 제약에서 막히긴 하지만
  // 에러 메시지가 사용자에게 불친절해서, 먼저 글이 있는지 확인하고 없으면 404로 처리
  const message = await pool.query("SELECT id FROM messages WHERE id = $1", [
    messageId,
  ]);
  if (message.rows.length === 0) {
    return res.status(404).json({ error: "그 글은 없습니다" });
  }

  const result = await pool.query(
    "INSERT INTO comments (message_id, name, content) VALUES ($1, $2, $3) RETURNING *",
    [messageId, name, content],
  );

  res.status(201).json(result.rows[0]);
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

// app.listen()은 내부적으로 http 서버를 만들어서 켜주는 짧은 버전이라
// socket.io를 붙이려면 그 http 서버를 직접 만들어서 express와 socket.io 둘 다에 물려야 한다
const httpServer = createServer(app);

// 실시간 그림판 통로. cors는 위 express용 cors()와 별개로 소켓에도 한 번 더 열어줘야 한다
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

// 그림은 DB에 저장하지 않는다 — 지금 접속해 있는 사람들끼리만 실시간으로 공유
// (서버를 껐다 켜거나 마지막 사람이 나가면 그림은 사라짐)
//
// 지금까지 그려진 선들을 서버 메모리에 쌓아 둔다 (DB 아님 — 서버 재시작하면 초기화).
// 이 배열이 있어야 새로고침·늦은 접속자에게 기존 그림을 다시 그려줄 수 있다.
let strokes = [];

io.on("connection", (socket) => {
  console.log(`그림판 접속: ${socket.id}`);

  // [init] 새로 들어온(또는 새로고침한) 사람에게 지금까지의 그림을 통째로 전송
  // 프론트는 이 배열을 순서대로 다시 그린다 → 늦게 들어와도 기존 그림이 보인다
  socket.emit("init", strokes);

  // [draw] 한 사람이 선을 그으면 그 좌표를 나머지 모두에게 그대로 전달
  // socket.broadcast.emit = "보낸 사람 빼고 전부"에게 전송 — 그린 사람은 이미 자기 화면에 그렸으니 다시 안 보내도 됨
  // stroke 안에 뭐가 들어있는지(좌표, 색, 굵기 등)는 서버가 몰라도 됨 — 기억해 뒀다가 그대로 전달만 하면 프론트가 알아서 그림
  socket.on("draw", (stroke) => {
    strokes.push(stroke); // 기억해 두고 (나중에 접속하는 사람에게 보내주기 위해)
    socket.broadcast.emit("draw", stroke);
  });

  // [clear] 캔버스 전체 지우기도 모두에게 동기화 — 기억(strokes)도 함께 비운다
  socket.on("clear", () => {
    strokes = [];
    socket.broadcast.emit("clear");
  });

  socket.on("disconnect", () => {
    console.log(`그림판 접속 종료: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log(`방명록 서버 실행 중: http://localhost:${PORT}`);
});
