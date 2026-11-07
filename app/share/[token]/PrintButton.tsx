"use client";
export default function PrintButton() {
  return (
    <button onClick={() => window.print()} className="bg-black text-white rounded-lg px-3 py-1.5 font-semibold">
      🖨 인쇄 / PDF로 저장
    </button>
  );
}
