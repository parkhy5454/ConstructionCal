import { subscriptionBlock } from "@/lib/subscription";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getDb } from "@/lib/db";
import { projects } from "@/lib/schema";
import { ensureSeeded, getProjects } from "@/lib/estimateData";
import { computeTotals } from "@/lib/projectCompute";
import { getMetaMap } from "@/lib/projectMeta";
import { listClients } from "@/lib/clients";
import { DISCIPLINES, type Discipline } from "@/lib/calc";
import { allowedDisciplines, disciplineBlock } from "@/lib/disciplineAccess";

export const runtime = "nodejs";

function parseDiscipline(v: string | null): Discipline {
  return (DISCIPLINES as readonly string[]).includes(v ?? "") ? (v as Discipline) : "electrical";
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  await ensureSeeded(user.id, "electrical");
  const rows = await getProjects(user.id);
  // 목록에 금액·상태·거래처를 함께 보여주기 위해 합계를 한꺼번에 계산합니다(최근 300건).
  const recent = rows.slice(-300);
  const [totals, metaMap, clientList] = await Promise.all([computeTotals(user.id, recent), getMetaMap(recent.map((r) => r.id)), listClients(user.id)]);
  const clientName = new Map(clientList.map((c) => [c.id, c.name]));
  const allowed = await allowedDisciplines(user);
  return NextResponse.json({
    allowedDisciplines: allowed,
    projects: rows.map((r) => {
      const t = totals.get(r.id);
      const m = metaMap.get(r.id);
      return { ...r, final: t?.final ?? null, itemCount: t?.itemCount ?? null, status: m?.status ?? "draft", clientName: m?.clientId ? clientName.get(m.clientId) ?? null : null };
    }),
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const blocked = await subscriptionBlock(user);
  if (blocked) return blocked;
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const discipline = parseDiscipline(body?.discipline);
  if (!name) return NextResponse.json({ error: "견적서 이름을 입력하세요." }, { status: 400 });
  if (name.length > 120) return NextResponse.json({ error: "견적서 이름은 120자 이하로 입력하세요." }, { status: 400 });

  const dBlocked = await disciplineBlock(user, discipline);
  if (dBlocked) return dBlocked;
  await ensureSeeded(user.id, discipline);
  const db = getDb();
  const [row] = await db.insert(projects).values({ userId: user.id, discipline, name }).returning();
  return NextResponse.json({ project: row });
}
