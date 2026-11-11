import { subscriptionBlock } from "@/lib/subscription";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getDb } from "@/lib/db";
import { bomItems } from "@/lib/schema";
import { getProjectOwned, upsertDxfMapping, getMaterialsByIds } from "@/lib/estimateData";
import type { Discipline } from "@/lib/calc";

export const runtime = "nodejs";

type ApplyItem = {
  matchType: "layer" | "block";
  matchName: string;
  materialId: number;
  groupName: string;
  unitScale: number;
  rawQty: number;
  saveMapping: boolean;
};

// 사용자가 매핑/수량을 확인한 뒤 "BOM에 추가"를 누르면 실제 bom_items를 생성하고,
// saveMapping이 true인 항목은 다음 도면 업로드 때 자동 제안되도록 매핑을 저장합니다.
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
  const items: ApplyItem[] = Array.isArray(body?.items) ? body.items : [];
  // 내 업종의 자재만 허용 (다른 사용자/업종의 materialId를 끼워 넣는 요청 차단)
  const myIds = new Set((await getMaterialsByIds(user.id, discipline, items.map((it) => (it && Number.isInteger(it.materialId) ? it.materialId : -1)))).map((m) => m.id));
  const valid = items.filter(
    (it) =>
      it &&
      myIds.has(it.materialId) &&
      (it.matchType === "layer" || it.matchType === "block") &&
      typeof it.matchName === "string" &&
      it.matchName.length > 0 &&
      Number.isInteger(it.materialId) &&
      typeof it.groupName === "string" &&
      it.groupName.trim().length > 0 &&
      isFinite(it.unitScale) &&
      isFinite(it.rawQty)
  );
  if (valid.length === 0) {
    return NextResponse.json({ error: "추가할 항목이 없습니다. 자재 매핑과 공종명을 확인하세요." }, { status: 400 });
  }

  const db = getDb();
  const rows = valid.map((it, idx) => ({
    projectId,
    groupName: it.groupName.trim(),
    materialId: it.materialId,
    qty: String(Math.round(it.rawQty * it.unitScale * 100) / 100),
    sortOrder: 9999 + idx,
  }));
  const inserted = await db.insert(bomItems).values(rows).returning();

  for (const it of valid) {
    if (it.saveMapping) {
      await upsertDxfMapping(user.id, discipline, {
        matchType: it.matchType,
        matchName: it.matchName,
        materialId: it.materialId,
        groupName: it.groupName.trim(),
        unitScale: it.unitScale,
      });
    }
  }

  return NextResponse.json({ inserted: inserted.length });
}
