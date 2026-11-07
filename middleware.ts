import { NextRequest, NextResponse } from "next/server";
import { isRequestAllowed } from "@/lib/csrf";

// 모든 /api 상태 변경 요청에 대해 출처(Origin) 검사를 합니다. 판정 로직은 lib/csrf.ts(테스트 가능한 순수 함수).
export function middleware(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const ok = isRequestAllowed({
    method: req.method,
    origin: req.headers.get("origin"),
    secFetchSite: req.headers.get("sec-fetch-site"),
    host,
  });
  if (!ok) {
    return NextResponse.json({ error: "허용되지 않은 요청 출처입니다." }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
