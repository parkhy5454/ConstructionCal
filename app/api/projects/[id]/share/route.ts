import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getProjectOwned } from "@/lib/estimateData";
import { subscriptionBlock } from "@/lib/subscription";
import { createShareLink, listShareLinks, revokeShareLink, ShareTableMissingError, SHARE_MAX_DAYS } from "@/lib/share";
import { rateLimitAsync } from "@/lib/rateLimit";

export const runtime = "nodejs";

async function auth(req: NextRequest, idStr: string) {
  const user = await getCurrentUser(req);
  if (!user) return { err: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) } as const;
  const id = Number(idStr);
  if (!Number.isInteger(id)) return { err: NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 }) } as const;
  const project = await getProjectOwned(user.id, id);
  if (!project) return { err: NextResponse.json({ error: "견적서를 찾을 수 없습니다." }, { status: 404 }) } as const;
  return { user, id } as const;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const a = await auth(req, params.id);
  if ("err" in a) return a.err;
  return NextResponse.json({ links: await listShareLinks(a.id) });
}

// 새 링크 생성: 응답에 토큰 원문이 한 번만 포함됩니다.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const a = await auth(req, params.id);
  if ("err" in a) return a.err;
  const blocked = await subscriptionBlock(a.user);
  if (blocked) return blocked;
  if (!(await rateLimitAsync(`share:${a.user.id}`, 20, 60 * 60_000))) {
    return NextResponse.json({ error: "공유 링크를 너무 많이 만들었습니다. 잠시 후 다시 시도하세요." }, { status: 429 });
  }
  const body = await req.json().catch(() => null);
  const days = Number(body?.days);
  if (!Number.isInteger(days) || days < 1 || days > SHARE_MAX_DAYS) {
    return NextResponse.json({ error: `유효기간은 1~${SHARE_MAX_DAYS}일 사이로 선택하세요.` }, { status: 400 });
  }
  try {
    const r = await createShareLink(a.user.id, a.id, days);
    const base = process.env.APP_URL?.replace(/\/$/, "") || req.nextUrl.origin;
    return NextResponse.json({ id: r.id, expiresAt: r.expiresAt, url: `${base}/share/${r.token}` });
  } catch (e) {
    if (e instanceof ShareTableMissingError) return NextResponse.json({ error: e.message }, { status: 503 });
    if (e instanceof Error && e.message.startsWith("활성 공유 링크")) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const a = await auth(req, params.id);
  if ("err" in a) return a.err;
  const body = await req.json().catch(() => null);
  const linkId = Number(body?.linkId);
  if (!Number.isInteger(linkId)) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  const ok = await revokeShareLink(a.id, linkId);
  if (!ok) return NextResponse.json({ error: "링크를 찾을 수 없거나 이미 해지되었습니다." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
