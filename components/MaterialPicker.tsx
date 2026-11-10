"use client";
import { useMemo, useState, type RefObject } from "react";

type M = { id: number; name: string; spec: string; unit: string; price?: number };

// 자재 검색 선택: 이름·규격 일부(공백으로 여러 단어)를 입력하면 후보가 좁혀지고, ↑↓ + Enter로 고릅니다.
export default function MaterialPicker({ materials, value, onChange, onPicked, inputRef }: {
  materials: M[]; value: string; onChange: (id: string) => void; onPicked?: () => void; inputRef?: RefObject<HTMLInputElement>;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const selected = materials.find((m) => String(m.id) === value);

  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return materials.slice(0, 8);
    return materials.filter((m) => {
      const hay = `${m.name} ${m.spec}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    }).slice(0, 8);
  }, [q, materials]);

  function pick(m: M) {
    onChange(String(m.id));
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
        onChange={(e) => { setQ(e.target.value); setOpen(true); setIdx(0); if (value) onChange(""); }}
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
          {list.length === 0 && <li className="px-2 py-2 text-gray-400">검색 결과가 없습니다.</li>}
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
