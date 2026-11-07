import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/currentUser";
import { getDb } from "@/lib/db";
import { clients, projectMeta } from "@/lib/schema";
import { subscriptionBlock } from "@/lib/subscription";
import { parseClientBody } from "@/lib/clients";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const blocked = await subscriptionBlock(user);
  if (blocked) return blocked;
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  const parsed = parseClientBody(await req.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const rows = await getDb().update(clients).set(parsed.value).where(and(eq(clients.id, id), eq(clients.userId, user.id))).returning();
  if (rows.length === 0) return NextResponse.json({ error: "거래처를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ client: rows[0] });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const blocked = await subscriptionBlock(user);
  if (blocked) return blocked;
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  const db = getDb();
  const rows = await db.delete(clients).where(and(eq(clients.id, id), eq(clients.userId, user.id))).returning();
  if (rows.length === 0) return NextResponse.json({ error: "거래처를 찾을 수 없습니다." }, { status: 404 });
  // 이 거래처를 쓰던 견적서는 거래처 지정만 해제
  await db.update(projectMeta).set({ clientId: null }).where(eq(projectMeta.clientId, id));
  return NextResponse.json({ ok: true });
}
