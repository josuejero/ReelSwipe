export function withCors(resp: Response, origin = "*") {
  const headers = new Headers(resp.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "content-type, x-request-id, x-idempotency-key, authorization"
  );
  return new Response(resp.body, { status: resp.status, headers });
}

export function json(payload: unknown, status = 200, extra?: HeadersInit) {
  const headers = new Headers(extra);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(payload), { status, headers });
}

export function requestId() {
  return crypto.randomUUID();
}
