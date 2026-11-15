import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { importPriceRows, type RawPriceRow } from "@/lib/priceItems";
import { DISCIPLINES } from "@/lib/calc";
import { isMissingTable } from "@/lib/security";

export const runtime = "nodejs";

// 관리자: 공용 자재 단가표를 묶음 단위로 적재합니다. first=true인 묶음에서 그 업종의 기존 단가표를 교체합니다.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await req.json().catch(() => null);
  const discipline = String(body?.discipline ?? "");
  if (!(DISCIPLINES as readonly string[]).includes(discipline)) return NextResponse.json({ error: "업종이 올바르지 않습니다." }, { status: 400 });
  const rows = body?.rows;
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 3000) return NextResponse.json({ error: "한 번에 1~3000건까지 보낼 수 있습니다." }, { status: 400 });
  try {
    const r = await importPriceRows(discipline, String(body?.basis ?? ""), rows as RawPriceRow[], body?.first === true);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: "price_items 테이블이 없습니다. 먼저 DB 마이그레이션(0011)을 실행하세요." }, { status: 409 });
    const m = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `저장 중 오류: ${m.slice(0, 200)}` }, { status: 500 });
  }
}
