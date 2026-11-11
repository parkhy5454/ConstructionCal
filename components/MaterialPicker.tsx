"use client";
import { useEffect, useRef, useState, type RefObject } from "react";

type M = { id: number; name: string; spec: string; unit: string; price?: number };

// 자재 검색 선택: 이름·규격·분류 일부(공백으로 여러 단어)를 입력하면 서버에서 검색해 후보 8개를 보여 주고, ↑↓ + Enter로 고릅니다.
// 자재가 수만 개여도 느려지지 않도록 목록을 통째로 받지 않고 입력할 때마다(0.2초 뒤) 서버에 물어봅니다.
export default function MaterialPicker({ discipline, value, onChange, onPicked, inputRef, initial }: {
  discipline: string; value: string; onChange: (id: string, m?: M) => void; onPicked?: () => void; inputRef?: RefObject<HTMLInputElement>; initial?: M | null;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [list, setList] = useState<M[]>([]);
  const [selected, setSelected] = useState<M | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => { if (!value) setSelected(null); }, [value]);

  useEffect(() => {
    if (!open) return;
    const my = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch(`/api/materials?discipline=${encodeURIComponent(discipline)}&limit=8&q=${encodeURIComponent(q)}`);
        const d = await res.json();
        if (my === seq.current) { setList(d.materials ?? []); setIdx(0); }
      } catch { /* 네트워크 오류는 목록만 비워 둡니다 */ }
      if (my === seq.current) setBusy(false);
    }, q ? 200 : 0);
    return () => clearTimeout(t);
  }, [q, open, discipline]);

  function pick(m: M) {
    setSelected(m);
    onChange(String(m.id), m);
    setQ("");
    setOpen(false);
    onPicked?.();
  }

  return (
    <div className="relative flex-1 min-w-[180px]">
      <input
        ref={inputRef}
        value={open ? q : selected ? `${selected.name} (${selected.spec || selected.unit})` : q}
        onFocus={() => { setOpen(true); setIdx(0); }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setIdx(0); if (value) { setSelected(null); onChange(""); } }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setIdx((i) => Math.min(i + 1, list.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter" && open && list[idx]) { e.preventDefault(); pick(list[idx]); }
          else if (e.key === "Escape") setOpen(false);
        }}
        placeholder="자재 검색 (예: 전선관 16)"
        className="w-full border rounded-lg px-2 py-1.5 text-xs"
        autoComplete="off"
      />
      {open && (
        <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-lg border bg-white shadow-lg text-xs">
          {busy && list.length === 0 && <li className="px-2 py-2 text-gray-400">검색 중...</li>}
          {!busy && list.length === 0 && <li className="px-2 py-2 text-gray-400">검색 결과가 없습니다.</li>}
          {list.map((m, i) => (
            <li
              key={m.id}
              onMouseDown={(e) => { e.preventDefault(); pick(m); }}
              onMouseEnter={() => setIdx(i)}
              className={`px-2 py-1.5 cursor-pointer ${i === idx ? "bg-[#e3efe8]" : ""}`}
            >
              <span className="font-medium">{m.name}</span> <span className="text-gray-400">{m.spec} · {m.unit}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
