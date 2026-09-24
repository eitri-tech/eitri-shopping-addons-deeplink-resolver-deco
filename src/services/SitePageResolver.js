import Eitri from "eitri-bifrost";
import { App } from "eitri-shopping-vtex-shared";
import { openEitriApp } from "./NavigationService";

const REQUEST_TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 2;

// Mesma normalização do normalizePath de page-index/worker.mjs: mudar um sem o outro gera 404 silencioso.
const toIndexKey = (pathname) =>
  String(pathname || "")
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return encodeURIComponent(decodeURIComponent(segment).toLowerCase());
      } catch (e) {
        return encodeURIComponent(segment.toLowerCase());
      }
    })
    .join("/");

const extractPathname = (deeplink) => {
  const [withoutQuery] = String(deeplink).split(/[?#]/);
  return withoutQuery.replace(/^https?:\/\//, "").replace(/^[^/]*/, "");
};

const extractQueryFilters = (deeplink) => {
  const query = String(deeplink).split("?")[1];
  if (!query) return { facets: [], sort: "" };

  const facets = [];
  let sort = "";
  for (const [key, value] of new URLSearchParams(
    query.split("#")[0],
  ).entries()) {
    if (key.startsWith("filter.") && value)
      facets.push({ key: key.replace("filter.", ""), value });
    if (key === "sort" && value) sort = value;
  }
  return { facets, sort };
};

const fetchPageEntry = async (template, key) => {
  const startedAt = Date.now(); // [DEBUG-DEEPLINK]
  try {
    const response = await Eitri.http.get(template.replace("{path}", key), {
      timeout: REQUEST_TIMEOUT_MS,
    });
    console.log(
      "[DEBUG-DEEPLINK] lambda em",
      Date.now() - startedAt,
      "ms",
      template.replace("{path}", key),
      response?.status,
      typeof response?.data,
      JSON.stringify(response?.data),
    );
    const data =
      typeof response?.data === "string"
        ? JSON.parse(response.data)
        : response?.data;
    return data && typeof data === "object" ? data : null;
  } catch (error) {
    console.log("resolveDeeplinkFromSitePages: página não indexada", key);
    console.log(
      "[DEBUG-DEEPLINK] lambda erro em",
      Date.now() - startedAt,
      "ms",
      key,
      error?.message,
      JSON.stringify(error?.response?.data ?? error),
    );
    return null;
  }
};

export const resolveDeeplinkFromSitePages = async (deeplink) => {
  const template = App?.configs?.deeplinkResolver?.pageResolverUrl;
  console.log(
    "[DEBUG-DEEPLINK] deeplink",
    deeplink,
    "pageResolverUrl",
    template,
    "deeplinkResolver",
    JSON.stringify(App?.configs?.deeplinkResolver),
  );
  if (typeof template !== "string" || !template.includes("{path}") || !deeplink)
    return false;

  console.log("resolveDeeplinkFromSitePages");
  let pathname = extractPathname(deeplink);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const key = toIndexKey(pathname);
    if (!key) return false;

    const entry = await fetchPageEntry(template, key);
    if (!entry) return false;

    if (entry.type === "redirect" && typeof entry.to === "string") {
      pathname = extractPathname(entry.to);
      continue;
    }

    const pageFacets = Array.isArray(entry.facets)
      ? entry.facets.filter((f) => f?.key && f?.value)
      : [];
    if (entry.type !== "catalog" || !pageFacets.length) return false;

    const query = extractQueryFilters(deeplink);
    const sort = query.sort || entry.sort || "";
    openEitriApp("home", {
      deeplink,
      route: "ProductCatalog",
      title: typeof entry.title === "string" ? entry.title : "",
      params: {
        facets: [...pageFacets, ...query.facets],
        ...(sort ? { sort } : {}),
      },
    });
    return true;
  }

  return false;
};
