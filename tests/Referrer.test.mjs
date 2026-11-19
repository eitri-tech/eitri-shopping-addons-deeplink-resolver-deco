// node --test tests/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { nextUtmParams, normalizeReferrer, isExternalOrigin } from "../src/services/UtmService.js";

const google = "https://www.google.com/";

test("orgânico (link sem UTM vindo do Google) grava o referrer no utmi_part", () => {
  assert.deepEqual(nextUtmParams({ queryString: undefined, referrer: google }), { utmi_part: google });
});

test("referrer do app do Google (android-app://) vira a URL web", () => {
  assert.equal(normalizeReferrer("android-app://com.google.android.googlequicksearchbox/https/www.google.com"), google);
  assert.equal(normalizeReferrer({ referrer: "https://www.bing.com" }), "https://www.bing.com/");
  assert.equal(normalizeReferrer(null), null);
});

test("origem interna, de app sem URL web ou vazia não grava nada", () => {
  for (const referrer of ["https://www.montecarlo.com.br/", "android-app://com.android.chrome", "", null]) {
    assert.equal(nextUtmParams({ queryString: "", referrer }), null, String(referrer));
  }
  assert.equal(isExternalOrigin("https://evilmontecarlo.com.br/"), true);
});

test("origem guardada válida é preservada (first-touch) e não regrava", () => {
  const stored = { utm_ipart: "https://www.bing.com/" };
  assert.equal(nextUtmParams({ queryString: "", referrer: google, stored }), null);
});

test("entrada por campanha descarta a origem guardada e usa o referrer da entrada", () => {
  const stored = { utm_source: "crmback", utm_ipart: "https://www.bing.com/" };
  assert.deepEqual(nextUtmParams({ queryString: "utm_source=google&utm_medium=cpc", referrer: null, stored }), {
    utm_source: "google", utm_medium: "cpc", utmi_part: null,
  });
  assert.deepEqual(nextUtmParams({ queryString: "gclid=abc", referrer: google, stored }), {
    utm_source: "crmback", utm_ipart: "https://www.bing.com/", utmi_part: google,
  });
});

test("link com UTM e sem referrer mantém o comportamento de antes", () => {
  assert.deepEqual(nextUtmParams({ queryString: "utm_source=push&utm_campaign=x", referrer: null }), {
    utm_source: "push", utm_campaign: "x", utmi_part: null,
  });
});
