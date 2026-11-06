import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/currentUser";
import { getDb } from "@/lib/db";
import { bomItems } from "@/lib/schema";
import { getProjectOwned } from "@/lib/estimateData";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: { id: string; bomId: string } }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const projectId = Number(params.id);
  const bomId = Number(params.bomId);
  if (!Number.isInteger(projectId) || !Number.isInteger(bomId)) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const owned = await getProjectOwned(user.id, projectId);
  if (!owned) return NextResponse.json({ error: "견적서를 찾을 수 없습니다." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const patch: Record<string, unknown> = {};
  if (typeof body?.groupName === "string") patch.groupName = body.groupName.trim();
  if (body?.qty !== undefined) {
    const qty = Number(body.qty);
    if (!isFinite(qty) || qty < 0) return NextResponse.json({ error: "수량이 올바르지 않습니다." }, { status: 400 });
    patch.qty = String(qty);
  }

  const db = getDb();
  const result = await db
    .update(bomItems)
    .set(patch)
    .where(and(eq(bomItems.id, bomId), eq(bomItems.projectId, projectId)))
    .returning();
  if (result.length === 0) return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; bomId: string } }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const projectId = Number(params.id);
  const bomId = Number(params.bomId);
  if (!Number.isInteger(projectId) || !Number.isInteger(bomId)) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const owned = await getProjectOwned(user.id, projectId);
  if (!owned) return NextResponse.json({ error: "견적서를 찾을 수 없습니다." }, { status: 404 });

  const db = getDb();
  await db.delete(bomItems).where(and(eq(bomItems.id, bomId), eq(bomItems.projectId, projectId)));
  return NextResponse.json({ ok: true });
}
