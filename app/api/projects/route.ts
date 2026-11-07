import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getDb } from "@/lib/db";
import { projects } from "@/lib/schema";
import { ensureSeeded, getProjects } from "@/lib/estimateData";
import { DISCIPLINES, type Discipline } from "@/lib/calc";

export const runtime = "nodejs";

function parseDiscipline(v: string | null): Discipline {
  return (DISCIPLINES as readonly string[]).includes(v ?? "") ? (v as Discipline) : "electrical";
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  await ensureSeeded(user.id, "electrical");
  const rows = await getProjects(user.id);
  return NextResponse.json({ projects: rows });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const discipline = parseDiscipline(body?.discipline);
  if (!name) return NextResponse.json({ error: "견적서 이름을 입력하세요." }, { status: 400 });
  if (name.length > 120) return NextResponse.json({ error: "견적서 이름은 120자 이하로 입력하세요." }, { status: 400 });

  await ensureSeeded(user.id, discipline);
  const db = getDb();
  const [row] = await db.insert(projects).values({ userId: user.id, discipline, name }).returning();
  return NextResponse.json({ project: row });
}
