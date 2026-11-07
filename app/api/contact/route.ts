import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getDb } from "@/lib/db";
import { inquiries } from "@/lib/schema";
import { validateEmail } from "@/lib/auth";
import { rateLimitAsync, clientIp } from "@/lib/rateLimit";
import { isMissingTable } from "@/lib/security";
import { sendMail, mailConfigured } from "@/lib/mailer";

export const runtime = "nodejs";

// 문의하기: DB에 저장하고(관리자 화면에서 확인), SUPPORT_EMAIL이 설정되어 있으면 메일로도 알립니다.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req).catch(() => null);
  const ip = clientIp(req);
  if (!(await rateLimitAsync(`contact:${ip}`, 5, 60 * 60_000))) {
    return NextResponse.json({ error: "문의를 너무 자주 보냈습니다. 잠시 후 다시 시도하세요." }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? user?.name ?? "").trim().slice(0, 80);
  const email = String(body?.email ?? user?.email ?? "").trim().toLowerCase().slice(0, 255);
  const message = String(body?.message ?? "").trim();
  if (!name) return NextResponse.json({ error: "이름을 입력하세요." }, { status: 400 });
  if (!validateEmail(email)) return NextResponse.json({ error: "답변받을 이메일을 올바르게 입력하세요." }, { status: 400 });
  if (message.length < 5) return NextResponse.json({ error: "문의 내용을 5자 이상 입력하세요." }, { status: 400 });
  if (message.length > 3000) return NextResponse.json({ error: "문의 내용은 3000자 이하로 입력하세요." }, { status: 400 });

  let saved = false;
  try {
    await getDb().insert(inquiries).values({ userId: user?.id ?? null, name, email, message });
    saved = true;
  } catch (e) {
    if (!isMissingTable(e)) throw e;
  }
  let mailed = false;
  const to = process.env.SUPPORT_EMAIL?.trim();
  if (to && mailConfigured()) {
    const r = await sendMail({
      to, subject: `[ConCal 문의] ${name}`,
      text: `보낸 사람: ${name} <${email}>${user ? ` (회원 #${user.id})` : ""}\n\n${message}`,
      html: `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${(`보낸 사람: ${name} <${email}>${user ? ` (회원 #${user.id})` : ""}\n\n${message}`).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string))}</pre>`,
    });
    mailed = r.ok;
  }
  if (!saved && !mailed) return NextResponse.json({ error: "문의 접수가 일시적으로 불가합니다. 잠시 후 다시 시도해 주세요." }, { status: 503 });
  return NextResponse.json({ ok: true });
}
