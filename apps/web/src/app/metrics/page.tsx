export const runtime = "edge";

type MetricsPayload = {
  window_ms: number;
  since_ms: number;
  swipes: number;
  likes: number;
  skips: number;
  impressions: number;
  like_rate: number | null;
  skip_rate: number | null;
  p50_deck_ms: number | null;
};

function pct(x: number | null) {
  if (x === null) return "—";
  return `${Math.round(x * 100)}%`;
}

function fmtMs(x: number | null) {
  if (x === null) return "—";
  return `${x} ms`;
}

export default async function MetricsPage() {
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8787";
  const token = process.env.API_ADMIN_TOKEN;

  if (!token) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>/metrics</h1>
        <p>
          Missing <code>API_ADMIN_TOKEN</code>. Add it to <code>apps/web/.env.local</code> (local)
          and Cloudflare Pages env vars (deploy).
        </p>
      </main>
    );
  }

  const res = await fetch(`${API_BASE}/v1/metrics?window=24h`, {
    headers: { "x-admin-token": token },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    const details = res.headers.get("x-request-id");

    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>/metrics</h1>
        <p>API returned {res.status}</p>
        {details && (
          <p>
            Request id: <code>{details}</code>
          </p>
        )}
        <pre style={{ whiteSpace: "pre-wrap" }}>{body}</pre>
      </main>
    );
  }

  const data = (await res.json()) as MetricsPayload;
  const since = new Date(data.since_ms).toLocaleString();

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900 }}>
      <h1 style={{ marginBottom: 8 }}>ReelSwipe Metrics (last 24h)</h1>
      <p style={{ marginTop: 0, opacity: 0.7 }}>Window start: {since}</p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
          marginTop: 16,
        }}
      >
        <Card label="Swipes" value={String(data.swipes)} />
        <Card label="Impressions" value={String(data.impressions)} />
        <Card label="Like rate" value={pct(data.like_rate)} />
        <Card label="Skip rate" value={pct(data.skip_rate)} />
        <Card label="Median deck latency" value={fmtMs(data.p50_deck_ms)} />
      </div>

      <details style={{ marginTop: 20 }}>
        <summary>Raw JSON</summary>
        <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(data, null, 2)}</pre>
      </details>
    </main>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,0.12)",
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>{value}</div>
    </div>
  );
}
