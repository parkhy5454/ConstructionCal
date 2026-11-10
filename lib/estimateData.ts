import { eq, and, ne, sql } from "drizzle-orm";
import { getDb } from "./db";
import { materials, laborRates, pumsem, rateSettings, projects, bomItems, dxfMappings } from "./schema";
import {
  DEFAULT_MATERIALS,
  DEFAULT_LABOR_RATES,
  DEFAULT_PUMSEM_FACTORS,
  DEFAULT_RATE_SETTINGS,
  DEFAULT_BOM,
  DEFAULT_MATERIALS_BY_DISCIPLINE,
  DEFAULT_LABOR_RATES_BY_DISCIPLINE,
  DEFAULT_PUMSEM_FACTORS_BY_DISCIPLINE,
  DEFAULT_BOM_BY_DISCIPLINE,
  type Material,
  type LaborRate,
  type Pumsem,
  type RateSettings,
  type BomItem,
  type Discipline,
} from "./calc";

const num = (v: string | number | null | undefined): number => (v == null ? 0 : typeof v === "number" ? v : parseFloat(v));
const matKey = (name: string, spec: string) => `${name}|${spec}`;

// 신규 계정이 어떤 업종에 처음 접근하면 그 업종의 rate_settings를 자동 생성합니다.
// "전기" 업종은 검증된 예시 자재단가/품셈/노임단가/견적서 1건까지 함께 시드합니다.
// "통신"·"소방" 업종은 종합물가정보 자재단가 + 표준품셈 공수 + 시중노임단가까지 시드하여
// 실제 노무비가 반영된 일위대가 계산이 가능하며, 업종 첫 접근 시 예시 견적서 1건도 만들어 줍니다.
// (실제 서비스에서는 이 예시값을 사용자가 자신이 구매한 물가자료/표준품셈으로 교체합니다.)
// 그 외 업종은 법정 비율의 출발값만 넣어두고, 자재/품셈은 사용자가 직접 채우도록 비워둡니다.
// 한 화면이 자재·노임·품셈 API를 동시에 부르면 같은 업종을 동시에 시드하려다 충돌(유니크 위반 500)하거나
// 일부 목록이 비어 보일 수 있어, 같은 서버 인스턴스에서는 사용자·업종별로 시드를 한 번에 하나만 실행합니다.
const seeding = new Map<string, Promise<void>>();
export function ensureSeeded(userId: number, discipline: Discipline = "electrical"): Promise<void> {
  const key = `${userId}:${discipline}`;
  const running = seeding.get(key);
  if (running) return running;
  const p = seedOnce(userId, discipline).finally(() => seeding.delete(key));
  seeding.set(key, p);
  return p;
}

async function seedOnce(userId: number, discipline: Discipline): Promise<void> {
  const db = getDb();
  const existingRates = await db
    .select()
    .from(rateSettings)
    .where(and(eq(rateSettings.userId, userId), eq(rateSettings.discipline, discipline)))
    .limit(1);
  if (existingRates.length === 0) {
    await db.insert(rateSettings).values({ userId, discipline, ...stringifyRates(DEFAULT_RATE_SETTINGS) }).onConflictDoNothing();
  }

  if (discipline === "electrical") {
    if (existingRates.length > 0) return; // 전기는 이미 전체 시드가 끝난 계정이므로 더 할 일 없음

    await db.insert(laborRates).values(
      DEFAULT_LABOR_RATES.map((l) => ({ userId, discipline, code: l.code, name: l.name, rate: String(l.rate) }))
    ).onConflictDoNothing();

    const insertedMaterials = await db
      .insert(materials)
      .values(DEFAULT_MATERIALS.map((m) => ({ userId, discipline, category: m.category, name: m.name, spec: m.spec, unit: m.unit, price: String(m.price) })))
      .returning();

    const matIdByKey = new Map(insertedMaterials.map((m) => [matKey(m.name, m.spec), m.id]));

    const pumsemRows = DEFAULT_PUMSEM_FACTORS.map((p) => {
      const materialId = matIdByKey.get(matKey(p.name, p.spec));
      return materialId ? { userId, materialId, laborCode: p.laborCode, factor: String(p.factor) } : null;
    }).filter((r): r is NonNullable<typeof r> => r !== null);
    if (pumsemRows.length > 0) await db.insert(pumsem).values(pumsemRows).onConflictDoNothing();

    const [project] = await db.insert(projects).values({ userId, discipline, name: "예시 견적서" }).returning();
    const bomRows = DEFAULT_BOM.map((b, idx) => {
      const materialId = matIdByKey.get(matKey(b.name, b.spec));
      return materialId ? { projectId: project.id, groupName: b.g, materialId, qty: String(b.qty), sortOrder: idx } : null;
    }).filter((r): r is NonNullable<typeof r> => r !== null);
    if (bomRows.length > 0) await db.insert(bomItems).values(bomRows);
    return;
  }

  // 전기 외 업종: 자재단가 시드 데이터가 있고 아직 자재가 하나도 없으면 1회성으로 채워넣음
  const defaults = DEFAULT_MATERIALS_BY_DISCIPLINE[discipline];
  let allMaterials: Array<{ id: number; name: string; spec: string }> = [];
  if (defaults && defaults.length > 0) {
    const existingMaterials = await db
      .select({ id: materials.id, name: materials.name, spec: materials.spec })
      .from(materials)
      .where(and(eq(materials.userId, userId), eq(materials.discipline, discipline)));
    if (existingMaterials.length === 0) {
      allMaterials = await db
        .insert(materials)
        .values(defaults.map((m) => ({ userId, discipline, category: m.category, name: m.name, spec: m.spec, unit: m.unit, price: String(m.price) })))
        .returning();
    } else {
      allMaterials = existingMaterials;
    }
  }

  // 노임단가(시중노임단가) 시드 — 표준품셈 공수 데이터가 있는 업종만 해당. 자재가 먼저 시드된 기존 계정도
  // 이 단계가 비어있으면 1회성으로 채워넣습니다(품셈 데이터가 나중에 추가된 경우의 소급 적용).
  const laborDefaults = DEFAULT_LABOR_RATES_BY_DISCIPLINE[discipline];
  if (laborDefaults && laborDefaults.length > 0) {
    const existingLabor = await db
      .select({ id: laborRates.id })
      .from(laborRates)
      .where(and(eq(laborRates.userId, userId), eq(laborRates.discipline, discipline)))
      .limit(1);
    if (existingLabor.length === 0) {
      await db.insert(laborRates).values(
        laborDefaults.map((l) => ({ userId, discipline, code: l.code, name: l.name, rate: String(l.rate) }))
      ).onConflictDoNothing();
    }
  }

  // 표준품셈(공수) 시드 — 자재명|규격으로 현재 보유중인 material id를 매칭
  const pumsemDefaults = DEFAULT_PUMSEM_FACTORS_BY_DISCIPLINE[discipline];
  if (pumsemDefaults && pumsemDefaults.length > 0 && allMaterials.length > 0) {
    const existingPumsem = await db
      .select({ id: pumsem.id })
      .from(pumsem)
      .innerJoin(materials, eq(materials.id, pumsem.materialId))
      .where(and(eq(pumsem.userId, userId), eq(materials.discipline, discipline)))
      .limit(1);
    if (existingPumsem.length === 0) {
      const matIdByKey = new Map(allMaterials.map((m) => [matKey(m.name, m.spec), m.id]));
      const pumsemRows = pumsemDefaults
        .map((p) => {
          const materialId = matIdByKey.get(matKey(p.name, p.spec));
          return materialId ? { userId, materialId, laborCode: p.laborCode, factor: String(p.factor) } : null;
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
      if (pumsemRows.length > 0) await db.insert(pumsem).values(pumsemRows).onConflictDoNothing();
    }
  }

  // 예시 견적서 — 이 업종에 처음 접근한 계정(rate_settings가 방금 만들어진 경우)에게 1회만 생성합니다.
  // 사용자가 지운 뒤 다시 만들어지지 않도록, 이미 이 업종을 쓰던 계정에는 소급 생성하지 않습니다.
  const exampleBom = DEFAULT_BOM_BY_DISCIPLINE[discipline];
  if (existingRates.length === 0 && exampleBom && exampleBom.length > 0 && allMaterials.length > 0) {
    const matIdByKey = new Map(allMaterials.map((m) => [matKey(m.name, m.spec), m.id]));
    const bomRows = exampleBom
      .map((b, idx) => {
        const materialId = matIdByKey.get(matKey(b.name, b.spec));
        return materialId ? { groupName: b.g, materialId, qty: String(b.qty), sortOrder: idx } : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (bomRows.length > 0) {
      const [project] = await db.insert(projects).values({ userId, discipline, name: "예시 견적서" }).returning();
      await db.insert(bomItems).values(bomRows.map((r) => ({ ...r, projectId: project.id })));
    }
  }
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

export async function getMaterials(userId: number, discipline: Discipline): Promise<Material[]> {
  const db = getDb();
  const rows = await db.select().from(materials).where(and(eq(materials.userId, userId), eq(materials.discipline, discipline)));
  return rows.map((m) => ({ id: m.id, category: m.category, name: m.name, spec: m.spec, unit: m.unit, price: num(m.price) }));
}

// 이 자재가 이 사용자 것인지(필요하면 업종까지) 확인 — 다른 사용자의 자재 ID를 끼워 넣는 요청을 막습니다.
export async function materialOwned(userId: number, materialId: number, discipline?: Discipline): Promise<boolean> {
  const db = getDb();
  const conds = [eq(materials.id, materialId), eq(materials.userId, userId)];
  if (discipline) conds.push(eq(materials.discipline, discipline));
  const rows = await db.select({ id: materials.id }).from(materials).where(and(...conds)).limit(1);
  return rows.length > 0;
}

export async function getLaborRates(userId: number, discipline: Discipline): Promise<Array<LaborRate & { id: number }>> {
  const db = getDb();
  const rows = await db.select().from(laborRates).where(and(eq(laborRates.userId, userId), eq(laborRates.discipline, discipline)));
  return rows.map((l) => ({ id: l.id, code: l.code, name: l.name, rate: num(l.rate) }));
}

// pumsem 자체엔 discipline 컬럼이 없음 — materialId가 가리키는 자재의 업종으로 자연히 스코프됨
export async function getPumsem(userId: number, discipline: Discipline): Promise<Array<Pumsem & { id: number }>> {
  const db = getDb();
  const rows = await db
    .select({ id: pumsem.id, materialId: pumsem.materialId, laborCode: pumsem.laborCode, factor: pumsem.factor })
    .from(pumsem)
    .innerJoin(materials, eq(materials.id, pumsem.materialId))
    .where(and(eq(pumsem.userId, userId), eq(materials.discipline, discipline)));
  return rows.map((p) => ({ id: p.id, materialId: p.materialId, laborCode: p.laborCode, factor: num(p.factor) }));
}

export async function getRateSettings(userId: number, discipline: Discipline): Promise<RateSettings> {
  const db = getDb();
  const rows = await db
    .select()
    .from(rateSettings)
    .where(and(eq(rateSettings.userId, userId), eq(rateSettings.discipline, discipline)))
    .limit(1);
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

// ---------- DXF 도면 매핑 (레이어/블록명 ↔ 자재, 업종별로 격리) ----------

export type DxfMapping = {
  id: number;
  matchType: "layer" | "block";
  matchName: string;
  materialId: number;
  groupName: string;
  unitScale: number;
};

export async function getDxfMappings(userId: number, discipline: Discipline): Promise<DxfMapping[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(dxfMappings)
    // "excel" 유형은 엑셀 내역서 매칭 기억(아래 getExcelMappings)이므로 도면 매핑에서는 제외
    .where(and(eq(dxfMappings.userId, userId), eq(dxfMappings.discipline, discipline), ne(dxfMappings.matchType, "excel")));
  return rows.map((r) => ({
    id: r.id,
    matchType: r.matchType as "layer" | "block",
    matchName: r.matchName,
    materialId: r.materialId,
    groupName: r.groupName,
    unitScale: num(r.unitScale),
  }));
}

// ---------- 엑셀 내역서 매칭 기억 (별도 테이블 없이 dxf_mappings에 matchType="excel"로 저장) ----------
// matchName = 정규화한 `품명|규격` 키(lib/excelMatch.matchKey). 다음 엑셀부터 같은 표기는 자동 매칭됩니다.

export async function getExcelMappings(userId: number, discipline: Discipline): Promise<Map<string, number>> {
  const db = getDb();
  const rows = await db
    .select({ matchName: dxfMappings.matchName, materialId: dxfMappings.materialId })
    .from(dxfMappings)
    .where(and(eq(dxfMappings.userId, userId), eq(dxfMappings.discipline, discipline), eq(dxfMappings.matchType, "excel")));
  return new Map(rows.map((r) => [r.matchName, r.materialId]));
}

export async function upsertExcelMappings(
  userId: number,
  discipline: Discipline,
  items: Array<{ key: string; materialId: number; groupName: string }>
) {
  // 한 INSERT 안에서 같은 키가 중복되면 ON CONFLICT가 실패하므로 키 기준으로 먼저 합칩니다.
  const byKey = new Map<string, { key: string; materialId: number; groupName: string }>();
  for (const it of items) if (it.key) byKey.set(it.key, it);
  const values = Array.from(byKey.values()).map((it) => ({
    userId,
    discipline,
    matchType: "excel",
    matchName: it.key,
    materialId: it.materialId,
    groupName: it.groupName,
    unitScale: "1",
  }));
  if (values.length === 0) return;
  const db = getDb();
  for (let i = 0; i < values.length; i += 500) {
    await db
      .insert(dxfMappings)
      .values(values.slice(i, i + 500))
      .onConflictDoUpdate({
        target: [dxfMappings.userId, dxfMappings.discipline, dxfMappings.matchType, dxfMappings.matchName],
        set: { materialId: sql`excluded.material_id`, groupName: sql`excluded.group_name` },
      });
  }
}

export async function upsertDxfMapping(
  userId: number,
  discipline: Discipline,
  m: { matchType: "layer" | "block"; matchName: string; materialId: number; groupName: string; unitScale: number }
) {
  const db = getDb();
  const existing = await db
    .select()
    .from(dxfMappings)
    .where(
      and(
        eq(dxfMappings.userId, userId),
        eq(dxfMappings.discipline, discipline),
        eq(dxfMappings.matchType, m.matchType),
        eq(dxfMappings.matchName, m.matchName)
      )
    )
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(dxfMappings)
      .set({ materialId: m.materialId, groupName: m.groupName, unitScale: String(m.unitScale) })
      .where(eq(dxfMappings.id, existing[0].id));
  } else {
    await db.insert(dxfMappings).values({
      userId,
      discipline,
      matchType: m.matchType,
      matchName: m.matchName,
      materialId: m.materialId,
      groupName: m.groupName,
      unitScale: String(m.unitScale),
    });
  }
}
