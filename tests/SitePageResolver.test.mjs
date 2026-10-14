// node --test tests/*.test.mjs
// Contrato do pageResolverUrl (docs/DEEPLINK.md) sem Eitri: bifrost,
// vtex-shared e NavigationService viram stubs que registram as chamadas.
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";

const calls = [];
let responses = {};
let pageResolverUrl = "https://site/_app/deeplink/{path}.json";

globalThis.__stubs = {
  bifrost: {
    http: {
      get: async (url) => {
        calls.push(["get", url]);
        if (!(url in responses)) throw new Error("404");
        return { status: 200, data: responses[url] };
      },
    },
  },
  App: { get configs() { return { deeplinkResolver: { pageResolverUrl } }; } },
  openEitriApp: (slug, params) => calls.push(["openEitriApp", slug, params]),
  openBrowser: async (url, inApp) => calls.push(["openBrowser", url, inApp]),
};

// Os pacotes do Eitri não existem fora do app: o import vira um stub.
const STUBS = {
  "eitri-bifrost": "export default globalThis.__stubs.bifrost;",
  "eitri-shopping-vtex-shared": "export const App = globalThis.__stubs.App;",
  "./NavigationService": "export const { openEitriApp, openBrowser } = globalThis.__stubs;",
};
registerHooks({
  resolve: (specifier, context, next) =>
    specifier in STUBS ? { url: `stub:${specifier}`, shortCircuit: true } : next(specifier, context),
  load: (url, context, next) =>
    url.startsWith("stub:") ? { format: "module", source: STUBS[url.slice(5)], shortCircuit: true } : next(url, context),
});

const root = new URL("../src/services/", import.meta.url);
const { resolveDeeplinkFromSitePages } = await import(new URL("SitePageResolver.js", root).href);
const url = (path) => `https://site/_app/deeplink/${path}.json`;
const opened = () => calls.filter(([k]) => k !== "get");

beforeEach(() => {
  calls.length = 0;
  responses = {};
  pageResolverUrl = "https://site/_app/deeplink/{path}.json";
});

test("catalog abre o ProductCatalog com facets da página + filter.* e sort do link", async () => {
  responses[url("joias/pedras/agata")] = { type: "catalog", title: "Agata", facets: [{ key: "pedra", value: "ágata" }], sort: "release:desc" };
  assert.equal(await resolveDeeplinkFromSitePages("https://www.loja.com.br/Joias/Pedras/Agata/?filter.cor=preta&sort=price:asc"), true);
  assert.deepEqual(opened(), [["openEitriApp", "home", {
    deeplink: "https://www.loja.com.br/Joias/Pedras/Agata/?filter.cor=preta&sort=price:asc",
    route: "ProductCatalog",
    title: "Agata",
    params: { facets: [{ key: "pedra", value: "ágata" }, { key: "cor", value: "preta" }], sort: "price:asc" },
  }]]);
});

test("catalog sem facets não abre nada (segue a cadeia)", async () => {
  responses[url("x")] = { type: "catalog", title: "X", facets: [] };
  assert.equal(await resolveDeeplinkFromSitePages("https://www.loja.com.br/x"), false);
  assert.deepEqual(opened(), []);
});

test("redirect é seguido", async () => {
  responses[url("antiga")] = { type: "redirect", to: "/nova" };
  responses[url("nova")] = { type: "catalog", title: "Nova", facets: [{ key: "a", value: "b" }] };
  assert.equal(await resolveDeeplinkFromSitePages("https://www.loja.com.br/antiga"), true);
  assert.equal(opened()[0][2].title, "Nova");
});

test("redirect em loop para depois de 2 saltos", async () => {
  responses[url("a")] = { type: "redirect", to: "/b" };
  responses[url("b")] = { type: "redirect", to: "/a" };
  assert.equal(await resolveDeeplinkFromSitePages("https://www.loja.com.br/a"), false);
  assert.equal(calls.filter(([k]) => k === "get").length, 3);
});

test("search usa o q do deeplink (o {path} vai sem query)", async () => {
  responses[url("s")] = { type: "search", query: "" };
  assert.equal(await resolveDeeplinkFromSitePages("https://www.loja.com.br/s?q=anel%20prata#x"), true);
  assert.deepEqual(opened(), [["openEitriApp", "home", { deeplink: "https://www.loja.com.br/s?q=anel%20prata#x", route: "Search", searchTerm: "anel prata" }]]);
});

test("search: query da resposta tem prioridade", async () => {
  responses[url("s")] = { type: "search", query: "brinco" };
  await resolveDeeplinkFromSitePages("https://www.loja.com.br/s?q=anel");
  assert.equal(opened()[0][2].searchTerm, "brinco");
});

test("search sem termo segue a cadeia", async () => {
  responses[url("s")] = { type: "search" };
  assert.equal(await resolveDeeplinkFromSitePages("https://www.loja.com.br/s?filter.cor=preta"), false);
  assert.deepEqual(opened(), []);
});

test("web abre o deeplink original no navegador interno", async () => {
  responses[url("regulamento")] = { type: "web" };
  assert.equal(await resolveDeeplinkFromSitePages("https://www.loja.com.br/regulamento?utm=x"), true);
  assert.deepEqual(opened(), [["openBrowser", "https://www.loja.com.br/regulamento?utm=x", true]]);
});

test("tipo desconhecido e 404 seguem a cadeia", async () => {
  responses[url("novo")] = { type: "algo-futuro" };
  assert.equal(await resolveDeeplinkFromSitePages("https://www.loja.com.br/novo"), false);
  assert.equal(await resolveDeeplinkFromSitePages("https://www.loja.com.br/nao-existe"), false);
  assert.deepEqual(opened(), []);
});

test("sem pageResolverUrl não consulta nada", async () => {
  pageResolverUrl = undefined;
  assert.equal(await resolveDeeplinkFromSitePages("https://www.loja.com.br/x"), false);
  assert.deepEqual(calls, []);
});

test("path normalizado como o toIndexKey (minúsculas, segmento encodado)", async () => {
  await resolveDeeplinkFromSitePages("https://www.loja.com.br/Joias/Ágata/");
  assert.deepEqual(calls[0], ["get", url("joias/%C3%A1gata")]);
});
