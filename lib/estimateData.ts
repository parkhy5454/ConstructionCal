import { eq, and } from "drizzle-orm";
import { getDb } from "./db";
import { materials, laborRates, pumsem, rateSettings, projects, bomItems, dxfMappings } from "./schema";
import {
  DEFAULT_MATERIALS,
  DEFAULT_LABOR_RATES,
  DEFAULT_PUMSEM_FACTORS,
  DEFAULT_RATE_SETTINGS,
  DEFAULT_BOM,
  type Material,
  type LaborRate,
  type Pumsem,
  type RateSettings,
  type BomItem,
} from "./calc";

const num = (v: string | number | null | undefined): number => (v == null ? 0 : typeof v === "number" ? v : parseFloat(v));

// 신규 계정 최초 접근 시, 검증된 예시 데이터로 자재단가/품셈/노임단가/비율설정/견적서 1건을 자동 시드합니다.
// (실제 서비스에서는 이 예시값을 사용자가 자신이 구매한 물가자료/표준품셈으로 교체합니다.)
export async function ensureSeeded(userId: number) {
  const db = getDb();
  const existing = await db.select().from(rateSettings).where(eq(rateSettings.userId, userId)).limit(1);
  if (existing.length > 0) return;

  await db.insert(rateSettings).values({ userId, ...stringifyRates(DEFAULT_RATE_SETTINGS) });

  await db.insert(laborRates).values(
    DEFAULT_LABOR_RATES.map((l) => ({ userId, code: l.code, name: l.name, rate: String(l.rate) }))
  );

  const insertedMaterials = await db
    .insert(materials)
    .values(DEFAULT_MATERIALS.map((m) => ({ userId, category: m.category, name: m.name, spec: m.spec, unit: m.unit, price: String(m.price) })))
    .returning();

  const matKey = (name: string, spec: string) => `${name}|${spec}`;
  const matIdByKey = new Map(insertedMaterials.map((m) => [matKey(m.name, m.spec), m.id]));

  const pumsemRows = DEFAULT_PUMSEM_FACTORS.map((p) => {
    const materialId = matIdByKey.get(matKey(p.name, p.spec));
    return materialId ? { userId, materialId, laborCode: p.laborCode, factor: String(p.factor) } : null;
  }).filter((r): r is NonNullable<typeof r> => r !== null);
  if (pumsemRows.length > 0) await db.insert(pumsem).values(pumsemRows);

  const [project] = await db.insert(projects).values({ userId, name: "예시 견적서" }).returning();
  const bomRows = DEFAULT_BOM.map((b, idx) => {
    const materialId = matIdByKey.get(matKey(b.name, b.spec));
    return materialId ? { projectId: project.id, groupName: b.g, materialId, qty: String(b.qty), sortOrder: idx } : null;
  }).filter((r): r is NonNullable<typeof r> => r !== null);
  if (bomRows.length > 0) await db.insert(bomItems).values(bomRows);
}

function stringifyRates(r: RateSettings) {
  return {
    indirectLabor: String(r.indirectLabor),
    etcExpense: String(r.etcExpense),
    industrialIns: String(r.industrialIns),
    employIns: String(r.employIns),
    gna: String(r.gna),
    profit: String(r.profit),
    vat: String(r.vat),
    pipeAccessory: String(r.pipeAccessory),
    consumable: String(r.consumable),
    toolLoss: String(r.toolLoss),
  };
}

export async function getMaterials(userId: number): Promise<Material[]> {
  const db = getDb();
  const rows = await db.select().from(materials).where(eq(materials.userId, userId));
  return rows.map((m) => ({ id: m.id, category: m.category, name: m.name, spec: m.spec, unit: m.unit, price: num(m.price) }));
}

export async function getLaborRates(userId: number): Promise<LaborRate[]> {
  const db = getDb();
  const rows = await db.select().from(laborRates).where(eq(laborRates.userId, userId));
  return rows.map((l) => ({ code: l.code, name: l.name, rate: num(l.rate) }));
}

export async function getPumsem(userId: number): Promise<Array<Pumsem & { id: number }>> {
  const db = getDb();
  const rows = await db.select().from(pumsem).where(eq(pumsem.userId, userId));
  return rows.map((p) => ({ id: p.id, materialId: p.materialId, laborCode: p.laborCode, factor: num(p.factor) }));
}

export async function getRateSettings(userId: number): Promise<RateSettings> {
  const db = getDb();
  const rows = await db.select().from(rateSettings).where(eq(rateSettings.userId, userId)).limit(1);
  if (rows.length === 0) return { ...DEFAULT_RATE_SETTINGS };
  const r = rows[0];
  return {
    indirectLabor: num(r.indirectLabor),
    etcExpense: num(r.etcExpense),
    industrialIns: num(r.industrialIns),
    employIns: num(r.employIns),
    gna: num(r.gna),
    profit: num(r.profit),
    vat: num(r.vat),
    pipeAccessory: num(r.pipeAccessory),
    consumable: num(r.consumable),
    toolLoss: num(r.toolLoss),
  };
}

export async function getProjects(userId: number) {
  const db = getDb();
  return db.select().from(projects).where(eq(projects.userId, userId)).orderBy(projects.id);
}

export async function getProjectBom(projectId: number): Promise<BomItem[]> {
  const db = getDb();
  const rows = await db.select().from(bomItems).where(eq(bomItems.projectId, projectId)).orderBy(bomItems.sortOrder, bomItems.id);
  return rows.map((b) => ({ id: b.id, groupName: b.groupName, materialId: b.materialId, qty: num(b.qty) }));
}

export async function getProjectOwned(userId: number, projectId: number) {
  const db = getDb();
  const rows = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId))).limit(1);
  return rows[0] ?? null;
}

// ---------- DXF 도면 매핑 (레이어/블록명 ↔ 자재) ----------

export type DxfMapping = {
  id: number;
  matchType: "layer" | "block";
  matchName: string;
  materialId: number;
  groupName: string;
  unitScale: number;
};

export async function getDxfMappings(userId: number): Promise<DxfMapping[]> {
  const db = getDb();
  const rows = await db.select().from(dxfMappings).where(eq(dxfMappings.userId, userId));
  return rows.map((r) => ({
    id: r.id,
    matchType: r.matchType as "layer" | "block",
    matchName: r.matchName,
    materialId: r.materialId,
    groupName: r.groupName,
    unitScale: num(r.unitScale),
  }));
}

export async function upsertDxfMapping(
  userId: number,
  m: { matchType: "layer" | "block"; matchName: string; materialId: number; groupName: string; unitScale: number }
) {
  const db = getDb();
  const existing = await db
    .select()
    .from(dxfMappings)
    .where(and(eq(dxfMappings.userId, userId), eq(dxfMappings.matchType, m.matchType), eq(dxfMappings.matchName, m.matchName)))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(dxfMappings)
      .set({ materialId: m.materialId, groupName: m.groupName, unitScale: String(m.unitScale) })
      .where(eq(dxfMappings.id, existing[0].id));
  } else {
    await db.insert(dxfMappings).values({
      userId,
      matchType: m.matchType,
      matchName: m.matchName,
      materialId: m.materialId,
      groupName: m.groupName,
      unitScale: String(m.unitScale),
    });
  }
}
