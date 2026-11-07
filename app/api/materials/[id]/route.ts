import { subscriptionBlock } from "@/lib/subscription";
import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/currentUser";
import { getDb } from "@/lib/db";
import { materials } from "@/lib/schema";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const blocked = await subscriptionBlock(user);
  if (blocked) return blocked;
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const body = await req.json().catch(() => null);
  const patch: Record<string, unknown> = {};
  if (typeof body?.name === "string") patch.name = body.name.trim();
  if (typeof body?.spec === "string") patch.spec = body.spec.trim();
  if (typeof body?.unit === "string") patch.unit = body.unit.trim();
  if (typeof body?.category === "string") patch.category = body.category.trim();
  if (body?.price !== undefined) {
    const price = Number(body.price);
    if (!isFinite(price) || price < 0) return NextResponse.json({ error: "단가가 올바르지 않습니다." }, { status: 400 });
    patch.price = String(price);
  }
  patch.updatedAt = new Date();

  const db = getDb();
  const result = await db
    .update(materials)
    .set(patch)
    .where(and(eq(materials.id, id), eq(materials.userId, user.id)))
    .returning();
  if (result.length === 0) return NextResponse.json({ error: "자재를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const blocked = await subscriptionBlock(user);
  if (blocked) return blocked;
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const db = getDb();
  await db.delete(materials).where(and(eq(materials.id, id), eq(materials.userId, user.id)));
  return NextResponse.json({ ok: true });
}
