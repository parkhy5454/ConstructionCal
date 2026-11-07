import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { releaseSid } from "@/lib/sessionLimit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const payload = verifySession(req.cookies.get(SESSION_COOKIE)?.value ?? "");
  if (payload) {
    try {
      await releaseSid(payload.uid, payload.sid);
    } catch (e) {
      console.error("[logout] 세션 해제 실패:", e instanceof Error ? e.message : e);
    }
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
