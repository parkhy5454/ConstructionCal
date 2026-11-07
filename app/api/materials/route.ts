import { subscriptionBlock } from "@/lib/subscription";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getDb } from "@/lib/db";
import { materials } from "@/lib/schema";
import { ensureSeeded, getMaterials } from "@/lib/estimateData";
import { DISCIPLINES, type Discipline } from "@/lib/calc";

export const runtime = "nodejs";

function parseDiscipline(v: string | null): Discipline {
  return (DISCIPLINES as readonly string[]).includes(v ?? "") ? (v as Discipline) : "electrical";
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const discipline = parseDiscipline(req.nextUrl.searchParams.get("discipline"));
  await ensureSeeded(user.id, discipline);
  const rows = await getMaterials(user.id, discipline);
  return NextResponse.json({ materials: rows });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const blocked = await subscriptionBlock(user);
  if (blocked) return blocked;
  const body = await req.json().catch(() => null);
  const discipline = parseDiscipline(body?.discipline);
  const name = String(body?.name ?? "").trim();
  const unit = String(body?.unit ?? "").trim();
  if (!name || !unit) return NextResponse.json({ error: "품명과 단위는 필수입니다." }, { status: 400 });
  const spec = String(body?.spec ?? "").trim();
  const category = String(body?.category ?? "").trim();
  const price = Number(body?.price ?? 0);
  if (!isFinite(price) || price < 0) return NextResponse.json({ error: "단가가 올바르지 않습니다." }, { status: 400 });

  const db = getDb();
  const [row] = await db.insert(materials).values({ userId: user.id, discipline, category, name, spec, unit, price: String(price) }).returning();
  return NextResponse.json({ material: { id: row.id, category: row.category, name: row.name, spec: row.spec, unit: row.unit, price } });
}
