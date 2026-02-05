import fs from "node:fs";

function readWranglerJson(path) {
  if (!fs.existsSync(path)) {
    console.warn(`${path} not found, skipping`);
    return [];
  }
  const raw = fs.readFileSync(path, "utf8");
  const obj = JSON.parse(raw);
  if (Array.isArray(obj)) return obj;
  if (obj?.result?.[0]?.results) return obj.result[0].results;
  if (obj?.results) return obj.results;
  return [];
}

const swipes = readWranglerJson("data/swipe_events.json");
const imps = readWranglerJson("data/impressions.json");

const totalImps = imps.length;
const totalSwipes = swipes.length;

const likes = swipes.filter((s) => s.action === "like").length;
const skips = swipes.filter((s) => s.action === "skip").length;

const likeRate = totalSwipes ? likes / totalSwipes : 0;

const dwell = swipes.map((s) => Number(s.dwell_ms)).filter((n) => Number.isFinite(n) && n >= 0);

const meanDwell = dwell.length ? dwell.reduce((a, b) => a + b, 0) / dwell.length : 0;

const likedByMovie = new Map();
for (const s of swipes) {
  if (s.action !== "like") continue;
  likedByMovie.set(s.movie_id, (likedByMovie.get(s.movie_id) ?? 0) + 1);
}

const topLiked = Array.from(likedByMovie.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

console.log("impressions:", totalImps);
console.log("swipes:", totalSwipes);
console.log("likes:", likes);
console.log("skips:", skips);
console.log("like rate:", likeRate.toFixed(3));
console.log("mean dwell ms:", meanDwell.toFixed(0));
console.log("top liked:");
for (const [movieId, n] of topLiked) console.log(`  ${movieId}: ${n}`);
