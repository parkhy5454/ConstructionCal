import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getProjectOwned, getMaterials, getDxfMappings } from "@/lib/estimateData";
import { parseDxf } from "@/lib/dxfImport";

export const runtime = "nodejs";

// 도면(.dxf) 업로드 → 레이어별 길이합계 / 블록별 개수를 집계하고,
// 저장된 매핑(레이어·블록명 ↔ 자재)이 있으면 자동으로 제안합니다.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const projectId = Number(params.id);
  if (!Number.isInteger(projectId)) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const owned = await getProjectOwned(user.id, projectId);
  if (!owned) return NextResponse.json({ error: "견적서를 찾을 수 없습니다." }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "DXF 파일을 첨부하세요." }, { status: 400 });
  }
  const name = (file as File).name || "";
  if (!name.toLowerCase().endsWith(".dxf")) {
    return NextResponse.json({
      error: "DXF 파일만 지원합니다. DWG 파일은 CAD 프로그램에서 '다른 이름으로 저장 → DXF'로 내보낸 뒤 업로드해주세요.",
    }, { status: 400 });
  }

  let text: string;
  try {
    text = await (file as File).text();
  } catch {
    return NextResponse.json({ error: "파일을 읽을 수 없습니다." }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseDxf(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "알 수 없는 오류";
    return NextResponse.json({ error: `DXF 분석에 실패했습니다: ${msg}` }, { status: 400 });
  }

  const [materials, mappings] = await Promise.all([getMaterials(user.id), getDxfMappings(user.id)]);
  const mapByKey = new Map(mappings.map((m) => [`${m.matchType}:${m.matchName}`, m]));

  const groups = parsed.groups.map((g) => {
    const suggestion = mapByKey.get(g.key);
    return {
      ...g,
      suggestedMaterialId: suggestion?.materialId ?? null,
      suggestedGroupName: suggestion?.groupName ?? "",
      suggestedUnitScale: suggestion ? suggestion.unitScale : g.kind === "count" ? 1 : 0.001,
    };
  });

  return NextResponse.json({
    groups,
    unsupported: parsed.unsupported,
    totalEntities: parsed.totalEntities,
    materials,
  });
}
