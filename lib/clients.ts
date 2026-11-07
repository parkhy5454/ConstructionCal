import { eq, and, desc } from "drizzle-orm";
import { getDb } from "./db";
import { clients } from "./schema";
import { isMissingTable } from "./security";

export type Client = typeof clients.$inferSelect;

// clients 테이블이 아직 없으면 빈 목록
export async function listClients(userId: number): Promise<Client[]> {
  try {
    return await getDb().select().from(clients).where(eq(clients.userId, userId)).orderBy(desc(clients.id));
  } catch (e) {
    if (isMissingTable(e)) return [];
    throw e;
  }
}

export async function clientOwned(userId: number, clientId: number): Promise<boolean> {
  try {
    const rows = await getDb().select({ id: clients.id }).from(clients).where(and(eq(clients.id, clientId), eq(clients.userId, userId))).limit(1);
    return rows.length > 0;
  } catch (e) {
    if (isMissingTable(e)) return false;
    throw e;
  }
}

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

export function parseClientBody(body: Record<string, unknown> | null): { error: string } | { value: { name: string; contact: string; phone: string; email: string; address: string; memo: string } } {
  const name = clip(body?.name, 120);
  if (!name) return { error: "거래처 이름을 입력하세요." };
  return { value: { name, contact: clip(body?.contact, 80), phone: clip(body?.phone, 40), email: clip(body?.email, 255), address: clip(body?.address, 255), memo: clip(body?.memo, 2000) } };
}

