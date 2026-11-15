import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { subscriptionBlock } from "@/lib/subscription";
import { removeSampleMaterials } from "@/lib/estimateData";
import { DISCIPLINES, type Discipline } from "@/lib/calc";

export const runtime = "nodejs";

// 예전에 자동으로 들어간 예시 자재를 내 자재에서 지웁니다(견적서에서 쓰는 자재는 남김).
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const blocked = await subscriptionBlock(user);
  if (blocked) return blocked;
  const d = req.nextUrl.searchParams.get("discipline") ?? "all";
  if (d !== "all" && !(DISCIPLINES as readonly string[]).includes(d)) return NextResponse.json({ error: "업종이 올바르지 않습니다." }, { status: 400 });
  const list = d === "all" ? [...DISCIPLINES] : [d as Discipline];
  let deleted = 0, kept = 0;
  for (const x of list) { const r = await removeSampleMaterials(user.id, x); deleted += r.deleted; kept += r.kept; }
  return NextResponse.json({ deleted, kept });
}
