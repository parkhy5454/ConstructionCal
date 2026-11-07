import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getDb } from "@/lib/db";
import { clients } from "@/lib/schema";
import { listClients, parseClientBody } from "@/lib/clients";
import { subscriptionBlock } from "@/lib/subscription";
import { isMissingTable } from "@/lib/security";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  return NextResponse.json({ clients: await listClients(user.id) });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const blocked = await subscriptionBlock(user);
  if (blocked) return blocked;
  const parsed = parseClientBody(await req.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if ((await listClients(user.id)).length >= 500) return NextResponse.json({ error: "거래처는 최대 500개까지 등록할 수 있습니다." }, { status: 400 });
  try {
    const [row] = await getDb().insert(clients).values({ userId: user.id, ...parsed.value }).returning();
    return NextResponse.json({ client: row });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: "거래처 테이블이 아직 없습니다. 운영 DB에 npm run db:push를 실행하세요." }, { status: 503 });
    throw e;
  }
}
