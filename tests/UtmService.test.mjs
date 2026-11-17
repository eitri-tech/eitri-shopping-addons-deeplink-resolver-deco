// node --test tests/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractUtmParams, sanitizeUtmParams } from "../src/services/UtmService.js";

test("link do Google Ads (codificado) grava a campanha igual ao site", () => {
  const q = "sort=orders%3Adesc&utm_source=google&utm_medium=cpc&utm_campaign=n.mvcon.mper.%5BMonteCarlo%5D%5BConvers%C3%A3o%5DTicketBaixo%5Bate_1000%5D.p_BR&utm_term=monte%20carlo%20joias&gclid=abc";
  assert.deepEqual(extractUtmParams(q), {
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "nmvconmperMonteCarloConversãoTicketBaixoate_1000p_BR",
    utm_term: "monte carlo joias",
  });
});

test("mesma campanha com colchetes crus ou codificados vira o mesmo valor", () => {
  const raw = extractUtmParams("utm_campaign=n.troas.bran.[MonteCarlo][Convers%C3%A3o]MonteCarlo.p_BR");
  const encoded = extractUtmParams("utm_campaign=n.troas.bran.%5BMonteCarlo%5D%5BConvers%C3%A3o%5DMonteCarlo.p_BR");
  assert.equal(raw.utm_campaign, "ntroasbranMonteCarloConversãoMonteCarlop_BR");
  assert.equal(encoded.utm_campaign, raw.utm_campaign);
});

test("mantém o que o site mantém e remove o que o site remove", () => {
  const { utm_campaign } = extractUtmParams("utm_campaign=" + encodeURIComponent("A.,;:?='\"<>{}|^~`*%[]/()!@#$&+-_ ãéç🙂Z"));
  assert.equal(utm_campaign, "A,;:?='\"|^~`*%!@#$&+-_ ãéçZ");
});

test("awc da Awin vira utm_campaign", () => {
  assert.deepEqual(extractUtmParams("utm_source=awin&awc=100451_1794862992_3b37962a"), {
    utm_source: "awin",
    utm_campaign: "100451_1794862992_3b37962a",
  });
});

test("sem query ou sem utm não grava nada", () => {
  assert.deepEqual(extractUtmParams(undefined), {});
  assert.deepEqual(extractUtmParams("sort=price:asc"), {});
});

test("params do push (objeto) passam pela mesma limpeza", () => {
  assert.deepEqual(
    sanitizeUtmParams({ utm_source: "push_app", utm_campaign: "20261115_push.alta[bf]", utmi_campaign: "x.y" }),
    { utm_source: "push_app", utm_campaign: "20261115_pushaltabf", utmi_campaign: "x.y" },
  );
});
