import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { rateLimitAsync } from "@/lib/rateLimit";
import { exportUserData } from "@/lib/account";

export const runtime = "nodejs";

// 내 데이터 내려받기(JSON). 구독이 끝난 뒤에도 가능해야 하므로 구독 가드를 적용하지 않습니다.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!(await rateLimitAsync(`export:${user.id}`, 5, 60 * 60_000))) {
    return NextResponse.json({ error: "내보내기를 너무 자주 요청했습니다. 잠시 후 다시 시도하세요." }, { status: 429 });
  }
  const data = await exportUserData(user.id);
  if (!data) return NextResponse.json({ error: "계정을 찾을 수 없습니다." }, { status: 404 });
  const name = encodeURIComponent(`concal-data-${new Date().toISOString().slice(0, 10)}.json`);
  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename*=UTF-8''${name}`, "Cache-Control": "no-store" },
  });
}
