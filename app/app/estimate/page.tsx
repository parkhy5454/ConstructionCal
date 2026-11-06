"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Project = { id: number; name: string; updatedAt: string };

export default function EstimateListPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/projects");
    const data = await res.json();
    setProjects(data.projects ?? []);
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
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) { setError(data.error ?? "생성 실패"); return; }
    setName("");
    load();
  }

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-bold">📄 견적서</h1>

      <form onSubmit={createProject} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="새 견적서 이름 (예: OO빌딩 전기공사)"
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
        />
        <button disabled={creating} className="bg-black text-white rounded-lg px-4 py-2 text-sm font-semibold shrink-0">
          만들기
        </button>
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-400">불러오는 중...</p>
      ) : projects.length === 0 ? (
        <p className="text-sm text-gray-400">아직 견적서가 없습니다. 위에서 새로 만들어보세요.</p>
      ) : (
        <div className="divide-y border rounded-xl bg-white">
          {projects.map((p) => (
            <Link key={p.id} href={`/app/estimate/${p.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
              <span className="text-sm font-semibold">{p.name}</span>
              <span className="text-xs text-gray-400">{new Date(p.updatedAt).toLocaleDateString("ko-KR")}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
