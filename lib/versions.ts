// 견적서 버전 이력: 스냅샷 생성/비교(순수 함수) — 클라이언트에서도 import 합니다(DB 코드 없음).
import type { BomItem, Material, Surcharge, ComputeResult } from "./calc";

export type SnapshotItem = { g: string; mid: number; name: string; spec: string; unit: string; qty: number; price: number };
export type Snapshot = {
  v: 1;
  items: SnapshotItem[];
  surcharges: Surcharge[];
  totals: { sumMat: number; sumLabor: number; sumExpense: number; final: number };
};

export function buildSnapshot(bom: BomItem[], materials: Material[], surcharges: Surcharge[], result: ComputeResult): Snapshot {
  const matById = new Map(materials.map((m) => [m.id, m]));
  return {
    v: 1,
    items: bom.map((b) => {
      const m = matById.get(b.materialId);
      return { g: b.groupName, mid: b.materialId, name: m?.name ?? "(삭제된 자재)", spec: m?.spec ?? "", unit: m?.unit ?? "", qty: b.qty, price: m?.price ?? 0 };
    }),
    surcharges,
    totals: { sumMat: result.sumMat, sumLabor: result.sumLabor, sumExpense: result.sumExpense, final: result.final },
  };
}

export function parseSnapshot(text: string): Snapshot | null {
  try {
    const s = JSON.parse(text);
    if (s?.v !== 1 || !Array.isArray(s.items)) return null;
    return s as Snapshot;
  } catch {
    return null;
  }
}

export type DiffRow = {
  group: string; name: string; spec: string; unit: string;
  qtyA: number; qtyB: number; priceA: number; priceB: number;
  status: "added" | "removed" | "changed" | "same";
};

// A(이전) → B(이후) 비교. 같은 공종·품명·규격·단위의 수량은 합산해 비교합니다.
export function diffSnapshots(a: Snapshot, b: Snapshot): { rows: DiffRow[]; summary: { added: number; removed: number; changed: number; same: number } } {
  const key = (i: SnapshotItem) => `${i.g}||${i.name}||${i.spec}||${i.unit}`;
  const agg = (items: SnapshotItem[]) => {
    const m = new Map<string, SnapshotItem>();
    for (const it of items) {
      const k = key(it);
      const cur = m.get(k);
      if (cur) cur.qty += it.qty;
      else m.set(k, { ...it });
    }
    return m;
  };
  const ma = agg(a.items);
  const mb = agg(b.items);
  const keys = Array.from(new Set([...Array.from(ma.keys()), ...Array.from(mb.keys())]));
  const rows: DiffRow[] = keys.map((k) => {
    const x = ma.get(k);
    const y = mb.get(k);
    const base = (y ?? x)!;
    const qtyA = x?.qty ?? 0, qtyB = y?.qty ?? 0, priceA = x?.price ?? 0, priceB = y?.price ?? 0;
    const status: DiffRow["status"] = !x ? "added" : !y ? "removed" : qtyA !== qtyB || priceA !== priceB ? "changed" : "same";
    return { group: base.g, name: base.name, spec: base.spec, unit: base.unit, qtyA, qtyB, priceA, priceB, status };
  });
  const order = { changed: 0, added: 1, removed: 2, same: 3 } as const;
  rows.sort((p, q) => order[p.status] - order[q.status] || p.group.localeCompare(q.group));
  const summary = { added: 0, removed: 0, changed: 0, same: 0 };
  for (const r of rows) summary[r.status] += 1;
  return { rows, summary };
}
