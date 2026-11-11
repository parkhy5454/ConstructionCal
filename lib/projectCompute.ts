// 견적서 계산에 필요한 데이터를 불러와 계산까지 한 번에 수행하는 공통 함수들.
import { inArray } from "drizzle-orm";
import { getDb } from "./db";
import { bomItems } from "./schema";
import { getMaterialsByIds, getLaborRates, getPumsemForMaterials, getRateSettings, getProjectBom } from "./estimateData";
import { getMeta, getMetaMap, type Meta } from "./projectMeta";
import { computeAll, DISCIPLINES, type Discipline, type ComputeResult, type Material, type BomItem } from "./calc";

export type ProjectLike = { id: number; userId: number; discipline: string; name: string };

export async function computeProject(project: ProjectLike) {
  const discipline = project.discipline as Discipline;
  // 자재 DB가 수만 건이어도 빠르도록, 이 견적서에 쓰인 자재·품셈만 읽습니다.
  const bom = await getProjectBom(project.id);
  const ids = bom.map((b) => b.materialId);
  const [materials, laborRates, pum, rates, meta] = await Promise.all([
    getMaterialsByIds(project.userId, discipline, ids),
    getLaborRates(project.userId, discipline),
    getPumsemForMaterials(project.userId, ids),
    getRateSettings(project.userId, discipline),
    getMeta(project.id),
  ]);
  const result = computeAll(materials, pum, laborRates, rates, bom, meta.surcharges);
  return { materials, laborRates, bom, meta, result, rates };
}

export type ProjectTotals = { sumMat: number; sumLabor: number; sumExpense: number; final: number; itemCount: number };

// 여러 견적서의 합계를 한 번에 구합니다(업종별 자재/품셈/요율은 한 번만 읽음). 목록·통계 화면용.
export async function computeTotals(userId: number, list: Array<{ id: number; discipline: string }>): Promise<Map<number, ProjectTotals>> {
  const out = new Map<number, ProjectTotals>();
  if (list.length === 0) return out;
  const db = getDb();
  const ids = list.map((p) => p.id);
  const [metaMap, bomRows] = await Promise.all([
    getMetaMap(ids),
    db.select().from(bomItems).where(inArray(bomItems.projectId, ids)).orderBy(bomItems.sortOrder, bomItems.id),
  ]);
  const bomByProject = new Map<number, BomItem[]>();
  for (const b of bomRows) {
    const arr = bomByProject.get(b.projectId) ?? [];
    arr.push({ id: b.id, groupName: b.groupName, materialId: b.materialId, qty: parseFloat(b.qty) });
    bomByProject.set(b.projectId, arr);
  }
  for (const d of DISCIPLINES) {
    const group = list.filter((p) => p.discipline === d);
    if (group.length === 0) continue;
    const ids = group.flatMap((p) => (bomByProject.get(p.id) ?? []).map((b) => b.materialId));
    const [materials, laborRates, pum, rates] = await Promise.all([
      getMaterialsByIds(userId, d, ids), getLaborRates(userId, d), getPumsemForMaterials(userId, ids), getRateSettings(userId, d),
    ]);
    for (const p of group) {
      const bom = bomByProject.get(p.id) ?? [];
      const meta: Meta | undefined = metaMap.get(p.id);
      const r: ComputeResult = computeAll(materials as Material[], pum, laborRates, rates, bom, meta?.surcharges);
      out.set(p.id, { sumMat: r.sumMat, sumLabor: r.sumLabor, sumExpense: r.sumExpense, final: r.final, itemCount: bom.length });
    }
  }
  return out;
}
