import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { ensureSeeded, getProjects } from "@/lib/estimateData";
import { computeTotals } from "@/lib/projectCompute";
import { getMetaMap, PROJECT_STATUSES } from "@/lib/projectMeta";

export const runtime = "nodejs";

// 홈 대시보드용 통계: 상태별 건수·금액, 최근 6개월 월별 견적 금액, 온보딩 진행도.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  await ensureSeeded(user.id, "electrical");
  const rows = (await getProjects(user.id)).slice(-300);
  const [totals, metaMap] = await Promise.all([computeTotals(user.id, rows), getMetaMap(rows.map((r) => r.id))]);

  const byStatus: Record<string, { count: number; amount: number }> = {};
  for (const s of PROJECT_STATUSES) byStatus[s] = { count: 0, amount: 0 };

  const now = new Date();
  const months: { key: string; label: string; amount: number; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: `${d.getMonth() + 1}월`, amount: 0, count: 0 });
  }
  let withItems = 0;
  for (const p of rows) {
    const t = totals.get(p.id);
    const st = metaMap.get(p.id)?.status ?? "draft";
    byStatus[st].count += 1;
    byStatus[st].amount += t?.final ?? 0;
    if ((t?.itemCount ?? 0) > 0) withItems += 1;
    const c = new Date(p.createdAt);
    const m = months.find((x) => x.key === `${c.getFullYear()}-${c.getMonth()}`);
    if (m) { m.amount += t?.final ?? 0; m.count += 1; }
  }
  return NextResponse.json({
    total: rows.length,
    withItems,
    byStatus,
    months,
    latest: rows.length ? { id: rows[rows.length - 1].id, name: rows[rows.length - 1].name } : null,
  });
}
