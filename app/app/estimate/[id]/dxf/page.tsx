"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type Material = { id: number; name: string; spec: string; unit: string };

type Group = {
  key: string;
  matchType: "layer" | "block";
  matchName: string;
  kind: "length" | "count";
  rawQty: number;
  entityCount: number;
  suggestedMaterialId: number | null;
  suggestedGroupName: string;
  suggestedUnitScale: number;
};

type Row = Group & {
  materialId: string;
  groupName: string;
  unitScale: string;
  saveMapping: boolean;
  skip: boolean;
};

export default function DxfImportPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  const [rows, setRows] = useState<Row[] | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [unsupported, setUnsupported] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setLoading(true);
    setRows(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/projects/${projectId}/dxf-import`, { method: "POST", body: form });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "분석에 실패했습니다.");
        return;
      }
      setMaterials(d.materials ?? []);
      setUnsupported(d.unsupported ?? []);
      setRows(
        (d.groups as Group[]).map((g) => ({
          ...g,
          materialId: g.suggestedMaterialId ? String(g.suggestedMaterialId) : "",
          groupName: g.suggestedGroupName || "",
          unitScale: String(g.suggestedUnitScale),
          saveMapping: true,
          skip: !g.suggestedMaterialId,
        }))
      );
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev?.map((r) => (r.key === key ? { ...r, ...patch } : r)) ?? prev);
  }

  async function submit() {
    if (!rows) return;
    const items = rows
      .filter((r) => !r.skip && r.materialId && r.groupName.trim())
      .map((r) => ({
        matchType: r.matchType,
        matchName: r.matchName,
        materialId: Number(r.materialId),
        groupName: r.groupName.trim(),
        unitScale: Number(r.unitScale) || 0,
        rawQty: r.rawQty,
        saveMapping: r.saveMapping,
      }));
    if (items.length === 0) {
      setError("추가할 항목을 1개 이상 선택하고 자재/공종을 지정하세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/dxf-import/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "추가에 실패했습니다.");
        return;
      }
      router.push(`/app/estimate/${projectId}`);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/app/estimate/${projectId}`} className="text-xs text-gray-400 underline">← 견적서로 돌아가기</Link>
        <h1 className="text-lg font-bold mt-1">📐 도면으로 물량 가져오기</h1>
        <p className="text-xs text-gray-500 mt-1">
          CAD 도면을 <b>DXF</b> 파일로 내보낸 뒤 업로드하면, 레이어별 전선관/전선 길이와 블록(콘센트·스위치·조명 등) 개수를 자동으로 집계합니다.
          DWG 파일은 CAD 프로그램에서 &ldquo;다른 이름으로 저장 → DXF&rdquo;로 변환 후 업로드해주세요.
        </p>
      </div>

      <section className="bg-white border rounded-xl p-4 space-y-3">
        <input type="file" accept=".dxf" onChange={onFileChange} className="text-sm" />
        {fileName && <p className="text-xs text-gray-400">{fileName}</p>}
        {loading && <p className="text-sm text-gray-400">분석 중...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {unsupported.length > 0 && (
          <p className="text-xs text-amber-600">
            참고: 다음 객체 유형은 집계 대상이 아니라 무시되었습니다 — {unsupported.join(", ")}
          </p>
        )}
      </section>

      {rows && rows.length === 0 && (
        <p className="text-sm text-gray-400">도면에서 집계 가능한 라인/블록을 찾지 못했습니다.</p>
      )}

      {rows && rows.length > 0 && (
        <section className="bg-white border rounded-xl p-4 space-y-3">
          <p className="text-xs text-gray-500">
            각 레이어/블록에 매칭할 자재와 공종을 지정하세요. &ldquo;환산배수&rdquo;는 도면 단위를 자재 단위(길이: m, 개수: 개)로 바꾸는 배수입니다.
            예: 도면이 mm 단위면 길이 항목은 0.001을 곱해 m로 환산합니다. 체크박스를 해제하면 해당 항목은 건너뜁니다.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500">
                  <th className="p-2 text-left">포함</th>
                  <th className="p-2 text-left">유형</th>
                  <th className="p-2 text-left">레이어/블록명</th>
                  <th className="p-2 text-right">도면값</th>
                  <th className="p-2 text-left">자재</th>
                  <th className="p-2 text-left">공종</th>
                  <th className="p-2 text-right">환산배수</th>
                  <th className="p-2 text-right">최종수량</th>
                  <th className="p-2 text-center">매핑저장</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const final = Math.round((r.rawQty * (Number(r.unitScale) || 0)) * 100) / 100;
                  return (
                    <tr key={r.key} className="border-t">
                      <td className="p-2">
                        <input type="checkbox" checked={!r.skip} onChange={(e) => updateRow(r.key, { skip: !e.target.checked })} />
                      </td>
                      <td className="p-2">{r.matchType === "layer" ? "레이어" : "블록"}</td>
                      <td className="p-2 font-medium">{r.matchName}</td>
                      <td className="p-2 text-right text-gray-500">
                        {r.kind === "length" ? `${r.rawQty.toLocaleString()} (길이)` : `${r.rawQty.toLocaleString()}개`}
                      </td>
                      <td className="p-2">
                        <select
                          value={r.materialId}
                          onChange={(e) => updateRow(r.key, { materialId: e.target.value })}
                          className="border rounded px-1.5 py-1 text-xs w-40"
                        >
                          <option value="">선택 안 함</option>
                          {materials.map((m) => (
                            <option key={m.id} value={m.id}>{m.name} {m.spec}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          value={r.groupName}
                          onChange={(e) => updateRow(r.key, { groupName: e.target.value })}
                          placeholder="예: 1.전열공사"
                          className="border rounded px-1.5 py-1 text-xs w-28"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          value={r.unitScale}
                          onChange={(e) => updateRow(r.key, { unitScale: e.target.value })}
                          className="border rounded px-1.5 py-1 text-xs w-20 text-right"
                        />
                      </td>
                      <td className="p-2 text-right font-semibold">{final.toLocaleString()}</td>
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={r.saveMapping}
                          onChange={(e) => updateRow(r.key, { saveMapping: e.target.checked })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end pt-2">
            <button
              onClick={submit}
              disabled={submitting}
              className="bg-[#1f6f54] text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {submitting ? "추가 중..." : "선택한 항목을 BOM에 추가"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
