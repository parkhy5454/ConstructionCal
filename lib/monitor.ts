// 가벼운 오류 알림. 서버 로그(Vercel Logs)에 구조화된 한 줄을 남기고, ERROR_WEBHOOK_URL이 있으면 Slack/Discord 등으로 알립니다.
// - 절대 예외를 던지지 않습니다(알림 때문에 요청이 실패하면 안 됨).
// - 쿠키·요청 본문·비밀번호 등은 받지도 보내지도 않습니다. 메시지/스택/경로만 사용합니다.
// - 같은 오류가 폭주해도 60초에 한 번만 보냅니다(인스턴스 단위 메모리 중복 제거).
import crypto from "crypto";

const recent = new Map<string, number>();
const WINDOW_MS = 60_000;

function clip(s: unknown, n: number): string {
  return String(s ?? "").slice(0, n);
}

export function errorInfo(err: unknown): { message: string; stack: string } {
  if (err instanceof Error) return { message: clip(err.message, 300), stack: clip(err.stack, 1500) };
  return { message: clip(typeof err === "string" ? err : JSON.stringify(err), 300), stack: "" };
}

export async function reportError(source: string, err: unknown, context?: Record<string, string | number | undefined>): Promise<void> {
  try {
    const { message, stack } = errorInfo(err);
    const key = crypto.createHash("sha1").update(`${source}|${message}`).digest("hex");
    const now = Date.now();
    recent.forEach((t, k) => { if (now - t > WINDOW_MS) recent.delete(k); });
    if (recent.has(key)) return;
    recent.set(key, now);

    console.error(JSON.stringify({ level: "error", source, message, stack, ...context, at: new Date().toISOString() }));

    const url = process.env.ERROR_WEBHOOK_URL;
    if (!url || !/^https:\/\//.test(url)) return;
    const ctx = context ? Object.entries(context).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${v}`).join(" ") : "";
    const text = clip(`🚨 [ConCal] ${source}${ctx ? ` (${ctx})` : ""}\n${message}${stack ? `\n${stack.split("\n").slice(1, 4).join("\n")}` : ""}`, 1800);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    try {
      await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, content: text }), signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    /* 알림 실패는 무시 */
  }
}
