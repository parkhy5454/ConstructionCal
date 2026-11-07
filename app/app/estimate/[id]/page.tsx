"use client";
import { Fragment, useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { fmt, DISCIPLINE_LABELS } from "@/lib/calc";
import type { ComputeResult, Material, BomItem, Discipline } from "@/lib/calc";

type ProjectData = {
  project: { id: number; name: string; discipline: Discipline };
  materials: Material[];
  bom: BomItem[];
  result: ComputeResult;
};

export default function EstimateDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;
  const [data, setData] = useState<ProjectData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newGroup, setNewGroup] = useState("");
  const [newMaterialId, setNewMaterialId] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}`);
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "불러오기 실패"); return; }
    setData(d);
    if (!newGroup && d.bom.length > 0) setNewGroup(d.bom[d.bom.length - 1].groupName);
  }, [projectId, newGroup]);

  useEffect(() => { load(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function updateQty(bomId: number, qty: number) {
    await fetch(`/api/projects/${projectId}/bom/${bomId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qty }),
    });
    load();
  }

  async function removeItem(bomId: number) {
    await fetch(`/api/projects/${projectId}/bom/${bomId}`, { method: "DELETE" });
    load();
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newGroup.trim() || !newMaterialId) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/bom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupName: newGroup.trim(), materialId: Number(newMaterialId), qty: Number(newQty) || 0 }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error ?? "추가 실패"); return; }
    setNewMaterialId("");
    setNewQty("1");
    load();
  }

  async function removeProject() {
    if (!confirm("이 견적서를 삭제할까요?")) return;
    await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    router.push("/app/estimate");
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-gray-400">불러오는 중...</p>;

  const { project, materials, bom, result } = data;
  const matById = new Map(materials.map((m) => [m.id, m]));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/app/estimate" className="text-xs text-gray-400 underline">← 견적서 목록</Link>
          <h1 className="text-lg font-bold mt-1">
            {project.name}{" "}
            <span className="ml-1 text-[10px] font-medium text-[#1f6f54] bg-[#e3efe8] rounded-full px-2 py-0.5 align-middle">
              {DISCIPLINE_LABELS[project.discipline] ?? project.discipline}
            </span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Link
            href={`/app/estimate/${projectId}/excel`}
            className="text-xs bg-[#1f6f54] text-white rounded-lg px-3 py-1.5 font-semibold"
          >
            📊 엑셀 내역서로 물량 가져오기
          </Link>
          <Link
            href={`/app/estimate/${projectId}/dxf`}
            className="text-xs bg-[#1f6f54] text-white rounded-lg px-3 py-1.5 font-semibold"
          >
            📐 도면으로 물량 가져오기
          </Link>
          <a
            href={`/api/projects/${projectId}/export`}
            className="text-xs bg-black text-white rounded-lg px-3 py-1.5 font-semibold"
          >
            ⬇ 엑셀 다운로드
          </a>
          <button onClick={removeProject} className="text-xs text-red-600 underline">삭제</button>
        </div>
      </div>

      {/* BOM 입력 */}
      <section className="bg-white border rounded-xl p-4">
        <h2 className="text-sm font-bold mb-1">물량 입력 (BOM)</h2>
        <p className="text-xs text-gray-400 mb-3">수량만 바꿔보세요. 단가는 물가정보 DB에서 자동으로 매칭됩니다.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 text-left">
                <th className="py-1.5 pr-2">공종</th>
                <th className="py-1.5 pr-2">품명 / 규격</th>
                <th className="py-1.5 pr-2">단위</th>
                <th className="py-1.5 pr-2 text-right">수량</th>
                <th className="py-1.5 pr-2 text-right">재료비</th>
                <th className="py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {bom.map((b) => {
                const mat = matById.get(b.materialId);
                const amt = (mat?.price ?? 0) * b.qty;
                return (
                  <tr key={b.id} className="border-t">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{b.groupName}</td>
                    <td className="py-1.5 pr-2">
                      <div className="font-medium">{mat?.name}</div>
                      <div className="text-gray-400">{mat?.spec}</div>
                    </td>
                    <td className="py-1.5 pr-2">{mat?.unit}</td>
                    <td className="py-1.5 pr-2 text-right">
                      <input
                        type="number" min="0" step="1" defaultValue={b.qty}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (isFinite(v) && v !== b.qty) updateQty(b.id!, v);
                        }}
                        className="w-16 text-right border rounded px-1.5 py-1"
                      />
                    </td>
                    <td className="py-1.5 pr-2 text-right font-semibold">{fmt(amt)}</td>
                    <td className="py-1.5 text-right">
                      <button onClick={() => removeItem(b.id!)} className="text-gray-400 hover:text-red-600">✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <form onSubmit={addItem} className="mt-3 flex flex-wrap gap-2 items-center border-t pt-3">
          <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="공종 (예: 1.전열공사)"
            className="border rounded-lg px-2 py-1.5 text-xs w-32" />
          <select value={newMaterialId} onChange={(e) => setNewMaterialId(e.target.value)} className="border rounded-lg px-2 py-1.5 text-xs flex-1 min-w-[160px]">
            <option value="">자재 선택...</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>{m.name} ({m.spec || m.unit})</option>
            ))}
          </select>
          <input type="number" min="0" step="1" value={newQty} onChange={(e) => setNewQty(e.target.value)}
            className="border rounded-lg px-2 py-1.5 text-xs w-16 text-right" />
          <button disabled={busy} className="bg-black text-white rounded-lg px-3 py-1.5 text-xs font-semibold">추가</button>
        </form>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </section>

      {/* 내역서 */}
      <section className="bg-white border rounded-xl p-4">
        <h2 className="text-sm font-bold mb-3">내역서 <span className="text-[10px] bg-amber-50 text-amber-700 rounded-full px-2 py-0.5 ml-1">자동산출</span></h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 text-left">
                <th className="py-1.5 pr-2">품명 / 규격</th>
                <th className="py-1.5 pr-2 text-right">수량</th>
                <th className="py-1.5 pr-2 text-right">재료비</th>
                <th className="py-1.5 pr-2 text-right">노무비</th>
                <th className="py-1.5 pr-2 text-right">경비</th>
                <th className="py-1.5 text-right">계</th>
              </tr>
            </thead>
            <tbody>
              {result.groupResults.map((g) => (
                <Fragment key={g.g}>
                  <tr className="bg-gray-50"><td colSpan={6} className="py-1.5 px-2 font-bold">{g.g}</td></tr>
                  {g.items.map((it, idx) => (
                    <tr key={idx} className="border-t text-gray-600">
                      <td className="py-1.5 pr-2">{it.name} <span className="text-gray-400">{it.spec}</span></td>
                      <td className="py-1.5 pr-2 text-right">{it.qty}</td>
                      <td className="py-1.5 pr-2 text-right">{fmt(it.matAmt)}</td>
                      <td className="py-1.5 pr-2 text-right">0</td>
                      <td className="py-1.5 pr-2 text-right">0</td>
                      <td className="py-1.5 text-right">{fmt(it.matAmt)}</td>
                    </tr>
                  ))}
                  <tr className="border-t text-gray-400 italic">
                    <td className="py-1.5 pr-2">배관 부속재</td><td className="py-1.5 pr-2 text-right">1</td>
                    <td className="py-1.5 pr-2 text-right">{fmt(g.accessory)}</td><td className="py-1.5 pr-2 text-right">0</td>
                    <td className="py-1.5 pr-2 text-right">0</td><td className="py-1.5 text-right">{fmt(g.accessory)}</td>
                  </tr>
                  <tr className="text-gray-400 italic">
                    <td className="py-1.5 pr-2">소모 잡자재</td><td className="py-1.5 pr-2 text-right">1</td>
                    <td className="py-1.5 pr-2 text-right">{fmt(g.consumable)}</td><td className="py-1.5 pr-2 text-right">0</td>
                    <td className="py-1.5 pr-2 text-right">0</td><td className="py-1.5 text-right">{fmt(g.consumable)}</td>
                  </tr>
                  <tr className="text-gray-400 italic">
                    <td className="py-1.5 pr-2">노무비(공수)</td><td className="py-1.5 pr-2 text-right">{g.laborHeadcount.toFixed(2)}인</td>
                    <td className="py-1.5 pr-2 text-right">0</td><td className="py-1.5 pr-2 text-right">{fmt(g.laborAmt)}</td>
                    <td className="py-1.5 pr-2 text-right">0</td><td className="py-1.5 text-right">{fmt(g.laborAmt)}</td>
                  </tr>
                  <tr className="text-gray-400 italic">
                    <td className="py-1.5 pr-2">공구손료</td><td className="py-1.5 pr-2 text-right">1</td>
                    <td className="py-1.5 pr-2 text-right">0</td><td className="py-1.5 pr-2 text-right">0</td>
                    <td className="py-1.5 pr-2 text-right">{fmt(g.toolLoss)}</td><td className="py-1.5 text-right">{fmt(g.toolLoss)}</td>
                  </tr>
                  <tr className="bg-gray-50 font-bold border-t">
                    <td className="py-1.5 pr-2">합계</td><td></td>
                    <td className="py-1.5 pr-2 text-right">{fmt(g.matTotal)}</td>
                    <td className="py-1.5 pr-2 text-right">{fmt(g.laborTotal)}</td>
                    <td className="py-1.5 pr-2 text-right">{fmt(g.expenseTotal)}</td>
                    <td className="py-1.5 text-right">{fmt(g.groupTotal)}</td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 총괄표 */}
      <section className="bg-white border rounded-xl p-4">
        <h2 className="text-sm font-bold mb-3">총괄표</h2>
        <table className="w-full text-xs">
          <thead><tr className="text-gray-400 text-left">
            <th className="py-1.5 pr-2">공종</th><th className="py-1.5 pr-2 text-right">재료비</th>
            <th className="py-1.5 pr-2 text-right">노무비</th><th className="py-1.5 pr-2 text-right">경비</th><th className="py-1.5 text-right">계</th>
          </tr></thead>
          <tbody>
            {result.groupResults.map((g) => (
              <tr key={g.g} className="border-t">
                <td className="py-1.5 pr-2">{g.g}</td>
                <td className="py-1.5 pr-2 text-right">{fmt(g.matTotal)}</td>
                <td className="py-1.5 pr-2 text-right">{fmt(g.laborTotal)}</td>
                <td className="py-1.5 pr-2 text-right">{fmt(g.expenseTotal)}</td>
                <td className="py-1.5 text-right">{fmt(g.groupTotal)}</td>
              </tr>
            ))}
            <tr className="bg-gray-50 font-bold border-t">
              <td className="py-1.5 pr-2">합계</td>
              <td className="py-1.5 pr-2 text-right">{fmt(result.sumMat)}</td>
              <td className="py-1.5 pr-2 text-right">{fmt(result.sumLabor)}</td>
              <td className="py-1.5 pr-2 text-right">{fmt(result.sumExpense)}</td>
              <td className="py-1.5 text-right">{fmt(result.sumMat + result.sumLabor + result.sumExpense)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 원가계산서 */}
      <section className="bg-white border rounded-xl p-4">
        <h2 className="text-sm font-bold mb-3">원가계산서</h2>
        <table className="w-full text-xs">
          <tbody>
            {[
              ["가. 직접재료비", "", result.sumMat, false],
              ["나. 직접노무비", "", result.sumLabor, false],
              ["　간접노무비", "나 × 비율", result.indirectLabor, false],
              ["노무비 소계", "나 + 간접노무비", result.laborSubtotal, true],
              ["다. 기타경비", "(가+나) × 비율", result.etcExpense, false],
              ["　산재보험료", "노무비 × 비율", result.industrialIns, false],
              ["　고용보험료", "노무비 × 비율", result.employIns, false],
              ["경비 소계", "", result.expenseSubtotal, true],
              ["순공사비", "가+나+다", result.directCost, true],
              ["일반관리비", "순공사비 × 비율", result.gna, false],
              ["소계", "순공사비+일반관리비", result.subtotal, true],
              ["이윤", "(노무비+경비+일반관리비) × 비율", result.profit, false],
              ["계", "소계+이윤", result.beforeVat, true],
              ["부가가치세", "계 × 비율", result.vat, false],
              ["합계 (최종 견적금액)", "계+부가세", result.final, true],
            ].map(([label, formula, amt, bold], idx) => (
              <tr key={idx} className={bold ? "bg-gray-50 font-bold border-t" : "border-t"}>
                <td className="py-1.5 pr-2">{label as string}</td>
                <td className="py-1.5 pr-2 text-gray-400">{formula as string}</td>
                <td className="py-1.5 text-right">{fmt(amt as number)}원</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
