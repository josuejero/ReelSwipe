"use client";

import Link from "next/link";
import { ClientDeck } from "../components/ClientDeck";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <main className="min-h-screen bg-[#0b1220] text-white px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <header className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight">ReelSwipe</h1>
              <p className="mt-1 text-white/70">
                Phase 4: Two-stage ranking (candidates + rerank), recent-popularity signals, and
                session taste preferences.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/profile"
                className="rounded-2xl border border-white/30 px-4 py-2 text-sm hover:border-white/60"
              >
                Profile view
              </Link>
              <Link
                href="/metrics"
                className="rounded-2xl border border-white/30 px-4 py-2 text-sm hover:border-white/60"
              >
                Metrics
              </Link>
            </div>
          </div>
          <p className="text-sm text-white/60">
            A lightweight SQL candidate set combines recent popularity, genre cues, and trending
            boosts before a rerank keeps the deck personal and diverse.
          </p>
        </header>

        <div className="mt-10 rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
          <ClientDeck />
        </div>

        <footer className="mt-12 text-xs text-white/40">
          Phase 4 adds a two-stage reranker, recent-popularity smoothing, and evaluation telemetry
          so we can measure every deck.
        </footer>
      </div>
    </main>
  );
}
