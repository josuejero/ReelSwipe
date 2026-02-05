"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DeckMovie, SwipeAction } from "../lib/api";
import { fetchDeck, logSwipe } from "../lib/api";
import { SwipeDeck } from "./SwipeDeck";

function getStoredSessionId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("reelswipe.session_id");
}

function setStoredSessionId(id: string) {
  window.localStorage.setItem("reelswipe.session_id", id);
}

export function ClientDeck() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [deckId, setDeckId] = useState<string | null>(null);
  const [deck, setDeck] = useState<DeckMovie[]>([]);

  const canReset = useMemo(() => !!sessionId, [sessionId]);

  const loadDeck = useCallback(
    async (sid: string, silent = false) => {
      if (!silent) {
        setStatus("loading");
        setError(null);
      }
      try {
        const { deck_id, deck } = await fetchDeck(sid, 20);
        setDeckId(deck_id);
        setDeck(deck);
        setStatus("ready");
      } catch (e) {
        setStatus("error");
        setError(e instanceof Error ? e.message : "unknown error");
      }
    },
    []
  );

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setStatus("loading");
      setError(null);

      let sid = getStoredSessionId();
      if (!sid) {
        sid = crypto.randomUUID();
        setStoredSessionId(sid);
      }

      if (cancelled) return;
      setSessionId(sid);

      await loadDeck(sid);
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, [loadDeck]);

  const onReload = async () => {
    if (!sessionId) return;
    await loadDeck(sessionId);
  };

  const onReset = async () => {
    const sid = crypto.randomUUID();
    setStoredSessionId(sid);
    setSessionId(sid);
    await loadDeck(sid);
  };

  return (
    <div className="flex flex-col items-center">
      <div className="mb-4 flex gap-3">
        <button
          type="button"
          onClick={onReload}
          className="rounded-2xl bg-white/5 px-4 py-2 text-sm ring-1 ring-white/10 hover:bg-white/10"
        >
          Reload
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={!canReset}
          className="rounded-2xl bg-white/5 px-4 py-2 text-sm ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-40"
        >
          Reset taste
        </button>
      </div>

      {status === "loading" ? (
        <div className="h-[560px] w-[360px] animate-pulse rounded-3xl bg-white/5" />
      ) : status === "error" ? (
        <div className="w-[360px] rounded-3xl bg-red-500/10 p-4 ring-1 ring-red-500/20">
          <p className="text-sm text-red-200">{error ?? "Failed"}</p>
          <p className="mt-2 text-xs text-white/60">Check that the API is running and NEXT_PUBLIC_API_BASE is set.</p>
        </div>
      ) : deckId ? (
        <SwipeDeck
          deck={deck}
          onEmpty={() => {}}
          onSwipe={async (movie, action: SwipeAction, dwellMs) => {
            if (!sessionId || !deckId) return;

            try {
              await logSwipe({
                session_id: sessionId,
                deck_id: deckId,
                movie_id: movie.id,
                action,
                ts_ms: Date.now(),
                dwell_ms: dwellMs,
              });
            } catch (e) {
              console.warn("failed to log swipe", e);
            }
          }}
        />
      ) : (
        <SwipeDeck deck={deck} />
      )}

      {sessionId ? <p className="mt-4 text-xs text-white/40">Session: {sessionId}</p> : null}
      {deckId ? <p className="mt-1 text-xs text-white/30">Deck: {deckId.slice(0, 10)}…</p> : null}
    </div>
  );
}
