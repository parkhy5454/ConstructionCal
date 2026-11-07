import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/currentUser";
import { getDb } from "@/lib/db";
import { materials, pumsem, bomItems, laborRates } from "@/lib/schema";
import { getProjectOwned, ensureSeeded } from "@/lib/estimateData";
import { subscriptionBlock } from "@/lib/subscription";
import type { Discipline } from "@/lib/calc";

export const runtime = "nodejs";

// 새 자재를 즉석에서 등록하고(선택: 표준품셈 공수까지) 이 견적서에 바로 넣습니다. DB에 없는 품목을 견적에 넣을 때 사용.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const blocked = await subscriptionBlock(user);
  if (blocked) return blocked;
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  const project = await getProjectOwned(user.id, id);
  if (!project) return NextResponse.json({ error: "견적서를 찾을 수 없습니다." }, { status: 404 });
  const discipline = project.discipline as Discipline;

  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim().slice(0, 120);
  const unit = String(body?.unit ?? "").trim().slice(0, 20);
  const spec = String(body?.spec ?? "").trim().slice(0, 120);
  const category = String(body?.category ?? "").trim().slice(0, 40);
  const groupName = String(body?.groupName ?? "").trim().slice(0, 60);
  const price = Number(body?.price ?? 0);
  const qty = Number(body?.qty ?? 1);
  const laborCode = String(body?.laborCode ?? "").trim();
  const factor = body?.factor === undefined || body?.factor === "" ? null : Number(body.factor);
  if (!name || !unit) return NextResponse.json({ error: "품명과 단위는 필수입니다." }, { status: 400 });
  if (!groupName) return NextResponse.json({ error: "공종을 입력하세요." }, { status: 400 });
  if (!isFinite(price) || price < 0) return NextResponse.json({ error: "단가가 올바르지 않습니다." }, { status: 400 });
  if (!isFinite(qty) || qty < 0) return NextResponse.json({ error: "수량이 올바르지 않습니다." }, { status: 400 });
  if (factor !== null && (!isFinite(factor) || factor < 0)) return NextResponse.json({ error: "공수가 올바르지 않습니다." }, { status: 400 });

  await ensureSeeded(user.id, discipline);
  const db = getDb();

  if (factor !== null && factor > 0) {
    if (!laborCode) return NextResponse.json({ error: "공수를 넣으려면 직종을 선택하세요." }, { status: 400 });
    const lr = await db.select().from(laborRates).where(and(eq(laborRates.userId, user.id), eq(laborRates.discipline, discipline), eq(laborRates.code, laborCode))).limit(1);
    if (lr.length === 0) return NextResponse.json({ error: "직종을 찾을 수 없습니다." }, { status: 404 });
  }

  const [mat] = await db.insert(materials).values({ userId: user.id, discipline, category, name, spec, unit, price: String(price) }).returning();
  try {
    if (factor !== null && factor > 0) {
      await db.insert(pumsem).values({ userId: user.id, materialId: mat.id, laborCode, factor: String(factor) });
    }
    await db.insert(bomItems).values({ projectId: id, groupName, materialId: mat.id, qty: String(qty), sortOrder: 9999 });
  } catch (e) {
    // 중간에 실패하면 방금 만든 자재가 고아로 남지 않게 되돌림
    await db.delete(pumsem).where(eq(pumsem.materialId, mat.id));
    await db.delete(materials).where(eq(materials.id, mat.id));
    throw e;
  }
  return NextResponse.json({ ok: true, materialId: mat.id });
}
