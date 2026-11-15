import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { subscriptionBlock } from "@/lib/subscription";
import { deleteAllPumsem, deletePumsemByIds } from "@/lib/estimateData";
import { DISCIPLINES, type Discipline } from "@/lib/calc";

export const runtime = "nodejs";

// 내 품셈(공수) 행을 선택해서 또는 업종 전체를 한꺼번에 지웁니다. 자재는 지우지 않습니다.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const blocked = await subscriptionBlock(user);
  if (blocked) return blocked;
  const body = await req.json().catch(() => null);
  if (body?.all === true) {
    const d = String(body?.discipline ?? "");
    if (!(DISCIPLINES as readonly string[]).includes(d)) return NextResponse.json({ error: "업종이 올바르지 않습니다." }, { status: 400 });
    return NextResponse.json(await deleteAllPumsem(user.id, d as Discipline));
  }
  const ids = Array.isArray(body?.ids) ? body.ids.map(Number).filter((n: number) => Number.isInteger(n)) : [];
  if (ids.length === 0) return NextResponse.json({ error: "지울 품셈을 선택하세요." }, { status: 400 });
  return NextResponse.json(await deletePumsemByIds(user.id, ids));
}
