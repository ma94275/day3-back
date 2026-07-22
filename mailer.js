// mailer.js — 인증 메일 발송 담당 파일
// Gmail SMTP를 통해 6자리 인증 코드를 사용자 메일로 보낸다.
//
// ⚠️ 준비물 (.env에 넣기):
//   GMAIL_USER          → 보내는 Gmail 주소 (예: myname@gmail.com)
//   GMAIL_APP_PASSWORD  → Gmail "앱 비밀번호" 16자리 (일반 로그인 비번 아님!)
//
// 앱 비밀번호 만드는 법:
//   Google 계정 → 보안 → 2단계 인증을 먼저 켠다 → "앱 비밀번호" 메뉴에서 생성
//   (2단계 인증이 꺼져 있으면 앱 비밀번호 메뉴가 아예 안 보인다)

import nodemailer from "nodemailer";

// GMAIL_USER가 비어 있으면 = 아직 메일 설정을 안 한 것.
// 이럴 땐 실제 발송 대신 콘솔에 코드를 찍어주는 "개발 모드"로 동작한다.
// → 메일 설정 없이도 회원가입/인증 흐름을 바로 테스트할 수 있음.
const 개발모드 = !process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD;

// transporter = 실제로 메일을 쏘는 발사대. 한 번 만들어두고 계속 재사용한다.
const transporter = 개발모드
  ? null
  : nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
      // ⚠️ 학교/회사 네트워크가 SSL을 중간에서 가로채면(보안 프록시)
      //    "unable to verify the first certificate" 에러가 난다.
      //    이럴 때만 .env에 SMTP_INSECURE_TLS=true 를 넣어 인증서 검증을 끈다.
      //    (검증을 끄는 건 보안상 약해지는 것이라, 꼭 필요할 때만 임시로 사용)
      ...(process.env.SMTP_INSECURE_TLS === "true"
        ? { tls: { rejectUnauthorized: false } }
        : {}),
    });

// 인증 코드가 담긴 메일을 보낸다.
export async function sendVerificationEmail(toEmail, code) {
  // 개발 모드: 메일 대신 콘솔에 코드를 출력 (메일함 대신 터미널을 확인)
  if (개발모드) {
    console.log("──────────────────────────────────────");
    console.log(`📮 [개발 모드] 메일 발송 생략 — 콘솔로 코드 전달`);
    console.log(`   받는 사람: ${toEmail}`);
    console.log(`   인증 코드: ${code}`);
    console.log("   (.env에 GMAIL_USER / GMAIL_APP_PASSWORD를 넣으면 실제 메일이 발송됩니다)");
    console.log("──────────────────────────────────────");
    return;
  }

  // 실제 발송
  await transporter.sendMail({
    from: `"방명록" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: "[방명록] 이메일 인증 코드",
    // text = 순수 텍스트 버전 (HTML을 못 보는 메일앱 대비)
    text: `인증 코드: ${code}\n\n이 코드를 10분 안에 입력해주세요.`,
    // html = 예쁘게 보이는 버전
    html: `
      <div style="font-family: sans-serif; max-width: 400px; margin: auto;">
        <h2>방명록 이메일 인증</h2>
        <p>아래 인증 코드를 입력해주세요.</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px;
                    background: #f4f4f4; padding: 16px; text-align: center;
                    border-radius: 8px;">
          ${code}
        </div>
        <p style="color: #888; font-size: 13px;">이 코드는 10분 후 만료됩니다.</p>
      </div>
    `,
  });
}
