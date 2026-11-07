import { reportError, errorInfo } from "../lib/monitor";
let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "OK " : "XX "} ${m}`); if (!c) fails++; };
async function main() {
  const logs: string[] = [];
  const origErr = console.error;
  console.error = (...a: unknown[]) => { logs.push(a.join(" ")); };
  const calls: Array<{ url: string; body: string }> = [];
  (globalThis as any).fetch = async (url: string, init: any) => { calls.push({ url, body: init.body }); return new Response("ok"); };

  process.env.ERROR_WEBHOOK_URL = "https://hooks.example.com/x";
  await reportError("api", new Error("boom"), { path: "/api/x" });
  await reportError("api", new Error("boom"), { path: "/api/x" });
  ok(logs.length === 1, "같은 오류는 60초 안에 한 번만 기록");
  ok(calls.length === 1 && calls[0].url === "https://hooks.example.com/x", "웹훅으로 한 번 전송");
  const payload = JSON.parse(calls[0].body);
  ok(typeof payload.text === "string" && payload.text === payload.content && payload.text.includes("boom"), "Slack(text)/Discord(content) 공용 페이로드");
  await reportError("api", new Error("other"));
  ok(calls.length === 2, "다른 오류는 따로 전송");

  process.env.ERROR_WEBHOOK_URL = "http://insecure.example.com";
  await reportError("api", new Error("insecure"));
  ok(calls.length === 2, "https가 아닌 웹훅 주소는 사용하지 않음");

  process.env.ERROR_WEBHOOK_URL = "https://hooks.example.com/x";
  (globalThis as any).fetch = async () => { throw new Error("network down"); };
  let threw = false;
  try { await reportError("api", new Error("net fail")); } catch { threw = true; }
  ok(!threw, "웹훅 전송이 실패해도 예외를 던지지 않음");
  ok(errorInfo("문자열 오류").message === "문자열 오류" && errorInfo({ a: 1 }).message === '{"a":1}', "Error가 아닌 값도 처리");
  ok(errorInfo(new Error("x".repeat(1000))).message.length === 300, "메시지 길이 제한");
  console.error = origErr;
  console.log(fails ? `FAIL ${fails}` : "ALL PASS");
  process.exit(fails ? 1 : 0);
}
main();
