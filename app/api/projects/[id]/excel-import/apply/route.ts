import { subscriptionBlock } from "@/lib/subscription";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/currentUser";
import { getDb } from "@/lib/db";
import { bomItems, materials as materialsTable } from "@/lib/schema";
import { getProjectOwned, getMaterialsByIds, upsertExcelMappings } from "@/lib/estimateData";
import type { Discipline } from "@/lib/calc";

export const runtime = "nodejs";

const MAX_ITEMS = 3000;

type ApplyItem = {
  key: string;
  name: string;
  spec: string;
  unit: string;
  qty: number;
  groupName: string;
  materialId?: number; // 기존 자재 매칭
  newMaterial?: { price: number }; // 매칭이 없어 새 자재로 등록(품명/규격/단위는 행에서 가져옴, 단가는 원본 단가)
  saveMapping: boolean;
};

// 사용자가 매칭을 확인한 뒤 호출합니다: (선택) 기존 BOM 삭제 → 새 자재 등록 → BOM 생성 → 매칭 기억 저장.
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
  const rawItems: ApplyItem[] = Array.isArray(body?.items) ? body.items : [];
  const replace = body?.replace === true;
  if (rawItems.length > MAX_ITEMS) {
    return NextResponse.json({ error: `한 번에 ${MAX_ITEMS}개 행까지 반영할 수 있습니다.` }, { status: 400 });
  }

  // 내 업종의 자재만 허용 (다른 사용자/업종의 materialId를 넣는 요청 차단)
  const myMaterials = await getMaterialsByIds(user.id, discipline, rawItems.map((it) => (it && Number.isInteger(it.materialId) ? (it.materialId as number) : -1)));
  const myIds = new Set(myMaterials.map((m) => m.id));

  const valid = rawItems.filter(
    (it) =>
      it &&
      typeof it.name === "string" &&
      it.name.trim().length > 0 &&
      typeof it.groupName === "string" &&
      it.groupName.trim().length > 0 &&
      typeof it.qty === "number" &&
      isFinite(it.qty) &&
      it.qty > 0 &&
      ((Number.isInteger(it.materialId) && myIds.has(it.materialId as number)) ||
        (it.newMaterial != null && typeof it.newMaterial.price === "number" && isFinite(it.newMaterial.price)))
  );
  if (valid.length === 0) {
    return NextResponse.json({ error: "반영할 항목이 없습니다. 자재 매칭과 공종명을 확인하세요." }, { status: 400 });
  }

  const db = getDb();

  // 새 자재 등록 — 같은 품명|규격은 한 번만 만들고 모든 행이 공유합니다.
  const newIdByKey = new Map<string, number>();
  const toCreate = new Map<string, { name: string; spec: string; unit: string; price: number }>();
  for (const it of valid) {
    if (it.materialId != null && myIds.has(it.materialId)) continue;
    const k = `${it.name.trim()}|${(it.spec ?? "").trim()}`;
    if (!toCreate.has(k)) {
      toCreate.set(k, {
        name: it.name.trim().slice(0, 200),
        spec: (it.spec ?? "").trim().slice(0, 200),
        unit: ((it.unit ?? "").trim() || "식").slice(0, 20),
        price: Math.max(0, it.newMaterial?.price ?? 0),
      });
    }
  }
  if (toCreate.size > 0) {
    const entries = Array.from(toCreate.entries());
    const created = await db
      .insert(materialsTable)
      .values(
        entries.map(([, m]) => ({
          userId: user.id,
          discipline,
          category: "기타",
          name: m.name,
          spec: m.spec,
          unit: m.unit,
          price: String(m.price),
        }))
      )
      .returning({ id: materialsTable.id });
    entries.forEach(([k], i) => newIdByKey.set(k, created[i].id));
  }

  const resolveId = (it: ApplyItem): number =>
    it.materialId != null && myIds.has(it.materialId)
      ? it.materialId
      : (newIdByKey.get(`${it.name.trim()}|${(it.spec ?? "").trim()}`) as number);

  if (replace) {
    await db.delete(bomItems).where(eq(bomItems.projectId, projectId));
  }

  const bomRows = valid.map((it, idx) => ({
    projectId,
    groupName: it.groupName.trim().slice(0, 60),
    materialId: resolveId(it),
    qty: String(Math.round(it.qty * 100) / 100),
    sortOrder: replace ? idx : 9999 + idx,
  }));
  for (let i = 0; i < bomRows.length; i += 500) {
    await db.insert(bomItems).values(bomRows.slice(i, i + 500));
  }

  await upsertExcelMappings(
    user.id,
    discipline,
    valid
      .filter((it) => it.saveMapping && typeof it.key === "string" && it.key.length > 0)
      .map((it) => ({ key: it.key.slice(0, 200), materialId: resolveId(it), groupName: it.groupName.trim().slice(0, 60) }))
  );

  return NextResponse.json({ inserted: bomRows.length, createdMaterials: toCreate.size });
}
