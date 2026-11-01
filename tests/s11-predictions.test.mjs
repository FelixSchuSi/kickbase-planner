import assert from "node:assert/strict";
import { test } from "node:test";

// These tests inspect Lit templates without mounting them in a browser.
globalThis.window = { location: { hostname: "localhost" } };
globalThis.document = { createTreeWalker: () => ({}) };

const {
  fetchKickbasePredictions,
  getKickbasePredictionUrl,
  getPlayerPills,
} = await import("../src/s11-predictions.js");

const apiBaseUrl = "https://kickbase-worker.example/v4";
const player = { tid: "2", n: "Test Player", prob: 2 };

function templateText(template) {
  if (!template?.strings) return String(template ?? "");
  return template.strings.reduce(
    (text, part, index) => text + part + templateText(template.values[index]),
    "",
  );
}

function kickbasePillText() {
  return templateText(getPlayerPills(player).values[0]);
}

test("Kickbase pills do not animate before a request starts", () => {
  assert.doesNotMatch(kickbasePillText(), /class="prob-pill loading"/);
});

test("new prediction arrays produce links and finish loading", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, `${apiBaseUrl}/base/predictions/teams/1`);
    assert.equal(options.headers.Authorization, "Bearer test-token");
    assert.match(kickbasePillText(), /class="prob-pill loading"/);
    return Response.json({
      tms: [{ tid: "2", plpims: [null, "content/lineup.png", "content/later.png"] }],
    });
  });

  await fetchKickbasePredictions("test-token", apiBaseUrl);

  const imageUrl = "https://kickbase.b-cdn.net/content/lineup.png";
  assert.equal(getKickbasePredictionUrl("2"), imageUrl);
  assert.equal(getKickbasePredictionUrl(2), imageUrl);
  assert.match(kickbasePillText(), /<a href=https:\/\/kickbase\.b-cdn\.net\/content\/lineup\.png/);
  assert.doesNotMatch(kickbasePillText(), /class="prob-pill loading"/);
});

test("null images clear stale links while keeping player probabilities visible", async (t) => {
  let data = { tms: [{ tid: "2", plpims: ["content/previous.png"] }] };
  t.mock.method(globalThis, "fetch", async () => Response.json(data));
  await fetchKickbasePredictions("test-token", apiBaseUrl);
  assert.ok(getKickbasePredictionUrl("2"));

  data = {
    tms: [
      { tid: "2", tn: "Bayern", plpims: [null], mi: "12127", mis: ["12127"] },
      { tid: "3", plpims: [] },
      { tid: "43" },
    ],
  };
  await fetchKickbasePredictions("test-token", apiBaseUrl);

  for (const teamId of ["2", "3", "43", "unknown"]) {
    assert.equal(getKickbasePredictionUrl(teamId), null);
  }
  const pill = kickbasePillText();
  assert.doesNotMatch(pill, /<a\b|class="prob-pill loading"/);
  assert.match(pill, /Kickbase lineup image unavailable/);
  assert.match(pill, /KB ✔/);
  assert.match(pill, /rgb\(0, 156, 81\)/);
});

test("legacy prediction images are still supported", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({
    tms: [{ tid: "2", plpim: "content/legacy.png" }],
  }));
  await fetchKickbasePredictions("test-token", apiBaseUrl);
  assert.equal(getKickbasePredictionUrl("2"), "https://kickbase.b-cdn.net/content/legacy.png");
});

test("failed requests also finish loading", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const response of [
    () => new Response(null, { status: 503 }),
    () => { throw new Error("Network unavailable"); },
  ]) {
    t.mock.method(globalThis, "fetch", response);
    await fetchKickbasePredictions("test-token", apiBaseUrl);
    assert.doesNotMatch(kickbasePillText(), /class="prob-pill loading"/);
  }
});
