import { spawn } from "node:child_process";

const API = "http://localhost:8787";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function main() {
  const child = spawn("pnpm", ["--dir", "apps/api", "exec", "wrangler", "dev", "--port", "8787"], {
    stdio: "inherit",
    env: { ...process.env },
  });

  try {
    await waitFor(`${API}/health`);
    const res = await fetch(`${API}/health`);
    if (!res.ok) throw new Error("/health failed");

    console.log("API smoke OK");
  } finally {
    child.kill("SIGTERM");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
