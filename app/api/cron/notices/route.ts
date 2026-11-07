import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { runNoticeJob } from "@/lib/notices";
import { appBaseUrl } from "@/lib/mailer";
import { reportError } from "@/lib/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 매일 한 번 Vercel Cron이 호출합니다(vercel.json). CRON_SECRET이 설정되어 있고 일치할 때만 실행됩니다.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return NextResponse.json({ error: "CRON_SECRET이 설정되지 않았습니다." }, { status: 503 });
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
  try {
    const summary = await runNoticeJob(new Date(), undefined, `${appBaseUrl(req)}/pricing`);
    return NextResponse.json(summary);
  } catch (e) {
    await reportError("cron-notices", e);
    return NextResponse.json({ error: "실행 중 오류가 발생했습니다." }, { status: 500 });
  }
}
