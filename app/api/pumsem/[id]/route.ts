import { subscriptionBlock } from "@/lib/subscription";
import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/currentUser";
import { getDb } from "@/lib/db";
import { pumsem } from "@/lib/schema";

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
  if (typeof body?.laborCode === "string") patch.laborCode = body.laborCode.trim();
  if (body?.factor !== undefined) {
    const factor = Number(body.factor);
    if (!isFinite(factor) || factor < 0) return NextResponse.json({ error: "단위당공수가 올바르지 않습니다." }, { status: 400 });
    patch.factor = String(factor);
  }

  const db = getDb();
  const result = await db
    .update(pumsem)
    .set(patch)
    .where(and(eq(pumsem.id, id), eq(pumsem.userId, user.id)))
    .returning();
  if (result.length === 0) return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
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
  await db.delete(pumsem).where(and(eq(pumsem.id, id), eq(pumsem.userId, user.id)));
  return NextResponse.json({ ok: true });
}
