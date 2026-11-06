"use client";
import { DISCIPLINES, DISCIPLINE_LABELS } from "@/lib/calc";
import type { Discipline } from "@/lib/calc";

// 물가정보/표준품셈/설정 화면에서 공통으로 쓰는 업종 선택 탭.
export default function DisciplineTabs({ value, onChange }: { value: Discipline; onChange: (d: Discipline) => void }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {DISCIPLINES.map((d) => (
        <button
          key={d}
          onClick={() => onChange(d)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
            d === value ? "bg-[#1f6f54] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
        >
          {DISCIPLINE_LABELS[d]}
        </button>
      ))}
    </div>
  );
}

const KEY = "concal_discipline";

export function loadSavedDiscipline(): Discipline {
  if (typeof window === "undefined") return "electrical";
  try {
    const v = window.localStorage.getItem(KEY);
    return (DISCIPLINES as readonly string[]).includes(v ?? "") ? (v as Discipline) : "electrical";
  } catch {
    return "electrical";
  }
}

export function saveDiscipline(d: Discipline) {
  try {
    window.localStorage.setItem(KEY, d);
  } catch {
    /* ignore */
  }
}
