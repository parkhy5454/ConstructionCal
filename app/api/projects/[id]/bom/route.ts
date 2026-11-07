import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getDb } from "@/lib/db";
import { bomItems } from "@/lib/schema";
import { getProjectOwned, materialOwned } from "@/lib/estimateData";
import type { Discipline } from "@/lib/calc";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const projectId = Number(params.id);
  if (!Number.isInteger(projectId)) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const owned = await getProjectOwned(user.id, projectId);
  if (!owned) return NextResponse.json({ error: "견적서를 찾을 수 없습니다." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const groupName = String(body?.groupName ?? "").trim();
  const materialId = Number(body?.materialId);
  const qty = Number(body?.qty ?? 0);
  if (!groupName) return NextResponse.json({ error: "공종명을 입력하세요." }, { status: 400 });
  if (!Number.isInteger(materialId)) return NextResponse.json({ error: "자재를 선택하세요." }, { status: 400 });
  if (!isFinite(qty) || qty < 0) return NextResponse.json({ error: "수량이 올바르지 않습니다." }, { status: 400 });
  if (groupName.length > 60) return NextResponse.json({ error: "공종명은 60자 이하로 입력하세요." }, { status: 400 });
  if (!(await materialOwned(user.id, materialId, owned.discipline as Discipline))) {
    return NextResponse.json({ error: "이 견적서의 업종에서 사용할 수 없는 자재입니다." }, { status: 400 });
  }

  const db = getDb();
  const [row] = await db.insert(bomItems).values({ projectId, groupName, materialId, qty: String(qty), sortOrder: 9999 }).returning();
  return NextResponse.json({ item: row });
}
