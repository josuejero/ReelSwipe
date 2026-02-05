export type DeckMovie = {
  id: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
  genres: string[];
  reasonCode?: string;
  score?: number;
};

export type DeckPayload = {
  deck_id: string | null;
  deck: DeckMovie[];
};

export type SwipeAction = "like" | "skip";

export type ProfilePayload = {
  session_id: string;
  likes: number;
  skips: number;
  total: number;
  top_genres: { genre_id: number; name: string; likes: number; skips: number; net: number }[];
  recent: {
    event_id: string;
    action: SwipeAction;
    ts_ms: number;
    movie_id: string;
    title: string;
    year: number | null;
    poster_url: string | null;
    genres: string[];
  }[];
};

const RAW_API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").trim();

function normalizeBase(input: string) {
  return input.replace(/\/+$/, "");
}

export function getApiBase() {
  const base = normalizeBase(RAW_API_BASE);

  if (!base) {
    throw new Error("Missing NEXT_PUBLIC_API_BASE (set it during build).");
  }

  if (typeof window !== "undefined" && window.location.protocol === "https:" && base.startsWith("http://")) {
    throw new Error(`NEXT_PUBLIC_API_BASE must be https in production (got ${base}).`);
  }

  return base;
}

const API_BASE = getApiBase();

async function mustJson(res: Response) {
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${t}`);
  }
  return res.json();
}

async function safeFetch<T>(url: URL, options?: RequestInit): Promise<T> {
  try {
    const res = await fetch(url.toString(), options);
    return (await mustJson(res)) as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Fetch failed: ${url.toString()} (${msg})`);
  }
}

export async function fetchDeck(sessionId: string, limit = 20): Promise<DeckPayload> {
  const url = new URL("/v1/deck", API_BASE);
  url.searchParams.set("session_id", sessionId);
  url.searchParams.set("limit", String(limit));

  return await safeFetch<DeckPayload>(url, { method: "GET" });
}

export async function fetchProfile(sessionId: string): Promise<ProfilePayload> {
  const url = new URL("/v1/profile", API_BASE);
  url.searchParams.set("session_id", sessionId);

  return await safeFetch<ProfilePayload>(url, { method: "GET" });
}

export async function logSwipe(args: {
  session_id: string;
  deck_id: string;
  movie_id: string;
  action: SwipeAction;
  ts_ms: number;
  dwell_ms?: number;
}) {
  const idempotency = `${args.session_id}:${args.deck_id}:${args.movie_id}:${args.action}:${args.ts_ms}`;

  const url = new URL("/v1/events/swipe", API_BASE);
  await safeFetch<void>(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-idempotency-key": idempotency,
    },
    body: JSON.stringify(args),
  });
}
