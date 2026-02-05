import { rmSync } from "node:fs";
import { spawn } from "node:child_process";

const API = "http://localhost:8787";
const PERSIST_DIR = ".wrangler-ci-state";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", ...opts });
    p.on("error", reject);
    p.on("exit", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
    });
  });
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
  // Ensure a clean local D1 + apply migrations before health checks.
  rmSync(PERSIST_DIR, { recursive: true, force: true });
  await run(
    "pnpm",
    [
      "--dir", "apps/api",
      "exec", "wrangler",
      "d1", "migrations", "apply", "DB",
      "--local",
      "--persist-to", PERSIST_DIR,
    ],
    // Prevent any interactive prompts during CI.
    { env: { ...process.env, CI: "1" } },
  );

  const child = spawn("pnpm", [
    "--dir", "apps/api",
    "exec", "wrangler",
    "dev",
    "--port", "8787",
    "--persist-to", PERSIST_DIR,
  ], {
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
