import { subscriptionBlock } from "@/lib/subscription";
import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/currentUser";
import { getDb } from "@/lib/db";
import { rateSettings } from "@/lib/schema";
import { ensureSeeded, getRateSettings } from "@/lib/estimateData";
import { DISCIPLINES, type Discipline } from "@/lib/calc";

export const runtime = "nodejs";

const KEYS = [
  "indirectLabor", "etcExpense", "industrialIns", "employIns", "gna",
  "profit", "vat", "pipeAccessory", "consumable", "toolLoss",
] as const;

function parseDiscipline(v: string | null): Discipline {
  return (DISCIPLINES as readonly string[]).includes(v ?? "") ? (v as Discipline) : "electrical";
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const discipline = parseDiscipline(req.nextUrl.searchParams.get("discipline"));
  await ensureSeeded(user.id, discipline);
  const rates = await getRateSettings(user.id, discipline);
  return NextResponse.json({ rates });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const blocked = await subscriptionBlock(user);
  if (blocked) return blocked;
  const body = await req.json().catch(() => null);
  const discipline = parseDiscipline(body?.discipline);
  await ensureSeeded(user.id, discipline);

  const patch: Record<string, string> = {};
  for (const key of KEYS) {
    if (body?.[key] !== undefined) {
      const v = Number(body[key]);
      if (!isFinite(v) || v < 0) return NextResponse.json({ error: `${key} 값이 올바르지 않습니다.` }, { status: 400 });
      patch[key] = String(v);
    }
  }

  const db = getDb();
  await db.update(rateSettings).set(patch).where(and(eq(rateSettings.userId, user.id), eq(rateSettings.discipline, discipline)));
  return NextResponse.json({ ok: true });
}
