// auth.js — 이메일 + 비밀번호 회원가입 / 로그인 담당 파일 (이메일 인증 없음)
// server.js에서 `app.use("/auth", authRouter)` 로 붙여서 쓴다.
//
// 흐름 한눈에:
//   1) POST /auth/signup  → 이메일+비번만 있으면 바로 가입 완료 (인증 절차 없음, 토큰 즉시 발급)
//   2) POST /auth/login   → 이메일+비번 확인 → JWT 토큰 발급
//
// ⚠️ users 테이블이 없으면 에러가 난다. README의 SQL을 Supabase에서 한 번 실행할 것.

import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "./db.js";

const router = Router();

// JWT 서명에 쓰는 비밀 키. .env의 JWT_SECRET을 쓰되, 없으면 개발용 기본값으로 대체.
// (실제 배포에서는 반드시 .env/환경변수에 길고 무작위한 값을 넣어야 한다)
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

// [POST /auth/signup] 회원가입 — 이메일+비번만 있으면 바로 가입 완료
router.post("/signup", async (req, res) => {
  const { email, password } = req.body;

  // 아주 기본적인 입력 검증 (빈 값, 너무 짧은 비번 막기)
  if (!email || !password) {
    return res.status(400).json({ error: "이메일과 비밀번호를 모두 입력해주세요" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "비밀번호는 8자 이상이어야 합니다" });
  }

  // 비밀번호는 절대 원문 그대로 저장하지 않는다 — 해시(단방향 암호화)로 바꿔서 저장.
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    // 같은 이메일이 이미 있으면 UNIQUE 제약에 걸린다.
    // ON CONFLICT (email) DO NOTHING = 이미 있으면 아무것도 안 하고 넘어간다(rows 비어 있음 → 409로 안내).
    const result = await pool.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, email`,
      [email, passwordHash],
    );

    // rows가 비어 있음 = 이미 가입된 이메일.
    if (result.rows.length === 0) {
      return res.status(409).json({ error: "이미 가입된 이메일입니다. 로그인해주세요" });
    }

    const user = result.rows[0];

    // 가입과 동시에 로그인 상태로 바로 쓸 수 있게 토큰도 함께 발급.
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(201).json({
      message: "회원가입이 완료되었습니다",
      token,
      user,
    });
  } catch (err) {
    console.error("signup 에러:", err);
    res.status(500).json({ error: "회원가입 처리 중 문제가 발생했습니다" });
  }
});

// [POST /auth/login] 로그인 — 성공 시 JWT 발급
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "이메일과 비밀번호를 입력해주세요" });
  }

  const found = await pool.query(
    "SELECT id, email, password_hash FROM users WHERE email = $1",
    [email],
  );
  const user = found.rows[0];

  // 이메일이 없거나 비번이 틀린 경우, 둘을 구분해서 알려주면 공격자에게 힌트가 된다.
  // → "이메일 없음"과 "비번 틀림"을 같은 메시지로 뭉뚱그린다.
  if (!user) {
    return res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다" });
  }

  // 입력한 비번을 해시와 대조. bcrypt가 알아서 안전하게 비교해준다.
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다" });
  }

  // JWT 발급. payload에는 최소한의 정보만 담는다 (id, email).
  // expiresIn: "7d" = 7일 뒤 자동 만료.
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: "7d",
  });

  res.json({
    message: "로그인 성공",
    token,
    user: { id: user.id, email: user.email },
  });
});

// [GET /auth/me] 내 정보 확인 — JWT 토큰이 유효한지 검사하는 예시 겸 보호된 라우트
router.get("/me", (req, res) => {
  // 프론트는 요청 헤더에 `Authorization: Bearer <토큰>` 형태로 토큰을 실어 보낸다.
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "로그인이 필요합니다 (토큰 없음)" });
  }

  try {
    // 토큰을 열어서(검증) payload를 꺼낸다. 위조/만료됐으면 여기서 예외가 터진다.
    const payload = jwt.verify(token, JWT_SECRET);
    res.json({ user: { id: payload.id, email: payload.email } });
  } catch {
    res.status(401).json({ error: "토큰이 유효하지 않거나 만료되었습니다" });
  }
});

export default router;
