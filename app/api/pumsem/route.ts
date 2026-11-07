import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getDb } from "@/lib/db";
import { pumsem } from "@/lib/schema";
import { ensureSeeded, getPumsem, materialOwned } from "@/lib/estimateData";
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
  const rows = await getPumsem(user.id, discipline);
  return NextResponse.json({ pumsem: rows });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const materialId = Number(body?.materialId);
  const laborCode = String(body?.laborCode ?? "").trim();
  const factor = Number(body?.factor ?? 0);
  if (!Number.isInteger(materialId)) return NextResponse.json({ error: "자재를 선택하세요." }, { status: 400 });
  if (!laborCode) return NextResponse.json({ error: "직종코드를 선택하세요." }, { status: 400 });
  if (!isFinite(factor) || factor < 0) return NextResponse.json({ error: "단위당공수가 올바르지 않습니다." }, { status: 400 });

  if (!(await materialOwned(user.id, materialId))) {
    return NextResponse.json({ error: "자재를 찾을 수 없습니다." }, { status: 404 });
  }

  const db = getDb();
  try {
    await db.insert(pumsem).values({ userId: user.id, materialId, laborCode, factor: String(factor) });
  } catch {
    return NextResponse.json({ error: "이미 해당 자재의 품셈이 등록되어 있습니다." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
