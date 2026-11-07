import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/currentUser";
import { getDb } from "@/lib/db";
import { projectVersions } from "@/lib/schema";
import { getProjectOwned } from "@/lib/estimateData";
import { parseSnapshot } from "@/lib/versions";
import { subscriptionBlock } from "@/lib/subscription";

export const runtime = "nodejs";

async function load(req: NextRequest, params: { id: string; vid: string }) {
  const user = await getCurrentUser(req);
  if (!user) return { err: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) } as const;
  const id = Number(params.id), vid = Number(params.vid);
  if (!Number.isInteger(id) || !Number.isInteger(vid)) return { err: NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 }) } as const;
  const project = await getProjectOwned(user.id, id);
  if (!project) return { err: NextResponse.json({ error: "견적서를 찾을 수 없습니다." }, { status: 404 }) } as const;
  const rows = await getDb().select().from(projectVersions).where(and(eq(projectVersions.id, vid), eq(projectVersions.projectId, id))).limit(1);
  if (rows.length === 0) return { err: NextResponse.json({ error: "버전을 찾을 수 없습니다." }, { status: 404 }) } as const;
  return { user, project, version: rows[0] } as const;
}

export async function GET(req: NextRequest, { params }: { params: { id: string; vid: string } }) {
  const r = await load(req, params);
  if ("err" in r) return r.err;
  const snapshot = parseSnapshot(r.version.snapshot);
  if (!snapshot) return NextResponse.json({ error: "저장본을 읽을 수 없습니다." }, { status: 500 });
  return NextResponse.json({ version: { id: r.version.id, label: r.version.label, createdAt: r.version.createdAt }, snapshot });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; vid: string } }) {
  const r = await load(req, params);
  if ("err" in r) return r.err;
  const blocked = await subscriptionBlock(r.user);
  if (blocked) return blocked;
  await getDb().delete(projectVersions).where(eq(projectVersions.id, r.version.id));
  return NextResponse.json({ ok: true });
}
