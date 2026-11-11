"use client";
import RowMaterialSelect from "@/components/RowMaterialSelect";
import FileDropZone from "@/components/FileDropZone";
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

type ApplyItem = {
  matchType: "layer" | "block";
  matchName: string;
  materialId: number;
  groupName: string;
  unitScale: number;
  rawQty: number;
  saveMapping: boolean;
};

export default function DxfImportPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  const [rows, setRows] = useState<Row[] | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [discipline, setDiscipline] = useState("electrical");
  const [unsupported, setUnsupported] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [autoNotice, setAutoNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function rowToItem(r: Row): ApplyItem | null {
    if (r.skip || !r.materialId || !r.groupName.trim()) return null;
    return {
      matchType: r.matchType,
      matchName: r.matchName,
      materialId: Number(r.materialId),
      groupName: r.groupName.trim(),
      unitScale: Number(r.unitScale) || 0,
      rawQty: r.rawQty,
      saveMapping: r.saveMapping,
    };
  }

  async function applyItems(items: ApplyItem[]) {
    const res = await fetch(`/api/projects/${projectId}/dxf-import/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error ?? "추가에 실패했습니다.");
    return d.inserted as number;
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    setError(null);
    setAutoNotice(null);
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".dwg")) {
      setRows(null);
      setError("DWG 파일은 바로 읽을 수 없습니다. 아래 '변환 방법'대로 DXF로 저장한 뒤 다시 올려주세요.");
      return;
    }
    if (lower.endsWith(".pdf")) {
      setRows(null);
      setError("PDF로 변환된 도면은 레이어·블록 정보가 사라져 물량을 정확히 집계할 수 없습니다. PDF를 만들기 전의 DWG 원본을 DXF로 저장해 올려주세요. (엑셀 내역서가 있다면 '엑셀 가져오기'가 더 정확합니다.)");
      return;
    }
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
      const groups: Group[] = d.groups ?? [];
      setMaterials(d.materials ?? []);
      if (d.discipline) setDiscipline(d.discipline);
      setUnsupported(d.unsupported ?? []);

      const builtRows: Row[] = groups.map((g) => ({
        ...g,
        materialId: g.suggestedMaterialId ? String(g.suggestedMaterialId) : "",
        groupName: g.suggestedGroupName || "",
        unitScale: String(g.suggestedUnitScale),
        saveMapping: true,
        skip: !g.suggestedMaterialId,
      }));

      // 이전에 매칭을 저장해둔 레이어/블록이라 전부 자동으로 자재가 매칭됐다면,
      // 검토 화면 없이 바로 BOM에 반영하고 견적서로 이동합니다 (풀 자동 반영).
      const allAutoMapped = builtRows.length > 0 && builtRows.every((r) => !!r.suggestedMaterialId);
      if (allAutoMapped) {
        setLoading(false);
        setSubmitting(true);
        try {
          const items = builtRows.map(rowToItem).filter((x): x is ApplyItem => x !== null);
          const inserted = await applyItems(items);
          setAutoNotice(`✅ 저장된 매핑으로 ${inserted}개 항목을 자동으로 반영했습니다. 견적서로 이동합니다...`);
          setTimeout(() => router.push(`/app/estimate/${projectId}`), 900);
        } catch (err) {
          setError(err instanceof Error ? err.message : "자동 반영에 실패했습니다. 아래에서 직접 확인해주세요.");
          setRows(builtRows);
        } finally {
          setSubmitting(false);
        }
        return;
      }

      setRows(builtRows);
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
    const items = rows.map(rowToItem).filter((x): x is ApplyItem => x !== null);
    if (items.length === 0) {
      setError("추가할 항목을 1개 이상 선택하고 자재/공종을 지정하세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await applyItems(items);
      router.push(`/app/estimate/${projectId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "추가에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  const unmappedCount = rows ? rows.filter((r) => !r.suggestedMaterialId).length : 0;

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/app/estimate/${projectId}`} className="text-xs text-gray-400 underline">← 견적서로 돌아가기</Link>
        <h1 className="text-lg font-bold mt-1">📐 도면 가져오기</h1>
        <p className="text-xs text-gray-500 mt-1">
          CAD 도면을 <b>DXF</b> 파일로 내보낸 뒤 업로드하면, 레이어별 전선관/전선 길이와 블록(콘센트·스위치·조명 등) 개수를 자동으로 집계해 견적서에 반영합니다.
          DWG 파일은 CAD 프로그램에서 &ldquo;다른 이름으로 저장 → DXF&rdquo;로 변환 후 업로드해주세요.
          처음 한 번 자재를 매칭하고 저장해두면, 같은 레이어/블록 체계를 쓰는 다음 도면부터는 업로드만으로 견적서까지 전부 자동 반영됩니다.
        </p>
      </div>

      <section className="bg-white border rounded-xl p-4 space-y-3">
        <FileDropZone accept=".dxf,.dwg,.pdf" label="도면(.dxf) 올리기" disabled={loading || submitting} onFile={handleFile} />
        <details className="text-xs text-gray-500 rounded-lg bg-gray-50 p-3">
          <summary className="cursor-pointer font-semibold text-gray-600">DWG/PDF 도면이라면? DXF 변환 방법</summary>
          <ul className="mt-2 space-y-1.5 list-disc pl-4">
            <li><b>CAD 프로그램이 있을 때:</b> AutoCAD·ZWCAD·BricsCAD에서 도면을 열고 &ldquo;다른 이름으로 저장&rdquo; → 파일 형식을 <b>DXF</b>로 선택합니다.</li>
            <li><b>CAD가 없을 때:</b> 무료 <b>ODA File Converter</b>(또는 Autodesk DWG TrueView)로 DWG를 DXF로 바꿀 수 있습니다.</li>
            <li><b>PDF만 있을 때:</b> PDF로 변환된 도면은 레이어·블록 정보가 없어 자동 집계가 부정확합니다. PDF를 만들기 전의 DWG 원본을 구해 DXF로 저장해주세요.</li>
            <li>저장 후 <b>도면 단위(mm 또는 m)</b>를 아래 &ldquo;환산배수&rdquo;에서 확인하세요. 배관·배선은 레이어별, 기구는 블록으로 그려진 도면일수록 정확합니다.</li>
          </ul>
        </details>
        {fileName && <p className="text-xs text-gray-400">{fileName}</p>}
        {loading && <p className="text-sm text-gray-400">분석 중...</p>}
        {submitting && !rows && <p className="text-sm text-gray-400">반영 중...</p>}
        {autoNotice && <p className="text-sm text-[#1f6f54] font-semibold">{autoNotice}</p>}
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
            {unmappedCount > 0
              ? `새로운 레이어/블록 ${unmappedCount}개는 자동 매칭 기록이 없어 직접 지정이 필요합니다. 나머지는 이전에 저장한 매핑으로 미리 채워져 있습니다.`
              : "모든 항목이 자동으로 채워졌습니다. 확인 후 아래 버튼으로 반영하세요."}
            {" "}&ldquo;환산배수&rdquo;는 도면 단위를 자재 단위(길이: m, 개수: 개)로 바꾸는 배수입니다. 예: 도면이 mm 단위면 길이 항목은 0.001을 곱해 m로 환산합니다.
            매핑저장을 체크하면 다음 도면부터는 이 레이어/블록이 자동으로 채워집니다.
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
                    <tr key={r.key} className={`border-t ${!r.suggestedMaterialId ? "bg-amber-50" : ""}`}>
                      <td className="p-2">
                        <input type="checkbox" checked={!r.skip} onChange={(e) => updateRow(r.key, { skip: !e.target.checked })} />
                      </td>
                      <td className="p-2">{r.matchType === "layer" ? "레이어" : "블록"}</td>
                      <td className="p-2 font-medium">{r.matchName}</td>
                      <td className="p-2 text-right text-gray-500">
                        {r.kind === "length" ? `${r.rawQty.toLocaleString()} (길이)` : `${r.rawQty.toLocaleString()}개`}
                      </td>
                      <td className="p-2">
                        <RowMaterialSelect
                          discipline={discipline} value={r.materialId} known={materials} className="border rounded px-1.5 py-1 text-xs w-40"
                          onChange={(id) => updateRow(r.key, { materialId: id })}
                          onPick={(m) => setMaterials((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m as Material]))}
                        />
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
              {submitting ? "반영 중..." : "선택한 항목을 BOM에 추가"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
