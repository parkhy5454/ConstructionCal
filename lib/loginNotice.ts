// 로그인 성공 직후 처리: 접속 기록 저장 + (다른 기기의 로그인이 끊긴 경우, 처음 보는 환경이면) 안내 메일.
// 어떤 오류가 나도 로그인 자체는 막지 않습니다.
import { recordLogin, isKnownEnvironment, describeAgent, maskIp } from "./loginEvents";
import { clientIp } from "./rateLimit";
import { sendMail, noticeEmail, mailConfigured, appBaseUrl } from "./mailer";

export async function afterLogin(user: { id: number; name: string; email: string }, req: Request, replacedOtherSession: boolean) {
  try {
    const ip = clientIp(req).slice(0, 64);
    const ua = (req.headers.get("user-agent") ?? "").slice(0, 200);
    const known = await isKnownEnvironment(user.id, ip, ua);
    await recordLogin(user.id, req);
    if (replacedOtherSession && !known && mailConfigured()) {
      const when = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
      const mail = noticeEmail({
        subject: "[ConCal] 새 환경에서 로그인되었습니다", name: user.name,
        lines: [`${when}에 ${describeAgent(ua)} (접속 IP ${maskIp(ip)})에서 로그인되어, 다른 기기의 로그인은 종료되었습니다.`, "본인이 로그인한 것이 아니라면 지금 바로 비밀번호를 변경하세요. 비밀번호를 바꾸면 모든 기기의 로그인이 종료됩니다."],
        cta: { label: "내 정보에서 비밀번호 변경", url: `${appBaseUrl(req)}/dashboard` },
        footer: "계정은 한 번에 한 기기에서만 로그인할 수 있습니다.",
      });
      await sendMail({ to: user.email, ...mail });
    }
  } catch (e) {
    console.error("[afterLogin] 처리 실패:", e instanceof Error ? e.message : e);
  }
}
