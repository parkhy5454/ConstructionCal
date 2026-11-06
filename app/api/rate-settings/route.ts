import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/currentUser";
import { getDb } from "@/lib/db";
import { rateSettings } from "@/lib/schema";
import { ensureSeeded, getRateSettings } from "@/lib/estimateData";

export const runtime = "nodejs";

const KEYS = [
  "indirectLabor", "etcExpense", "industrialIns", "employIns", "gna",
  "profit", "vat", "pipeAccessory", "consumable", "toolLoss",
] as const;

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  await ensureSeeded(user.id);
  const rates = await getRateSettings(user.id);
  return NextResponse.json({ rates });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  await ensureSeeded(user.id);
  const body = await req.json().catch(() => null);

  const patch: Record<string, string> = {};
  for (const key of KEYS) {
    if (body?.[key] !== undefined) {
      const v = Number(body[key]);
      if (!isFinite(v) || v < 0) return NextResponse.json({ error: `${key} 값이 올바르지 않습니다.` }, { status: 400 });
      patch[key] = String(v);
    }
  }

  const db = getDb();
  await db.update(rateSettings).set(patch).where(eq(rateSettings.userId, user.id));
  return NextResponse.json({ ok: true });
}
