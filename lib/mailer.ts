// 이메일 발송 — Resend(https://resend.com) REST API를 fetch로 호출합니다(추가 패키지 없음).
// 환경변수 RESEND_API_KEY, EMAIL_FROM(예: "ConCal <noreply@내도메인.com>")이 있어야 동작하며,
// 없으면 발송하지 않고 not_configured를 돌려줍니다(그 상태에서는 이메일 인증도 강제되지 않음).
export type MailResult = { ok: true } | { ok: false; error: string };

export function mailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}

export async function sendMail(opts: { to: string; subject: string; html: string; text: string }): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return { ok: false, error: "not_configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, html: opts.html, text: opts.text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[mailer] 발송 실패", res.status, body.slice(0, 300));
      return { ok: false, error: `provider_${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[mailer] 발송 오류", e instanceof Error ? e.message : e);
    return { ok: false, error: "network" };
  }
}

// 링크의 기준 주소. 설정된 APP_URL을 우선 사용(Host 헤더 조작으로 메일 링크가 바뀌는 것을 방지).
export function appBaseUrl(req: Request): string {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  return new URL(req.url).origin;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export function verificationEmail(name: string, link: string) {
  return {
    subject: "[ConCal] 이메일 주소를 확인해주세요",
    text: `${name}님, 가입을 환영합니다.\n\n아래 링크를 열어 이메일 인증을 완료해주세요 (24시간 동안 유효):\n${link}\n\n본인이 가입하지 않았다면 이 메일을 무시하세요.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px">
<h2 style="margin:0 0 12px">이메일 인증</h2>
<p>${esc(name)}님, 가입을 환영합니다. 아래 버튼을 눌러 이메일 인증을 완료해주세요. (24시간 동안 유효)</p>
<p style="margin:24px 0"><a href="${esc(link)}" style="background:#1f6f54;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">이메일 인증하기</a></p>
<p style="color:#888;font-size:12px">버튼이 안 열리면 주소를 복사해 브라우저에 붙여넣으세요:<br>${esc(link)}</p>
<p style="color:#888;font-size:12px">본인이 가입하지 않았다면 이 메일을 무시하세요.</p></div>`,
  };
}
