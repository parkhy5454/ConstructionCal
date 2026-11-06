import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getDb } from "@/lib/db";
import { laborRates } from "@/lib/schema";
import { ensureSeeded, getLaborRates } from "@/lib/estimateData";
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
  const rows = await getLaborRates(user.id, discipline);
  return NextResponse.json({ laborRates: rows });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const discipline = parseDiscipline(body?.discipline);
  const code = String(body?.code ?? "").trim();
  const name = String(body?.name ?? "").trim();
  const rate = Number(body?.rate ?? 0);
  if (!code || !name) return NextResponse.json({ error: "직종코드와 명칭은 필수입니다." }, { status: 400 });
  if (!isFinite(rate) || rate < 0) return NextResponse.json({ error: "노임단가가 올바르지 않습니다." }, { status: 400 });

  const db = getDb();
  try {
    await db.insert(laborRates).values({ userId: user.id, discipline, code, name, rate: String(rate) });
  } catch {
    return NextResponse.json({ error: "이미 존재하는 직종코드입니다." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
