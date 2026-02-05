"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { DeckMovie } from "../lib/api";
import { MovieCard } from "./MovieCard";

type SwipeAction = "like" | "skip";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function SwipeDeck({
  deck,
  onEmpty,
  onSwipe,
}: {
  deck: DeckMovie[];
  onEmpty?: () => void;
  onSwipe?: (movie: DeckMovie, action: SwipeAction, dwellMs: number) => void;
}) {
  const [idx, setIdx] = useState(0);
  const top = deck[idx] ?? null;
  const next = deck[idx + 1] ?? null;

  const cardRef = useRef<HTMLDivElement | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const shownAtRef = useRef<number>(Date.now());

  useEffect(() => {
    if (top) shownAtRef.current = Date.now();
    else onEmpty?.();
  }, [top, onEmpty]);

  const animateOut = useCallback(
    (action: SwipeAction) => {
      if (!top) return;
      const el = cardRef.current;
      if (!el) return;

      const dx = action === "like" ? 420 : -420;
      el.style.transition = "transform 220ms ease";
      el.style.transform = `translate3d(${dx}px, -20px, 0) rotate(${action === "like" ? 12 : -12}deg)`;

      const dwellMs = Math.max(0, Date.now() - shownAtRef.current);
      window.setTimeout(() => {
        onSwipe?.(top, action, dwellMs);
        setIdx((n) => n + 1);
        if (el) {
          el.style.transition = "none";
          el.style.transform = "translate3d(0,0,0) rotate(0deg)";
        }
      }, 230);
    },
    [top, onSwipe],
  );

  const snapBack = () => {
    const el = cardRef.current;
    if (!el) return;
    el.style.transition = "transform 180ms ease";
    el.style.transform = "translate3d(0,0,0) rotate(0deg)";
    window.setTimeout(() => {
      if (el) el.style.transition = "none";
    }, 200);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!top) return;
    startRef.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!top) return;
    const start = startRef.current;
    if (!start) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;

    const el = cardRef.current;
    if (!el) return;

    const rot = clamp(dx / 22, -18, 18);
    el.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(${rot}deg)`;
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!top) return;
    const start = startRef.current;
    startRef.current = null;
    if (!start) return;

    const dx = e.clientX - start.x;
    if (dx > 120) return animateOut("like");
    if (dx < -120) return animateOut("skip");
    snapBack();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!top) return;
    if (e.key === "ArrowLeft") animateOut("skip");
    if (e.key === "ArrowRight") animateOut("like");
  };

  const skipLabel = useMemo(() => (top ? `Skip ${top.title}` : "Skip"), [top]);
  const likeLabel = useMemo(() => (top ? `Like ${top.title}` : "Like"), [top]);

  return (
    <div className="w-[360px] select-none">
      <div
        className="relative h-[560px] w-[360px]"
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label="Swipe deck"
      >
        {next ? (
          <div className="absolute inset-0 translate-y-2 scale-[0.98] opacity-60">
            <MovieCard movie={next} />
          </div>
        ) : null}

        {top ? (
          <div
            ref={cardRef}
            className="absolute inset-0 touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            role="group"
            aria-roledescription="swipe card"
          >
            <MovieCard movie={top} />
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={() => top && animateOut("skip")}
          className="flex-1 rounded-2xl bg-white/5 px-4 py-3 text-sm text-white ring-1 ring-white/10 hover:bg-white/10"
          aria-label={skipLabel}
        >
          ← Skip
        </button>
        <button
          type="button"
          onClick={() => top && animateOut("like")}
          className="flex-1 rounded-2xl bg-emerald-500/20 px-4 py-3 text-sm text-white ring-1 ring-emerald-400/30 hover:bg-emerald-500/30"
          aria-label={likeLabel}
        >
          Like →
        </button>
      </div>

      <p className="mt-3 text-center text-xs text-white/50">
        Tip: focus the deck and use ArrowLeft / ArrowRight
      </p>
    </div>
  );
}
