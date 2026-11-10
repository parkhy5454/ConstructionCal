import { subscriptionBlock } from "@/lib/subscription";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getProjectOwned, getMaterials, getExcelMappings, getProjectBom } from "@/lib/estimateData";
import { matchRows } from "@/lib/excelMatch";
import type { Discipline } from "@/lib/calc";

export const runtime = "nodejs";

const MAX_ROWS = 2000;

// 엑셀에서 복사해 붙여넣은 행(품명·규격·단위·수량)을 파일 가져오기와 같은 방식으로 자재와 매칭해 돌려줍니다.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const blocked = await subscriptionBlock(user);
  if (blocked) return blocked;
  const projectId = Number(params.id);
  if (!Number.isInteger(projectId)) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  const owned = await getProjectOwned(user.id, projectId);
  if (!owned) return NextResponse.json({ error: "견적서를 찾을 수 없습니다." }, { status: 404 });
  const discipline = owned.discipline as Discipline;

  const body = await req.json().catch(() => null);
  const input: unknown[] = Array.isArray(body?.rows) ? body.rows : [];
  if (input.length === 0) return NextResponse.json({ error: "붙여넣은 내용에서 행을 찾지 못했습니다." }, { status: 400 });
  if (input.length > MAX_ROWS) return NextResponse.json({ error: `한 번에 ${MAX_ROWS}행까지 붙여넣을 수 있습니다.` }, { status: 400 });

  const parsed = input.flatMap((r, i) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const name = String(o.name ?? "").trim().slice(0, 200);
    const qty = Number(o.qty);
    if (!name || !isFinite(qty) || qty <= 0) return [];
    return [{
      sheet: "붙여넣기", rowNo: i + 1, groupName: String(o.groupName ?? "").trim().slice(0, 60) || "붙여넣기",
      name, spec: String(o.spec ?? "").trim().slice(0, 200), unit: String(o.unit ?? "").trim().slice(0, 20), qty,
      origPrice: null as number | null,
    }];
  });
  if (parsed.length === 0) return NextResponse.json({ error: "품명과 수량(0보다 큰 숫자)이 있는 행이 없습니다." }, { status: 400 });

  const [materials, memory, bom] = await Promise.all([
    getMaterials(user.id, discipline), getExcelMappings(user.id, discipline), getProjectBom(projectId),
  ]);
  const matches = matchRows(parsed, materials, memory);
  return NextResponse.json({
    sheets: [{ name: "붙여넣기", rowCount: parsed.length, defaultInclude: true }],
    rows: parsed.map((r, i) => ({ ...r, key: matches[i].key, suggestedMaterialId: matches[i].materialId, method: matches[i].method, score: matches[i].score })),
    warnings: [],
    needMapping: false,
    existingBomCount: bom.length,
    materials: materials.map((m) => ({ id: m.id, name: m.name, spec: m.spec, unit: m.unit, price: m.price })),
  });
}
