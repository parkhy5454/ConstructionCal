// CSRF 방어: 브라우저가 상태 변경 요청(POST/PUT/PATCH/DELETE)에 붙이는 Origin / Sec-Fetch-Site 헤더로
// "다른 사이트에서 날아온 요청"을 차단합니다. 쿠키는 sameSite=lax이지만, 이 검사를 한 겹 더해 둡니다(심층 방어).
// 토큰 방식과 달리 화면/API 수정이 필요 없고, 서버 간 호출(curl 등)은 쿠키를 자동으로 싣지 않으므로 영향이 없습니다.

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export type CsrfInput = {
  method: string;
  origin: string | null;
  secFetchSite: string | null;
  host: string | null; // 실제 요청이 도착한 호스트 (x-forwarded-host 우선)
};

// true = 허용, false = 차단
export function isRequestAllowed(i: CsrfInput): boolean {
  if (!UNSAFE_METHODS.has(i.method.toUpperCase())) return true;

  if (i.origin) {
    // "null" Origin(샌드박스 iframe, 일부 리다이렉트)은 출처를 확인할 수 없으므로 차단
    try {
      const o = new URL(i.origin);
      return !!i.host && o.host.toLowerCase() === i.host.toLowerCase();
    } catch {
      return false;
    }
  }
  // Origin이 없는 경우: 브라우저가 보내는 Sec-Fetch-Site가 있으면 같은 출처일 때만 허용
  if (i.secFetchSite) return i.secFetchSite === "same-origin" || i.secFetchSite === "none";
  // 둘 다 없으면 브라우저가 아닌 클라이언트(curl 등)로 보고 허용 — 쿠키를 자동으로 싣지 않는 환경이므로 CSRF 위험이 없음
  return true;
}
