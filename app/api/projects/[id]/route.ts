import { subscriptionBlock } from "@/lib/subscription";
import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/currentUser";
import { getDb } from "@/lib/db";
import { projects, bomItems } from "@/lib/schema";
import { getProjectOwned } from "@/lib/estimateData";
import { computeProject } from "@/lib/projectCompute";
import { listClients } from "@/lib/clients";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const project = await getProjectOwned(user.id, id);
  if (!project) return NextResponse.json({ error: "견적서를 찾을 수 없습니다." }, { status: 404 });
  const { materials: mats, laborRates: labor, bom, meta, result, rates } = await computeProject(project);
  const clientList = await listClients(user.id);

  return NextResponse.json({
    project, materials: mats, laborRates: labor, bom, result, rates,
    meta, clients: clientList.map((c) => ({ id: c.id, name: c.name })),
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const blocked = await subscriptionBlock(user);
  if (blocked) return blocked;
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : undefined;
  if (name !== undefined && !name) return NextResponse.json({ error: "견적서 이름을 입력하세요." }, { status: 400 });
  if (name !== undefined && name.length > 120) return NextResponse.json({ error: "견적서 이름은 120자 이하로 입력하세요." }, { status: 400 });

  const db = getDb();
  const result = await db
    .update(projects)
    .set({ ...(name ? { name } : {}), updatedAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.userId, user.id)))
    .returning();
  if (result.length === 0) return NextResponse.json({ error: "견적서를 찾을 수 없습니다." }, { status: 404 });
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
  const owned = await getProjectOwned(user.id, id);
  if (!owned) return NextResponse.json({ error: "견적서를 찾을 수 없습니다." }, { status: 404 });
  await db.delete(bomItems).where(eq(bomItems.projectId, id));
  await db.delete(projects).where(eq(projects.id, id));
  return NextResponse.json({ ok: true });
}
