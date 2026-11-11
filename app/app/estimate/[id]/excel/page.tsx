"use client";
import FileDropZone from "@/components/FileDropZone";
import RowMaterialSelect from "@/components/RowMaterialSelect";
import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { normUnit } from "@/lib/excelMatch";
import ColumnMapper, { type Mapping } from "./ColumnMapper";
import { parsePasted } from "@/lib/pasteParse";

type Material = { id: number; name: string; spec: string; unit: string; price: number };
type Method = "saved" | "exact" | "fuzzy" | "none";
type SheetInfo = { name: string; rowCount: number; defaultInclude: boolean };

type ApiRow = {
  sheet: string;
  rowNo: number;
  groupName: string;
  name: string;
  spec: string;
  unit: string;
  qty: number;
  origPrice: number | null;
  key: string;
  suggestedMaterialId: number | null;
  method: Method;
  score: number;
};

type Row = ApiRow & {
  rid: string;
  materialId: string; // "" | 자재 id | "new"(새 자재로 등록)
  include: boolean;
  saveMapping: boolean;
};

type ApplyItem = {
  key: string;
  name: string;
  spec: string;
  unit: string;
  qty: number;
  groupName: string;
  materialId?: number;
  newMaterial?: { price: number };
  saveMapping: boolean;
};

const won = (n: number) => Math.round(n).toLocaleString();

function Badge({ method, score }: { method: Method; score: number }) {
  if (method === "saved") return <span className="text-[10px] rounded-full px-2 py-0.5 bg-[#e3efe8] text-[#1f6f54] font-semibold">저장된 매칭</span>;
  if (method === "exact") return <span className="text-[10px] rounded-full px-2 py-0.5 bg-[#e3efe8] text-[#1f6f54] font-semibold">일치</span>;
  if (method === "fuzzy") return <span className="text-[10px] rounded-full px-2 py-0.5 bg-amber-100 text-amber-700 font-semibold">유사 {Math.round(score * 100)}% · 확인</span>;
  return <span className="text-[10px] rounded-full px-2 py-0.5 bg-red-100 text-red-600 font-semibold">매칭 없음</span>;
}

export default function ExcelImportPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  const [rows, setRows] = useState<Row[] | null>(null);
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [sheetOn, setSheetOn] = useState<Record<string, boolean>>({});
  const [materials, setMaterials] = useState<Material[]>([]);
  const [discipline, setDiscipline] = useState("electrical");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [existingBomCount, setExistingBomCount] = useState(0);
  const [replace, setReplace] = useState(false);
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [limit, setLimit] = useState(100);
  const [fileName, setFileName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [showMapper, setShowMapper] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [oneClick, setOneClick] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [autoNotice, setAutoNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const matById = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);

  function unitMismatch(r: Row): Material | null {
    if (!r.materialId || r.materialId === "new" || !r.unit) return null;
    const m = matById.get(Number(r.materialId));
    return m && normUnit(m.unit) !== normUnit(r.unit) ? m : null;
  }

  function rowToItem(r: Row): ApplyItem | null {
    if (!r.include || !r.materialId || !r.groupName.trim()) return null;
    const base = { key: r.key, name: r.name, spec: r.spec, unit: r.unit, qty: r.qty, groupName: r.groupName.trim(), saveMapping: r.saveMapping };
    if (r.materialId === "new") return { ...base, newMaterial: { price: r.origPrice ?? 0 } };
    return { ...base, materialId: Number(r.materialId) };
  }

  async function applyItems(items: ApplyItem[], doReplace: boolean) {
    const res = await fetch(`/api/projects/${projectId}/excel-import/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, replace: doReplace }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error ?? "반영에 실패했습니다.");
    return d as { inserted: number; createdMaterials: number };
  }

  async function handleFile(file: File, mapping?: Mapping) {
    setFile(file);
    setShowMapper(false);
    setFileName(file.name);
    setError(null);
    setAutoNotice(null);
    setLoading(true);
    setRows(null);
    setLimit(100);
    try {
      const form = new FormData();
      form.append("file", file);
      if (mapping) form.append("mapping", JSON.stringify(mapping));
      const res = await fetch(`/api/projects/${projectId}/excel-import`, { method: "POST", body: form });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "분석에 실패했습니다.");
        return;
      }
      if (typeof d.rawText === "string" && d.rawText) setPasteText(d.rawText);
      await processResult(d);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  // 표 붙여넣기: 붙여넣은 텍스트를 행으로 나눠 서버에서 자재와 매칭한 뒤 같은 확인 화면으로 보냅니다.
  async function handlePaste() {
    setError(null); setAutoNotice(null); setFileName(""); setFile(null); setShowMapper(false); setRows(null); setLimit(100);
    const { rows: pr, skipped } = parsePasted(pasteText);
    if (pr.length === 0) { setError("붙여넣은 내용에서 '품명 … 수량' 형태의 행을 찾지 못했습니다. 엑셀에서 셀 범위를 복사해 붙여넣어 보세요."); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/excel-import/paste`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: pr }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? "분석에 실패했습니다."); return; }
      if (skipped > 0) d.warnings = [...(d.warnings ?? []), `읽지 못해 건너뛴 줄이 ${skipped}개 있습니다(품명·수량이 없는 줄).`];
      await processResult(d);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function processResult(d: { discipline?: string; rows?: ApiRow[]; materials?: Material[]; sheets?: SheetInfo[]; warnings?: string[]; existingBomCount?: number; needMapping?: boolean }) {
    try {
      if (d.needMapping) setShowMapper(true);
      const apiRows: ApiRow[] = d.rows ?? [];
      const mats: Material[] = d.materials ?? [];
      const sh: SheetInfo[] = d.sheets ?? [];
      setMaterials(mats);
      if (d.discipline) setDiscipline(d.discipline);
      setSheets(sh);
      setWarnings(d.warnings ?? []);
      setExistingBomCount(d.existingBomCount ?? 0);
      const on: Record<string, boolean> = {};
      sh.forEach((s) => (on[s.name] = s.defaultInclude));
      setSheetOn(on);

      // 한 번에 반영 옵션: 저장된 매칭/일치는 그대로, 유사·매칭 없음은 새 자재로 등록(원본 단가, 없으면 0원)
      const built: Row[] = apiRows.map((r) => {
        const sure = r.method === "saved" || r.method === "exact";
        const asNew = oneClick && !sure;
        return {
          ...r,
          rid: `${r.sheet}#${r.rowNo}`,
          materialId: asNew ? "new" : r.suggestedMaterialId ? String(r.suggestedMaterialId) : "",
          include: asNew || !!r.suggestedMaterialId,
          saveMapping: true,
        };
      });

      // 기본 포함 시트의 모든 행이 "저장된 매칭/정확 일치"이고 단위도 맞고, 견적서 BOM이 비어 있으면
      // 확인 화면 없이 바로 반영합니다 (풀 자동). 기존 BOM이 있으면 중복 방지를 위해 항상 확인을 거칩니다.
      const targets = built.filter((r) => on[r.sheet]);
      const matById2 = new Map(mats.map((m) => [m.id, m]));
      const allSure =
        targets.length > 0 &&
        targets.every((r) => {
          if (oneClick) return true;
          if (r.method !== "saved" && r.method !== "exact") return false;
          const m = r.suggestedMaterialId ? matById2.get(r.suggestedMaterialId) : null;
          return !(m && r.unit && normUnit(m.unit) !== normUnit(r.unit));
        });
      if (allSure && (d.existingBomCount ?? 0) === 0) {
        setLoading(false);
        setSubmitting(true);
        try {
          const items = targets.map(rowToItem).filter((x): x is ApplyItem => x !== null);
          const out = await applyItems(items, false);
          setAutoNotice(`✅ 모든 행이 자동 매칭되어 ${out.inserted}개 항목을 반영했습니다. 견적서로 이동합니다...`);
          setTimeout(() => router.push(`/app/estimate/${projectId}`), 900);
        } catch (err) {
          setError(err instanceof Error ? err.message : "자동 반영에 실패했습니다. 아래에서 직접 확인해주세요.");
          setRows(built);
        } finally {
          setSubmitting(false);
        }
        return;
      }
      setReplace(false);
      setRows(built);
    } catch {
      setError("처리 중 오류가 발생했습니다.");
    }
  }

  function updateRow(rid: string, patch: Partial<Row>) {
    setRows((prev) => prev?.map((r) => (r.rid === rid ? { ...r, ...patch } : r)) ?? prev);
  }

  const inSheets = useMemo(() => (rows ?? []).filter((r) => sheetOn[r.sheet]), [rows, sheetOn]);

  const stats = useMemo(() => {
    let auto = 0, fuzzy = 0, none = 0, selected = 0, origTotal = 0, ourTotal = 0, compared = 0;
    for (const r of inSheets) {
      if (r.method === "saved" || r.method === "exact") auto++;
      else if (r.method === "fuzzy") fuzzy++;
      else none++;
      if (r.include && r.materialId) {
        selected++;
        // 원본 단가가 있는 행만 같은 기준으로 비교합니다.
        if (r.origPrice != null) {
          const our = r.materialId === "new" ? r.origPrice : matById.get(Number(r.materialId))?.price;
          if (our != null) {
            origTotal += r.qty * r.origPrice;
            ourTotal += r.qty * our;
            compared++;
          }
        }
      }
    }
    return { auto, fuzzy, none, selected, origTotal, ourTotal, compared };
  }, [inSheets, matById]);

  const attention = (r: Row) => r.method === "fuzzy" || r.method === "none" || !!unitMismatch(r);
  const shown = inSheets.filter((r) => !onlyAttention || attention(r));

  // 전체 선택: 지금 보이는 모든 행을 포함/해제합니다. 켤 때 매칭 없는 행은 새 자재로 등록되도록 지정합니다(원본 단가, 없으면 0원).
  const selectable = shown;
  const allChecked = selectable.length > 0 && selectable.every((r) => r.include && r.materialId);
  const someChecked = selectable.some((r) => r.include);
  const noMatchShown = shown.filter((r) => !r.materialId).length;
  function setAllInclude(on: boolean) {
    const ids = new Set(selectable.map((r) => r.rid));
    setRows((prev) => prev?.map((r) => (ids.has(r.rid) ? { ...r, include: on, materialId: on && !r.materialId ? "new" : r.materialId } : r)) ?? prev);
  }
  // 매칭 없는 행을 한꺼번에 새 자재로 등록(원본 단가가 있으면 그 단가, 없으면 0원) — 사용자가 버튼을 눌렀을 때만.
  function registerAllUnmatchedAsNew() {
    const ids = new Set(shown.filter((r) => !r.materialId).map((r) => r.rid));
    setRows((prev) => prev?.map((r) => (ids.has(r.rid) ? { ...r, materialId: "new", include: true } : r)) ?? prev);
  }

  async function submit() {
    if (!rows) return;
    const items = inSheets.map(rowToItem).filter((x): x is ApplyItem => x !== null);
    if (items.length === 0) {
      setError("반영할 행이 없습니다. 행을 포함으로 체크하고 자재와 공종을 지정하세요.");
      return;
    }
    if (replace && !window.confirm(`기존 BOM ${existingBomCount}개 항목을 모두 삭제하고 엑셀 내용으로 교체합니다. 계속할까요?`)) return;
    setSubmitting(true);
    setError(null);
    try {
      await applyItems(items, replace);
      router.push(`/app/estimate/${projectId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "반영에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  const diff = stats.origTotal > 0 ? ((stats.ourTotal - stats.origTotal) / stats.origTotal) * 100 : 0;

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/app/estimate/${projectId}`} className="text-xs text-gray-400 underline">← 견적서로 돌아가기</Link>
        <h1 className="text-lg font-bold mt-1">📊 엑셀 가져오기</h1>
        <p className="text-xs text-gray-500 mt-1">
          기존에 쓰던 엑셀 내역서(<b>.xlsx</b>)를 올리면 품명·규격·단위·수량을 읽어 자재 단가 DB와 자동으로 매칭하고, 일위대가·노무비·간접비·부가세까지 견적서를 자동 산출합니다.
          헤더(품명/규격/단위/수량)는 자동으로 찾고, 소계·합계 행은 건너뛰며, 수량 없는 제목 행은 공종명으로 사용합니다.
          한 번 확정한 매칭은 저장되어 다음 엑셀부터는 같은 표기가 자동으로 연결됩니다.
        </p>
      </div>

      <section className="bg-white border rounded-xl p-4 space-y-3">
        <FileDropZone accept=".xlsx,.pdf" label="엑셀·PDF 내역서/수량집계표(.xlsx, .pdf) 올리기" disabled={loading || submitting} onFile={(f) => handleFile(f)} />
        <label className="flex items-start gap-2 text-xs text-gray-600">
          <input type="checkbox" className="mt-0.5" checked={oneClick} onChange={(e) => setOneClick(e.target.checked)} />
          <span><b>확인 없이 한 번에 반영</b> — 자동으로 일치한 행은 그대로 쓰고, 일치하지 않는 행은 새 자재로 등록합니다(원본 단가, 없으면 0원). 견적서가 비어 있을 때만 바로 반영되며, 반영 후 견적서의 검토 알림에서 0원 단가를 확인하세요.</span>
        </label>
        {fileName && (
          <p className="text-xs text-gray-400">
            {fileName}
            {file && !showMapper && /\.xlsx$/i.test(file.name) && <button onClick={() => setShowMapper(true)} className="ml-3 underline text-gray-600">열 직접 지정해서 다시 읽기</button>}
          </p>
        )}
        {loading && <p className="text-sm text-gray-400">분석 중...</p>}
        {submitting && !rows && <p className="text-sm text-gray-400">반영 중...</p>}
        {autoNotice && <p className="text-sm text-[#1f6f54] font-semibold">{autoNotice}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {warnings.map((w) => (
          <p key={w} className="text-xs text-amber-600">{w}</p>
        ))}
      </section>

      <section className="bg-white border rounded-xl p-4 space-y-2">
        <h2 className="text-sm font-bold">표 붙여넣기</h2>
        <p className="text-xs text-gray-500">엑셀에서 <b>품명 · 규격 · 단위 · 수량</b>이 있는 셀 범위를 복사(Ctrl+C)해서 아래에 붙여넣으세요. 파일을 저장하지 않고 일부만 옮길 때 편합니다.</p>
        <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={5} placeholder={"분전함\t방수함 sus 400*500*150\t면\t1\n전력케이블\tFCV 0.6/1KV 4C x 6㎟\tM\t100"}
          className="w-full border rounded-lg px-3 py-2 text-xs font-mono" />
        <button type="button" onClick={handlePaste} disabled={loading || submitting || !pasteText.trim()} className="bg-black text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40">붙여넣은 내용 분석</button>
      </section>

      {showMapper && file && (
        <ColumnMapper projectId={projectId} file={file} busy={loading} onCancel={() => setShowMapper(false)} onApply={(m) => handleFile(file, m)} />
      )}

      {rows && rows.length === 0 && !error && !showMapper && (
        <p className="text-sm text-gray-400">가져올 수 있는 행을 찾지 못했습니다. 헤더에 &lsquo;품명&rsquo;과 &lsquo;수량&rsquo;이 있는지 확인해주세요.</p>
      )}

      {rows && rows.length > 0 && (
        <>
          <section className="bg-white border rounded-xl p-4 space-y-3">
            <h2 className="text-sm font-bold">가져올 시트</h2>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {sheets.map((s) => (
                <label key={s.name} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={!!sheetOn[s.name]} onChange={(e) => setSheetOn((p) => ({ ...p, [s.name]: e.target.checked }))} />
                  {s.name} <span className="text-gray-400">({s.rowCount}행)</span>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-gray-400">일위대가·원가계산서·집계표 같은 시트는 물량이 아니므로 기본으로 빠져 있습니다.</p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
              <div className="rounded-lg bg-[#e3efe8] p-2"><div className="text-gray-500">자동 매칭</div><div className="text-base font-bold text-[#1f6f54]">{stats.auto}</div></div>
              <div className="rounded-lg bg-amber-50 p-2"><div className="text-gray-500">유사(확인 필요)</div><div className="text-base font-bold text-amber-700">{stats.fuzzy}</div></div>
              <div className="rounded-lg bg-red-50 p-2"><div className="text-gray-500">매칭 없음</div><div className="text-base font-bold text-red-600">{stats.none}</div></div>
              <div className="rounded-lg bg-gray-50 p-2"><div className="text-gray-500">반영 예정</div><div className="text-base font-bold">{stats.selected}</div></div>
            </div>

            {stats.compared > 0 && (
              <div className="rounded-lg border p-3 text-xs space-y-0.5">
                <div className="font-semibold">재료비 비교 <span className="font-normal text-gray-400">(원본 단가가 있는 {stats.compared}개 행 기준)</span></div>
                <div className="flex justify-between"><span className="text-gray-500">원본 엑셀 단가</span><span>{won(stats.origTotal)}원</span></div>
                <div className="flex justify-between"><span className="text-gray-500">우리 물가정보 단가</span><span>{won(stats.ourTotal)}원</span></div>
                <div className="flex justify-between font-semibold">
                  <span>차이</span>
                  <span className={diff > 0 ? "text-red-600" : diff < 0 ? "text-[#1f6f54]" : ""}>
                    {diff > 0 ? "+" : ""}{diff.toFixed(1)}% ({won(stats.ourTotal - stats.origTotal)}원)
                  </span>
                </div>
              </div>
            )}
          </section>

          <section className="bg-white border rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-gray-500">
                노란/빨간 행은 확인이 필요합니다. 자재를 고르거나, DB에 없는 품목은 &ldquo;＋ 새 자재로 등록&rdquo;(원본 단가로 등록)을 선택하세요. 선택하지 않은 행은 반영되지 않습니다.
              </p>
              <label className="flex items-center gap-1.5 text-xs shrink-0">
                <input type="checkbox" checked={onlyAttention} onChange={(e) => setOnlyAttention(e.target.checked)} />
                확인 필요한 행만 보기
              </label>
            </div>

            {noMatchShown > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                <span>매칭 없는 행 {noMatchShown}개: &lsquo;전체&rsquo;를 선택하면 새 자재로 등록되어 반영됩니다(원본 단가, 없으면 0원). 직접 자재를 고를 수도 있습니다.</span>
                <button type="button" onClick={registerAllUnmatchedAsNew} className="underline font-semibold">매칭 없는 행 모두 새 자재로 등록</button>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-500">
                    <th className="p-2 text-left">
                      <label className="flex items-center gap-1 cursor-pointer whitespace-nowrap">
                        <input
                          type="checkbox" checked={allChecked} disabled={selectable.length === 0}
                          ref={(el) => { if (el) el.indeterminate = !allChecked && someChecked; }}
                          onChange={(e) => setAllInclude(e.target.checked)}
                        />
                        전체
                      </label>
                    </th>
                    <th className="p-2 text-left">원본 품명 / 규격</th>
                    <th className="p-2 text-left">단위</th>
                    <th className="p-2 text-right">수량</th>
                    <th className="p-2 text-right">원본단가</th>
                    <th className="p-2 text-left">상태</th>
                    <th className="p-2 text-left">자재</th>
                    <th className="p-2 text-left">공종</th>
                    <th className="p-2 text-center">매칭저장</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.slice(0, limit).map((r) => {
                    const um = unitMismatch(r);
                    const tone = !r.materialId ? "bg-red-50" : r.method === "fuzzy" || um ? "bg-amber-50" : "";
                    return (
                      <tr key={r.rid} className={`border-t ${tone}`}>
                        <td className="p-2">
                          <input type="checkbox" checked={r.include} onChange={(e) => updateRow(r.rid, { include: e.target.checked })} />
                        </td>
                        <td className="p-2">
                          <div className="font-medium">{r.name}</div>
                          {r.spec && <div className="text-gray-400">{r.spec}</div>}
                          <div className="text-[10px] text-gray-300">{r.sheet} · {r.rowNo}행</div>
                        </td>
                        <td className="p-2">{r.unit}</td>
                        <td className="p-2 text-right font-semibold">{r.qty.toLocaleString()}</td>
                        <td className="p-2 text-right text-gray-500">{r.origPrice != null ? won(r.origPrice) : "-"}</td>
                        <td className="p-2"><Badge method={r.method} score={r.score} /></td>
                        <td className="p-2">
                          <RowMaterialSelect
                            discipline={discipline} value={r.materialId} known={materials}
                            onChange={(id) => updateRow(r.rid, { materialId: id, include: id !== "" })}
                            onPick={(m) => setMaterials((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m as Material]))}
                            extra={<option value="new">＋ 새 자재로 등록{r.origPrice != null ? ` (${won(r.origPrice)}원)` : ""}</option>}
                          />
                          {um && <div className="text-[10px] text-amber-700 mt-0.5">⚠ 단위 다름: 원본 {r.unit} → 자재 {um.unit}</div>}
                        </td>
                        <td className="p-2">
                          <input
                            value={r.groupName}
                            onChange={(e) => updateRow(r.rid, { groupName: e.target.value })}
                            placeholder="예: 1.전열공사"
                            className="border rounded px-1.5 py-1 text-xs w-28"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <input type="checkbox" checked={r.saveMapping} onChange={(e) => updateRow(r.rid, { saveMapping: e.target.checked })} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {shown.length > limit && (
              <div className="text-center">
                <button onClick={() => setLimit((l) => l + 200)} className="text-xs underline text-gray-500">
                  더 보기 ({limit} / {shown.length})
                </button>
              </div>
            )}
            {shown.length === 0 && <p className="text-sm text-gray-400">표시할 행이 없습니다.</p>}

            {existingBomCount > 0 && (
              <label className="flex items-center gap-1.5 text-xs rounded-lg bg-amber-50 border border-amber-200 p-2">
                <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
                이 견적서에 이미 있는 물량 {existingBomCount}개를 모두 삭제하고 엑셀 내용으로 교체 (체크하지 않으면 기존 물량 뒤에 추가됩니다)
              </label>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={submit}
                disabled={submitting || stats.selected === 0}
                className="bg-[#1f6f54] text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {submitting ? "반영 중..." : `${stats.selected}개 항목을 견적서에 반영${replace ? " (교체)" : ""}`}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
