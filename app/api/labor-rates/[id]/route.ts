import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/currentUser";
import { getDb } from "@/lib/db";
import { laborRates } from "@/lib/schema";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const body = await req.json().catch(() => null);
  const patch: Record<string, unknown> = {};
  if (typeof body?.name === "string") patch.name = body.name.trim();
  if (body?.rate !== undefined) {
    const rate = Number(body.rate);
    if (!isFinite(rate) || rate < 0) return NextResponse.json({ error: "노임단가가 올바르지 않습니다." }, { status: 400 });
    patch.rate = String(rate);
  }

  const db = getDb();
  const result = await db
    .update(laborRates)
    .set(patch)
    .where(and(eq(laborRates.id, id), eq(laborRates.userId, user.id)))
    .returning();
  if (result.length === 0) return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  const db = getDb();
  await db.delete(laborRates).where(and(eq(laborRates.id, id), eq(laborRates.userId, user.id)));
  return NextResponse.json({ ok: true });
}
