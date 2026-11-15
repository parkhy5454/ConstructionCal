import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { subscriptionBlock } from "@/lib/subscription";
import { adoptPriceItem } from "@/lib/priceItems";
import { DISCIPLINES } from "@/lib/calc";

export const runtime = "nodejs";

// 공용 단가표 항목을 내 자재로 담습니다(이미 있으면 단가만 갱신).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const blocked = await subscriptionBlock(user);
  if (blocked) return blocked;
  const body = await req.json().catch(() => null);
  const d = String(body?.discipline ?? "electrical");
  const itemId = Number(body?.itemId);
  if (!(DISCIPLINES as readonly string[]).includes(d)) return NextResponse.json({ error: "업종이 올바르지 않습니다." }, { status: 400 });
  if (!Number.isInteger(itemId)) return NextResponse.json({ error: "항목을 선택하세요." }, { status: 400 });
  const m = await adoptPriceItem(user.id, d, itemId);
  if (!m) return NextResponse.json({ error: "단가표 항목을 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ material: m });
}
