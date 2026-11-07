// 서버 프로세스 수준의 잡히지 않은 오류를 알림으로 보냅니다. (Next 14: next.config의 experimental.instrumentationHook 필요)
// Node 전용 코드는 별도 파일로 두고, 런타임이 nodejs일 때만 불러옵니다(엣지 번들에 crypto 등이 섞이지 않게).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
