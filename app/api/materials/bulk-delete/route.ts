import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { subscriptionBlock } from "@/lib/subscription";
import { deleteMaterialsByIds } from "@/lib/estimateData";

export const runtime = "nodejs";

// 선택한 내 자재를 한꺼번에 지웁니다(견적서에서 쓰는 자재는 남김).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const blocked = await subscriptionBlock(user);
  if (blocked) return blocked;
  const body = await req.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids.map(Number).filter((n: number) => Number.isInteger(n)) : [];
  if (ids.length === 0) return NextResponse.json({ error: "지울 자재를 선택하세요." }, { status: 400 });
  return NextResponse.json(await deleteMaterialsByIds(user.id, ids));
}
