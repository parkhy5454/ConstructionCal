import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getDb } from "@/lib/db";
import { projects } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getProjectOwned } from "@/lib/estimateData";
import { subscriptionBlock } from "@/lib/subscription";
import { getMeta, saveMeta, parseSurcharges, PROJECT_STATUSES, MetaTableMissingError, type Meta } from "@/lib/projectMeta";
import { clientOwned } from "@/lib/clients";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  if (!(await getProjectOwned(user.id, id))) return NextResponse.json({ error: "견적서를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ meta: await getMeta(id) });
}

// 할증/상태/거래처/메모 저장(보낸 항목만 변경)
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const blocked = await subscriptionBlock(user);
  if (blocked) return blocked;
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  if (!(await getProjectOwned(user.id, id))) return NextResponse.json({ error: "견적서를 찾을 수 없습니다." }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const patch: Partial<Meta> = {};
  if (body.surcharges !== undefined) {
    const p = parseSurcharges(body.surcharges);
    if (!p.ok) return NextResponse.json({ error: p.error }, { status: 400 });
    patch.surcharges = p.value;
  }
  if (body.status !== undefined) {
    if (!(PROJECT_STATUSES as readonly string[]).includes(body.status)) return NextResponse.json({ error: "잘못된 상태 값입니다." }, { status: 400 });
    patch.status = body.status;
  }
  if (body.clientId !== undefined) {
    if (body.clientId === null) patch.clientId = null;
    else {
      const cid = Number(body.clientId);
      if (!Number.isInteger(cid) || !(await clientOwned(user.id, cid))) return NextResponse.json({ error: "거래처를 찾을 수 없습니다." }, { status: 404 });
      patch.clientId = cid;
    }
  }
  if (body.memo !== undefined) {
    const memo = String(body.memo);
    if (memo.length > 2000) return NextResponse.json({ error: "메모는 2000자 이하로 입력하세요." }, { status: 400 });
    patch.memo = memo;
  }
  if (body.priceBasis !== undefined) {
    const pb = String(body.priceBasis).trim();
    if (pb.length > 80) return NextResponse.json({ error: "단가 기준은 80자 이하로 입력하세요." }, { status: 400 });
    patch.priceBasis = pb;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "변경할 항목이 없습니다." }, { status: 400 });

  try {
    const meta = await saveMeta(id, patch);
    await getDb().update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, id));
    return NextResponse.json({ meta });
  } catch (e) {
    if (e instanceof MetaTableMissingError) return NextResponse.json({ error: e.message }, { status: 503 });
    throw e;
  }
}
