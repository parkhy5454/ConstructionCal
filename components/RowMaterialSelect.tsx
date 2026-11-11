"use client";
import { useState, type ReactNode } from "react";
import MaterialPicker from "@/components/MaterialPicker";

type M = { id: number; name: string; spec: string; unit: string; price?: number };

// 가져오기 확인 화면의 행별 자재 선택: 제안된 자재는 목록에서, 그 밖의 자재는 검색(수만 건 중)으로 고릅니다.
export default function RowMaterialSelect({ discipline, value, known, onChange, onPick, extra, className }: {
  discipline: string; value: string; known: M[]; onChange: (id: string) => void; onPick: (m: M) => void; extra?: ReactNode; className?: string;
}) {
  const [search, setSearch] = useState(false);
  return (
    <div>
      <div className="flex items-center gap-1">
        <select value={value} onChange={(e) => onChange(e.target.value)} className={className ?? "border rounded px-1.5 py-1 text-xs w-48"}>
          <option value="">선택 안 함</option>
          {extra}
          {known.map((m) => (<option key={m.id} value={m.id}>{m.name} {m.spec} ({m.unit})</option>))}
        </select>
        <button type="button" title="다른 자재 검색" onClick={() => setSearch((v) => !v)} className="text-xs border rounded px-1.5 py-1 text-gray-500">🔍</button>
      </div>
      {search && (
        <div className="mt-1 w-64">
          <MaterialPicker discipline={discipline} value="" onChange={(id, m) => { if (m) { onPick(m); onChange(id); setSearch(false); } }} />
        </div>
      )}
    </div>
  );
}
