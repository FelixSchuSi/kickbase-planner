import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../kickbase-worker.js";

const origin = "https://felixschusi.github.io";
const env = {
  ALLOWED_ORIGINS: `${origin},http://localhost:8000,http://127.0.0.1:8000`,
};
const proxyUrl = "https://kickbase-worker.example/v4";

test("preflights allow login and authenticated requests without calling upstream", async (t) => {
  const upstream = t.mock.method(globalThis, "fetch", () => {
    throw new Error("Preflight must not reach upstream");
  });
  for (const allowedOrigin of env.ALLOWED_ORIGINS.split(",")) {
    const response = await worker.fetch(new Request(`${proxyUrl}/user/login`, {
      method: "OPTIONS",
      headers: {
        Origin: allowedOrigin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    }), env);
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), allowedOrigin);
    assert.match(response.headers.get("Access-Control-Allow-Methods"), /POST/);
    assert.match(response.headers.get("Access-Control-Allow-Headers"), /Authorization/);
    assert.match(response.headers.get("Access-Control-Allow-Headers"), /Content-Type/);
  }
  assert.equal(upstream.mock.callCount(), 0);
});

test("login forwards JSON and returns the token with CORS and no caching", async (t) => {
  const body = JSON.stringify({ em: "test@example.com", pass: "test-password" });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url.href, "https://api.kickbase.com/v4/user/login");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.get("Content-Type"), "application/json");
    assert.equal(options.headers.get("Origin"), null);
    assert.equal(options.headers.get("Cookie"), null);
    assert.equal(await new Response(options.body).text(), body);
    assert.equal(options.redirect, "error");
    assert.equal(options.cache, "no-store");
    return Response.json({ tkn: "test-token" }, {
      headers: { "Cache-Control": "public, max-age=3600", "Set-Cookie": "secret=value" },
    });
  });
  const response = await worker.fetch(new Request(`${proxyUrl}/user/login`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", Cookie: "private=value" },
    body,
  }), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { tkn: "test-token" });
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Set-Cookie"), null);
});

test("authenticated searches preserve query strings and API errors", async (t) => {
  const path = "/competitions/1/players/search?leagueId=123&query=M%C3%BCller&max=5";
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url.href, `https://api.kickbase.com/v4${path}`);
    assert.equal(options.method, "GET");
    assert.equal(options.headers.get("Authorization"), "Bearer test-token");
    assert.equal(options.body, undefined);
    return Response.json({ error: "rate limited" }, {
      status: 429,
      headers: { "Retry-After": "30", "Access-Control-Allow-Origin": "https://other.example" },
    });
  });
  const response = await worker.fetch(new Request(`${proxyUrl}${path}`, {
    headers: { Origin: origin, Authorization: "Bearer test-token" },
  }), env);
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { error: "rate limited" });
  assert.equal(response.headers.get("Retry-After"), "30");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
  assert.equal(response.headers.get("Access-Control-Expose-Headers"), "Retry-After");
});

test("rejects other origins, non-API paths, and unsupported methods before fetching", async (t) => {
  const upstream = t.mock.method(globalThis, "fetch", () => {
    throw new Error("Rejected requests must not reach upstream");
  });
  for (const [url, method, requestOrigin, status] of [
    [`${proxyUrl}/user/login`, "POST", "https://other.example", 403],
    ["https://kickbase-worker.example/", "GET", origin, 404],
    ["https://kickbase-worker.example//other.example/v4/user/login", "GET", origin, 404],
    [`${proxyUrl}/../user/login`, "GET", origin, 404],
    [`${proxyUrl}/user/login`, "TRACE", origin, 405],
  ]) {
    // A request-like object also covers methods that Node's Request disallows.
    const response = await worker.fetch({ url, method, headers: new Headers({ Origin: requestOrigin }) }, env);
    assert.equal(response.status, status);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), status === 403 ? null : origin);
  }
  assert.equal(upstream.mock.callCount(), 0);
});

test("network failures return a readable CORS-enabled 502", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Network failure");
  });
  const response = await worker.fetch(new Request(`${proxyUrl}/leagues/`, {
    headers: { Origin: origin },
  }), env);
  assert.equal(response.status, 502);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
  assert.deepEqual(await response.json(), { error: "Unable to reach Kickbase API" });
});
