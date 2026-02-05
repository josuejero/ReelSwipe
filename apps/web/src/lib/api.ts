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

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8787";

async function mustJson(res: Response) {
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${t}`);
  }
  return res.json();
}

export async function fetchDeck(sessionId: string, limit = 20): Promise<DeckPayload> {
  const url = new URL(API_BASE + "/v1/deck");
  url.searchParams.set("session_id", sessionId);
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url.toString(), { method: "GET" });
  return (await mustJson(res)) as DeckPayload;
}

export async function fetchProfile(sessionId: string): Promise<ProfilePayload> {
  const url = new URL(API_BASE + "/v1/profile");
  url.searchParams.set("session_id", sessionId);

  const res = await fetch(url.toString(), { method: "GET" });
  return (await mustJson(res)) as ProfilePayload;
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

  const res = await fetch(API_BASE + "/v1/events/swipe", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-idempotency-key": idempotency,
    },
    body: JSON.stringify(args),
  });

  await mustJson(res);
}
