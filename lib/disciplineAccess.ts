// 공종별 요금제(DISCIPLINE_PLAN=true 일 때만 켜짐, 기본 꺼짐).
// - 꺼져 있으면 모든 공종 사용 가능.
// - 켜면: 관리자·체험 중인 사용자는 전체 공종, 유료 구독자는 user_disciplines에 등록된 공종만 새 견적서를 만들 수 있습니다.
//   등록된 행이 없으면 전체 공종(도입 전 가입자 보호). 기존 견적서 조회·수정·출력은 막지 않습니다.
// - user_disciplines 테이블이 없으면(마이그레이션 전) 제한 없음.
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { userDisciplines } from "./schema";
import { DISCIPLINES, DISCIPLINE_LABELS, type Discipline } from "./calc";
import { getSubscriptionInfo } from "./subscription";
import { isMissingTable } from "./security";

type Db = ReturnType<typeof getDb>;

export function disciplinePlanOn(): boolean {
  return process.env.DISCIPLINE_PLAN === "true";
}

export function parseDisciplineList(raw: string | null | undefined): Discipline[] {
  const set = new Set((raw ?? "").split(",").map((s) => s.trim()));
  return DISCIPLINES.filter((d) => set.has(d));
}

export async function getDisciplineList(userId: number, db: Db = getDb()): Promise<Discipline[] | null> {
  try {
    const r = await db.select().from(userDisciplines).where(eq(userDisciplines.userId, userId)).limit(1);
    return r[0] ? parseDisciplineList(r[0].disciplines) : null;
  } catch (e) {
    if (isMissingTable(e)) return null;
    throw e;
  }
}

// null = 제한 없음(전체)
export async function allowedDisciplines(user: { id: number; role: string }, db: Db = getDb()): Promise<Discipline[] | null> {
  if (!disciplinePlanOn() || user.role === "admin") return null;
  const info = await getSubscriptionInfo(user, db);
  if (info.status !== "paid") return null; // 체험·기능 꺼짐 상태는 전체 공종
  return getDisciplineList(user.id, db);
}

export async function disciplineBlock(user: { id: number; role: string }, discipline: Discipline, db: Db = getDb()): Promise<NextResponse | null> {
  const allowed = await allowedDisciplines(user, db);
  if (allowed === null || allowed.includes(discipline)) return null;
  const names = allowed.map((d) => DISCIPLINE_LABELS[d]).join(", ") || "없음";
  return NextResponse.json(
    { error: `현재 요금제에 포함되지 않은 업종입니다 (사용 가능: ${names}). 업종 추가는 운영자에게 문의하세요.`, disciplineNotIncluded: true },
    { status: 403 }
  );
}

export async function setDisciplineList(userId: number, list: Discipline[] | null, db: Db = getDb()): Promise<void> {
  if (list === null) {
    await db.delete(userDisciplines).where(eq(userDisciplines.userId, userId));
    return;
  }
  const value = list.join(",");
  await db.insert(userDisciplines).values({ userId, disciplines: value })
    .onConflictDoUpdate({ target: userDisciplines.userId, set: { disciplines: value, updatedAt: new Date() } });
}

export async function getDisciplineMap(db: Db = getDb()): Promise<Map<number, Discipline[]>> {
  try {
    const rows = await db.select().from(userDisciplines);
    return new Map(rows.map((r) => [r.userId, parseDisciplineList(r.disciplines)]));
  } catch (e) {
    if (isMissingTable(e)) return new Map();
    throw e;
  }
}
