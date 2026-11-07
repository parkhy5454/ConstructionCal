import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/currentUser";
import { getDb } from "@/lib/db";
import { projectVersions, bomItems, projects } from "@/lib/schema";
import { getProjectOwned, getMaterials } from "@/lib/estimateData";
import { computeProject } from "@/lib/projectCompute";
import { buildSnapshot, parseSnapshot } from "@/lib/versions";
import { saveMeta, parseSurcharges, MetaTableMissingError } from "@/lib/projectMeta";
import { subscriptionBlock } from "@/lib/subscription";
import type { Discipline } from "@/lib/calc";

export const runtime = "nodejs";

// 저장본으로 되돌리기: 현재 상태를 먼저 "복원 전 자동 저장" 버전으로 남기고, BOM과 할증을 저장본으로 교체합니다.
export async function POST(req: NextRequest, { params }: { params: { id: string; vid: string } }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const blocked = await subscriptionBlock(user);
  if (blocked) return blocked;
  const id = Number(params.id), vid = Number(params.vid);
  if (!Number.isInteger(id) || !Number.isInteger(vid)) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  const project = await getProjectOwned(user.id, id);
  if (!project) return NextResponse.json({ error: "견적서를 찾을 수 없습니다." }, { status: 404 });
  const db = getDb();
  const rows = await db.select().from(projectVersions).where(and(eq(projectVersions.id, vid), eq(projectVersions.projectId, id))).limit(1);
  if (rows.length === 0) return NextResponse.json({ error: "버전을 찾을 수 없습니다." }, { status: 404 });
  const snap = parseSnapshot(rows[0].snapshot);
  if (!snap) return NextResponse.json({ error: "저장본을 읽을 수 없습니다." }, { status: 500 });

  const mats = await getMaterials(user.id, project.discipline as Discipline);
  const existing = new Set(mats.map((m) => m.id));
  const restorable = snap.items.filter((i) => existing.has(i.mid));
  const skipped = snap.items.length - restorable.length;

  // 되돌리기 전 현재 상태 보관
  const cur = await computeProject(project);
  await db.insert(projectVersions).values({
    projectId: id, userId: user.id, label: `복원 전 자동 저장 (${rows[0].label})`.slice(0, 80),
    snapshot: JSON.stringify(buildSnapshot(cur.bom, cur.materials, cur.meta.surcharges, cur.result)),
  });

  await db.delete(bomItems).where(eq(bomItems.projectId, id));
  for (let i = 0; i < restorable.length; i += 500) {
    await db.insert(bomItems).values(
      restorable.slice(i, i + 500).map((it, k) => ({ projectId: id, groupName: it.g.slice(0, 60), materialId: it.mid, qty: String(it.qty), sortOrder: i + k }))
    );
  }
  const sc = parseSurcharges(snap.surcharges ?? []);
  try {
    await saveMeta(id, { surcharges: sc.ok ? sc.value : [] });
  } catch (e) {
    if (!(e instanceof MetaTableMissingError)) throw e;
  }
  await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, id));
  return NextResponse.json({ ok: true, restored: restorable.length, skipped });
}
