import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getDb } from "@/lib/db";
import { projects } from "@/lib/schema";
import { ensureSeeded, getProjects } from "@/lib/estimateData";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  await ensureSeeded(user.id);
  const rows = await getProjects(user.id);
  return NextResponse.json({ projects: rows });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "견적서 이름을 입력하세요." }, { status: 400 });

  const db = getDb();
  const [row] = await db.insert(projects).values({ userId: user.id, name }).returning();
  return NextResponse.json({ project: row });
}
