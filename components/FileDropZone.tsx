"use client";
import { useRef, useState } from "react";

// 파일 선택 + 드래그앤드롭 업로드 영역. accept는 확장자 목록(예: ".xlsx" 또는 ".dxf,.dwg,.pdf").
export default function FileDropZone({ accept, onFile, label, disabled }: { accept: string; onFile: (file: File) => void; label: string; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const exts = accept.split(",").map((s) => s.trim().toLowerCase());

  function pick(file: File | undefined) {
    if (!file || disabled) return;
    if (!exts.some((x) => file.name.toLowerCase().endsWith(x))) {
      setMsg(`${exts.join(", ")} 파일만 올릴 수 있습니다.`);
      return;
    }
    setMsg(null);
    onFile(file);
  }

  return (
    <div>
      <div
        role="button" tabIndex={0}
        onClick={() => ref.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ref.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files?.[0]); }}
        className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-8 text-center text-sm transition-colors ${over ? "border-[#1f6f54] bg-[#e3efe8]" : "border-gray-300 bg-gray-50 hover:bg-gray-100"}`}
      >
        <div className="font-semibold text-gray-700">{label}</div>
        <div className="text-xs text-gray-400 mt-1">파일을 여기에 끌어다 놓거나 클릭해서 선택하세요 ({exts.join(", ")})</div>
      </div>
      <input
        ref={ref} type="file" accept={accept} className="hidden"
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }}
      />
      {msg && <p className="text-xs text-red-600 mt-1">{msg}</p>}
    </div>
  );
}
