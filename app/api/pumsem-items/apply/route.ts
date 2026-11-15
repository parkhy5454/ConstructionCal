import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { subscriptionBlock } from "@/lib/subscription";
import { materialOwned } from "@/lib/estimateData";
import { applyPumsemItem, ensureItemMaterial, getPumsemItem } from "@/lib/pumsemItems";
import { DISCIPLINES } from "@/lib/calc";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const blocked = await subscriptionBlock(user);
  if (blocked) return blocked;
  const body = await req.json().catch(() => null);
  const itemId = Number(body?.itemId);
  let materialId = Number(body?.materialId);
  const direct = body?.materialId == null; // 자재를 고르지 않으면 품셈 항목 자체를 내 품셈으로 담습니다
  const d = String(body?.discipline ?? "electrical");
  if (!(DISCIPLINES as readonly string[]).includes(d)) return NextResponse.json({ error: "업종이 올바르지 않습니다." }, { status: 400 });
  if (!Number.isInteger(itemId) || (!direct && !Number.isInteger(materialId))) return NextResponse.json({ error: "품셈 항목과 자재를 선택하세요." }, { status: 400 });
  const item = await getPumsemItem(itemId);
  if (!item || item.discipline !== d) return NextResponse.json({ error: "품셈 항목을 찾을 수 없습니다." }, { status: 404 });
  if (item.labors.length === 0) return NextResponse.json({ error: "이 항목에는 적용할 공수가 없습니다." }, { status: 400 });
  try {
    if (direct) materialId = await ensureItemMaterial(user.id, d, item);
    else if (!(await materialOwned(user.id, materialId, d as never))) return NextResponse.json({ error: "자재를 찾을 수 없습니다." }, { status: 404 });
    const r = await applyPumsemItem(user.id, d, materialId, item, body?.replace !== false);
    return NextResponse.json({ ok: true, materialId, ...r });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("pumsem apply failed", msg);
    return NextResponse.json({ error: `품셈을 담지 못했습니다: ${msg.slice(0, 200)}` }, { status: 500 });
  }
}
