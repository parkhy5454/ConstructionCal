"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DISCIPLINES, DISCIPLINE_LABELS } from "@/lib/calc";
import type { Discipline } from "@/lib/calc";

type Project = {
  id: number; name: string; discipline: Discipline; updatedAt: string;
  final: number | null; status: string; clientName: string | null;
};
const STATUS_LABEL: Record<string, string> = { draft: "작성 중", submitted: "제출", won: "수주", lost: "실주" };
const STATUS_COLOR: Record<string, string> = { draft: "bg-gray-100 text-gray-500", submitted: "bg-blue-50 text-blue-700", won: "bg-green-50 text-green-700", lost: "bg-red-50 text-red-600" };

export default function EstimateListPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [allowed, setAllowed] = useState<Discipline[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [discipline, setDiscipline] = useState<Discipline>("electrical");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Discipline | "all">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/projects");
    const data = await res.json();
    setProjects(data.projects ?? []);
    setAllowed(data.allowedDisciplines ?? null);
    if (data.allowedDisciplines && data.allowedDisciplines.length > 0) setDiscipline((cur) => (data.allowedDisciplines.includes(cur) ? cur : data.allowedDisciplines[0]));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), discipline }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) { setError(data.error ?? "생성 실패"); return; }
    router.push(`/app/estimate/${data.project.id}`);
  }

  async function duplicate(p: Project) {
    setBusyId(p.id);
    setError(null);
    const res = await fetch(`/api/projects/${p.id}/duplicate`, { method: "POST" });
    const data = await res.json();
    setBusyId(null);
    if (!res.ok) { setError(data.error ?? "복제 실패"); return; }
    router.push(`/app/estimate/${data.project.id}`);
  }

  async function saveName(p: Project) {
    const next = editName.trim();
    if (!next || next === p.name) { setEditingId(null); return; }
    setBusyId(p.id);
    setError(null);
    const res = await fetch(`/api/projects/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: next }),
    });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) { setError(data.error ?? "이름 변경 실패"); return; }
    setEditingId(null);
    load();
  }

  // 최근 수정한 견적서가 위로 오도록 정렬하고, 이름 검색 + 업종 필터를 적용합니다.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects
      .filter((p) => (filter === "all" || p.discipline === filter) && (statusFilter === "all" || p.status === statusFilter) && (!q || `${p.name} ${p.clientName ?? ""}`.toLowerCase().includes(q)))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [projects, query, filter, statusFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: projects.length };
    for (const p of projects) c[p.discipline] = (c[p.discipline] ?? 0) + 1;
    return c;
  }, [projects]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">📄 견적서</h1>
        <Link href="/app/clients" className="text-xs text-gray-500 underline">🏢 거래처 관리</Link>
      </div>

      <form onSubmit={createProject} className="bg-white border rounded-xl p-3 space-y-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {DISCIPLINES.filter((d) => !allowed || allowed.includes(d)).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDiscipline(d)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                d === discipline ? "bg-[#1f6f54] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {DISCIPLINE_LABELS[d]}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder="새 견적서 이름 (예: OO빌딩 전기공사)"
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
          />
          <button disabled={creating} className="bg-black text-white rounded-lg px-4 py-2 text-sm font-semibold shrink-0">
            만들기
          </button>
        </div>
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {projects.length > 0 && (
        <div className="space-y-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="견적서 이름·거래처 검색"
            className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
          />
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {["all", "draft", "submitted", "won", "lost"].map((s) => (
              <button key={s} type="button" onClick={() => setStatusFilter(s)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${s === statusFilter ? "bg-[#1f6f54] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                {s === "all" ? "모든 상태" : STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {(["all", ...DISCIPLINES] as const).filter((d) => d === "all" || counts[d]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setFilter(d)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  d === filter ? "bg-black text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {d === "all" ? "전체" : DISCIPLINE_LABELS[d]} <span className="opacity-60">{counts[d] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">불러오는 중...</p>
      ) : projects.length === 0 ? (
        <p className="text-sm text-gray-400">아직 견적서가 없습니다. 위에서 새로 만들어보세요.</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-gray-400">조건에 맞는 견적서가 없습니다.</p>
      ) : (
        <div className="divide-y border rounded-xl bg-white">
          {shown.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-gray-50">
              {editingId === p.id ? (
                <form onSubmit={(e) => { e.preventDefault(); saveName(p); }} className="flex flex-1 gap-2">
                  <input
                    autoFocus value={editName} maxLength={120} onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 border rounded-lg px-2 py-1 text-sm"
                  />
                  <button disabled={busyId === p.id} className="text-xs font-semibold text-[#1f6f54]">저장</button>
                  <button type="button" onClick={() => setEditingId(null)} className="text-xs text-gray-400">취소</button>
                </form>
              ) : (
                <>
                  <Link href={`/app/estimate/${p.id}`} className="flex-1 min-w-0">
                    <span className="text-sm font-semibold break-words">{p.name}</span>{" "}
                    <span className="ml-1 text-[10px] font-medium text-[#1f6f54] bg-[#e3efe8] rounded-full px-2 py-0.5 whitespace-nowrap">
                      {DISCIPLINE_LABELS[p.discipline] ?? p.discipline}
                    </span>
                    <span className={`ml-1 text-[10px] font-medium rounded-full px-2 py-0.5 whitespace-nowrap ${STATUS_COLOR[p.status] ?? STATUS_COLOR.draft}`}>{STATUS_LABEL[p.status] ?? p.status}</span>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {new Date(p.updatedAt).toLocaleDateString("ko-KR")}
                      {p.clientName && ` · ${p.clientName}`}
                      {p.final != null && p.final > 0 && <span className="text-gray-600 font-semibold"> · {Math.round(p.final).toLocaleString("ko-KR")}원</span>}
                    </div>
                  </Link>
                  <div className="flex items-center gap-3 shrink-0 text-xs">
                    <button onClick={() => { setEditingId(p.id); setEditName(p.name); }} className="text-gray-500 underline">이름변경</button>
                    <button disabled={busyId === p.id} onClick={() => duplicate(p)} className="text-gray-500 underline disabled:opacity-50">
                      {busyId === p.id ? "복제 중..." : "복제"}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
