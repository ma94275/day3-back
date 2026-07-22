// auth.js — 이메일 인증 기반 회원가입 / 로그인 담당 파일
// server.js에서 `app.use("/auth", authRouter)` 로 붙여서 쓴다.
//
// 흐름 한눈에:
//   1) POST /auth/signup  → 가입 신청. 비번은 해시로 저장하고, 6자리 코드를 메일로 발송 (아직 미인증)
//   2) POST /auth/verify  → 메일로 받은 코드 입력 → 인증 완료 (verified = true)
//   3) POST /auth/login   → 이메일+비번 확인. 단, 인증을 마친 사람만 통과 → JWT 토큰 발급
//
// ⚠️ users 테이블이 없으면 에러가 난다. README의 SQL을 Supabase에서 한 번 실행할 것.

import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "./db.js";
import { sendVerificationEmail } from "./mailer.js";

const router = Router();

// JWT 서명에 쓰는 비밀 키. .env의 JWT_SECRET을 쓰되, 없으면 개발용 기본값으로 대체.
// (실제 배포에서는 반드시 .env에 길고 무작위한 값을 넣어야 한다)
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

// 인증 코드가 유효한 시간 (10분). 밀리초 단위.
const CODE_TTL_MS = 10 * 60 * 1000;

// 6자리 숫자 코드를 무작위로 만든다. (000000 ~ 999999, 앞자리 0도 유지)
function 코드생성() {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}

// [POST /auth/signup] 회원가입 신청 — 인증 메일 발송까지
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
  // salt(10) = 해시 강도. 숫자가 클수록 안전하지만 느려진다.
  const passwordHash = await bcrypt.hash(password, 10);

  const code = 코드생성();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  try {
    // 같은 이메일로 이미 가입을 시도했지만 아직 인증을 안 끝낸 경우가 있다.
    // ON CONFLICT (email) DO UPDATE = 이미 있으면 새 비번/새 코드로 갱신 (재시도 허용).
    // 단, 이미 인증(verified=true)까지 끝난 이메일은 건드리지 않도록 WHERE로 막는다.
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, verification_code, verification_expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             verification_code = EXCLUDED.verification_code,
             verification_expires_at = EXCLUDED.verification_expires_at
       WHERE users.verified = false
       RETURNING id, email, verified`,
      [email, passwordHash, code, expiresAt],
    );

    // rows가 비어 있음 = ON CONFLICT의 WHERE에 걸림 = 이미 인증된 이메일.
    if (result.rows.length === 0) {
      return res.status(409).json({ error: "이미 가입된 이메일입니다. 로그인해주세요" });
    }

    // 코드가 담긴 메일 발송 (개발 모드면 콘솔로 출력)
    await sendVerificationEmail(email, code);

    res.status(201).json({
      message: "인증 코드를 이메일로 보냈습니다. 코드를 입력해 인증을 완료해주세요",
      email,
    });
  } catch (err) {
    console.error("signup 에러:", err);
    res.status(500).json({ error: "회원가입 처리 중 문제가 발생했습니다" });
  }
});

// [POST /auth/verify] 메일로 받은 6자리 코드로 인증 완료
router.post("/verify", async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ error: "이메일과 인증 코드를 입력해주세요" });
  }

  const found = await pool.query(
    "SELECT id, verified, verification_code, verification_expires_at FROM users WHERE email = $1",
    [email],
  );

  const user = found.rows[0];
  if (!user) {
    return res.status(404).json({ error: "가입 신청 기록이 없습니다" });
  }
  if (user.verified) {
    return res.status(400).json({ error: "이미 인증이 완료된 계정입니다" });
  }
  // 만료 확인 — 지금 시각이 저장된 만료 시각을 넘겼으면 코드가 죽은 것
  if (!user.verification_expires_at || new Date() > user.verification_expires_at) {
    return res.status(400).json({ error: "인증 코드가 만료되었습니다. 코드를 다시 요청해주세요" });
  }
  // 코드 일치 확인 (문자열로 비교 — 앞자리 0이 사라지는 문제 방지)
  if (String(user.verification_code) !== String(code)) {
    return res.status(400).json({ error: "인증 코드가 일치하지 않습니다" });
  }

  // 통과 → verified를 true로 바꾸고, 다 쓴 코드는 지운다 (재사용 방지)
  await pool.query(
    "UPDATE users SET verified = true, verification_code = NULL, verification_expires_at = NULL WHERE id = $1",
    [user.id],
  );

  res.json({ message: "이메일 인증이 완료되었습니다. 이제 로그인할 수 있습니다" });
});

// [POST /auth/resend] 인증 코드 재발송 (코드를 못 받았거나 만료됐을 때)
router.post("/resend", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "이메일을 입력해주세요" });
  }

  const code = 코드생성();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  // 아직 인증 안 한 계정에게만 새 코드를 발급한다.
  const result = await pool.query(
    `UPDATE users
       SET verification_code = $1, verification_expires_at = $2
       WHERE email = $3 AND verified = false
       RETURNING id`,
    [code, expiresAt, email],
  );

  if (result.rows.length === 0) {
    return res.status(400).json({ error: "재발송할 대상이 없습니다 (미가입이거나 이미 인증된 계정)" });
  }

  await sendVerificationEmail(email, code);
  res.json({ message: "인증 코드를 다시 보냈습니다" });
});

// [POST /auth/login] 로그인 — 인증을 마친 계정만 통과, 성공 시 JWT 발급
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "이메일과 비밀번호를 입력해주세요" });
  }

  const found = await pool.query(
    "SELECT id, email, password_hash, verified FROM users WHERE email = $1",
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

  // 비번은 맞지만 아직 메일 인증을 안 한 경우 → 로그인 막고 안내
  if (!user.verified) {
    return res.status(403).json({ error: "이메일 인증이 필요합니다. 메일의 코드로 인증을 완료해주세요" });
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
