import { subscriptionBlock } from "@/lib/subscription";
import { NextRequest, NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/currentUser";
import { getDb } from "@/lib/db";
import { projects, bomItems } from "@/lib/schema";
import { getProjectOwned } from "@/lib/estimateData";
import { disciplineBlock } from "@/lib/disciplineAccess";

export const runtime = "nodejs";

// 견적서 복제: 같은 업종으로 새 견적서를 만들고 물량(BOM)을 그대로 복사합니다. 비슷한 공사 견적을 고쳐 쓸 때 사용합니다.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const blocked = await subscriptionBlock(user);
  if (blocked) return blocked;
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const src = await getProjectOwned(user.id, id);
  if (!src) return NextResponse.json({ error: "견적서를 찾을 수 없습니다." }, { status: 404 });

  const dBlocked = await disciplineBlock(user, src.discipline);
  if (dBlocked) return dBlocked;

  const db = getDb();
  const suffix = " (복사)";
  const name = (src.name.length + suffix.length > 120 ? src.name.slice(0, 120 - suffix.length) : src.name) + suffix;

  const [created] = await db.insert(projects).values({ userId: user.id, discipline: src.discipline, name }).returning();

  const rows = await db.select().from(bomItems).where(eq(bomItems.projectId, id)).orderBy(asc(bomItems.sortOrder), asc(bomItems.id));
  for (let i = 0; i < rows.length; i += 500) {
    await db.insert(bomItems).values(
      rows.slice(i, i + 500).map((b) => ({
        projectId: created.id,
        groupName: b.groupName,
        materialId: b.materialId,
        qty: b.qty,
        sortOrder: b.sortOrder,
      }))
    );
  }

  return NextResponse.json({ project: created, copiedItems: rows.length });
}
