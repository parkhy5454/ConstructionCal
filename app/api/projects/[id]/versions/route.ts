import { NextRequest, NextResponse } from "next/server";
import { desc, eq, count } from "drizzle-orm";
import { getCurrentUser } from "@/lib/currentUser";
import { getDb } from "@/lib/db";
import { projectVersions } from "@/lib/schema";
import { getProjectOwned } from "@/lib/estimateData";
import { computeProject } from "@/lib/projectCompute";
import { buildSnapshot } from "@/lib/versions";
import { subscriptionBlock } from "@/lib/subscription";
import { isMissingTable } from "@/lib/security";

export const runtime = "nodejs";
const MAX_VERSIONS = 50;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  const project = await getProjectOwned(user.id, id);
  if (!project) return NextResponse.json({ error: "견적서를 찾을 수 없습니다." }, { status: 404 });
  try {
    const rows = await getDb()
      .select({ id: projectVersions.id, label: projectVersions.label, createdAt: projectVersions.createdAt, snapshot: projectVersions.snapshot })
      .from(projectVersions)
      .where(eq(projectVersions.projectId, id))
      .orderBy(desc(projectVersions.id));
    // 목록에는 합계만 내려줍니다(스냅샷 전체는 개별 조회)
    const versions = rows.map((r) => {
      let final: number | null = null;
      try { final = JSON.parse(r.snapshot)?.totals?.final ?? null; } catch {}
      return { id: r.id, label: r.label, createdAt: r.createdAt, final };
    });
    return NextResponse.json({ versions });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ versions: [], tableMissing: true });
    throw e;
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const blocked = await subscriptionBlock(user);
  if (blocked) return blocked;
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  const project = await getProjectOwned(user.id, id);
  if (!project) return NextResponse.json({ error: "견적서를 찾을 수 없습니다." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const label = String(body?.label ?? "").trim().slice(0, 80) || `저장본 ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`;

  try {
    const db = getDb();
    const [{ n }] = await db.select({ n: count() }).from(projectVersions).where(eq(projectVersions.projectId, id));
    if (Number(n) >= MAX_VERSIONS) return NextResponse.json({ error: `버전은 견적서당 최대 ${MAX_VERSIONS}개까지 저장할 수 있습니다. 오래된 버전을 삭제하세요.` }, { status: 400 });
    const { materials, bom, meta, result } = await computeProject(project);
    const snap = buildSnapshot(bom, materials, meta.surcharges, result);
    const [row] = await db.insert(projectVersions).values({ projectId: id, userId: user.id, label, snapshot: JSON.stringify(snap) }).returning();
    return NextResponse.json({ version: { id: row.id, label: row.label, createdAt: row.createdAt, final: snap.totals.final } });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: "버전 이력 테이블이 아직 없습니다. 운영 DB에 npm run db:push를 실행하세요." }, { status: 503 });
    throw e;
  }
}
