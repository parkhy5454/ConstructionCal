import { subscriptionBlock } from "@/lib/subscription";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getProjectOwned, getMaterials, getExcelMappings, getProjectBom } from "@/lib/estimateData";
import { parseExcelBoq } from "@/lib/excelImport";
import { matchRows } from "@/lib/excelMatch";
import type { Discipline } from "@/lib/calc";

export const runtime = "nodejs";

const MAX_BYTES = 4 * 1024 * 1024; // Vercel 서버리스 요청 본문 한도(4.5MB) 안쪽

// 기존 엑셀 내역서(.xlsx) 업로드 → 품명/규격/단위/수량을 읽고 우리 자재 DB와 매칭해 제안합니다.
// 저장된 매칭(이전에 확정한 표기)이 있으면 그것을 우선 사용합니다.
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

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "엑셀 파일을 첨부하세요." }, { status: 400 });
  }
  const f = file as File;
  const name = (f.name || "").toLowerCase();
  if (name.endsWith(".xls")) {
    return NextResponse.json({
      error: "구형 .xls 파일은 읽을 수 없습니다. 엑셀에서 '다른 이름으로 저장 → Excel 통합 문서(.xlsx)'로 저장한 뒤 올려주세요.",
    }, { status: 400 });
  }
  if (!name.endsWith(".xlsx")) {
    return NextResponse.json({ error: ".xlsx 엑셀 파일만 지원합니다." }, { status: 400 });
  }
  if (f.size > MAX_BYTES) {
    return NextResponse.json({ error: "파일이 너무 큽니다(4MB 이하). 필요한 시트만 남겨 다시 저장해주세요." }, { status: 400 });
  }

  let parsed;
  try {
    parsed = await parseExcelBoq(await f.arrayBuffer());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "알 수 없는 오류";
    return NextResponse.json({ error: `엑셀 분석에 실패했습니다(암호가 걸렸거나 손상된 파일일 수 있습니다): ${msg}` }, { status: 400 });
  }

  const [materials, memory, bom] = await Promise.all([
    getMaterials(user.id, discipline),
    getExcelMappings(user.id, discipline),
    getProjectBom(projectId),
  ]);
  const matches = matchRows(parsed.rows, materials, memory);

  const rows = parsed.rows.map((r, i) => ({
    ...r,
    key: matches[i].key,
    suggestedMaterialId: matches[i].materialId,
    method: matches[i].method,
    score: matches[i].score,
  }));

  return NextResponse.json({
    sheets: parsed.sheets,
    rows,
    warnings: parsed.warnings,
    existingBomCount: bom.length,
    materials: materials.map((m) => ({ id: m.id, name: m.name, spec: m.spec, unit: m.unit, price: m.price })),
  });
}
