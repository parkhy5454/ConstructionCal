import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { suggestPumsem } from "@/lib/pumsemSuggest";
import { DISCIPLINES } from "@/lib/calc";

export const runtime = "nodejs";

// 품셈이 없는 자재들에 대해 표준품셈 책의 후보를 찾아 돌려줍니다(저장은 하지 않음).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const d = String(body?.discipline ?? "electrical");
  if (!(DISCIPLINES as readonly string[]).includes(d)) return NextResponse.json({ error: "업종이 올바르지 않습니다." }, { status: 400 });
  const items = Array.isArray(body?.items) ? body.items.slice(0, 30) : [];
  const out: Record<string, unknown> = {};
  for (const it of items) {
    const id = Number(it?.materialId);
    if (!Number.isInteger(id)) continue;
    out[id] = await suggestPumsem(d, String(it?.name ?? ""), String(it?.spec ?? ""), 3);
  }
  return NextResponse.json({ suggestions: out });
}
