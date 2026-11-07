// 화면 오류를 서버로 보냅니다(실패해도 조용히 무시).
export function sendClientError(error: Error & { digest?: string }) {
  try {
    const body = JSON.stringify({ message: error.message, stack: error.stack, path: typeof location !== "undefined" ? location.pathname : "" });
    fetch("/api/client-error", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch {}
}
