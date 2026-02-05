"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchProfile, type ProfilePayload } from "../../lib/api";

function fmt(ts: number) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

export default function ProfilePage() {
  const [sessionId, setSessionId] = useState<string>("DEMO_SESSION_ID");
  const [data, setData] = useState<ProfilePayload | null>(null);
  const [err, setErr] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const topGenres = useMemo(() => data?.top_genres ?? [], [data]);
  const recent = useMemo(() => data?.recent ?? [], [data]);

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const res = await fetchProfile(sessionId);
      setData(res);
    } catch (e) {
      setErr(String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Session Profile</h1>
        <p className="text-sm opacity-80">Quick debug view for Phase 3.</p>
      </header>

      <section className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-sm mb-1">session_id</label>
          <input
            className="w-full rounded border px-3 py-2"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
          />
        </div>
        <button className="rounded border px-4 py-2" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </section>

      {err ? <div className="rounded border p-3 text-sm">Error: {err}</div> : null}

      {data ? (
        <>
          <section className="grid grid-cols-3 gap-3">
            <div className="rounded border p-3">
              <div className="text-xs opacity-70">Likes</div>
              <div className="text-xl font-semibold">{data.likes}</div>
            </div>
            <div className="rounded border p-3">
              <div className="text-xs opacity-70">Skips</div>
              <div className="text-xl font-semibold">{data.skips}</div>
            </div>
            <div className="rounded border p-3">
              <div className="text-xs opacity-70">Total</div>
              <div className="text-xl font-semibold">{data.total}</div>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Top genres</h2>
            <div className="rounded border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-black/5">
                  <tr>
                    <th className="text-left p-2">Genre</th>
                    <th className="text-right p-2">Likes</th>
                    <th className="text-right p-2">Skips</th>
                    <th className="text-right p-2">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {topGenres.map((g) => (
                    <tr key={g.genre_id} className="border-t">
                      <td className="p-2">{g.name}</td>
                      <td className="p-2 text-right">{g.likes}</td>
                      <td className="p-2 text-right">{g.skips}</td>
                      <td className="p-2 text-right">{g.net}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Recent swipes</h2>
            <div className="space-y-2">
              {recent.map((r) => (
                <div key={r.event_id} className="rounded border p-3">
                  <div className="flex justify-between text-sm">
                    <div className="font-medium">
                      {r.title} {r.year ? `(${r.year})` : ""}
                    </div>
                    <div className="opacity-80">{r.action}</div>
                  </div>
                  <div className="text-xs opacity-70 mt-1">{fmt(r.ts_ms)}</div>
                  <div className="text-xs mt-2">
                    Genres: {(r.genres ?? []).join(", ") || "(none)"}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
