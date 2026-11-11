import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { searchPumsemItems } from "@/lib/pumsemItems";
import { DISCIPLINES } from "@/lib/calc";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const d = sp.get("discipline") ?? "electrical";
  if (!(DISCIPLINES as readonly string[]).includes(d)) return NextResponse.json({ error: "업종이 올바르지 않습니다." }, { status: 400 });
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 30, 1), 100);
  const offset = Math.max(Number(sp.get("offset")) || 0, 0);
  const r = await searchPumsemItems(d, (sp.get("q") ?? "").slice(0, 100), limit, offset);
  return NextResponse.json(r);
}
