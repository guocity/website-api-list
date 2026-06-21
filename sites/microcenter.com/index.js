// A registry site is a plain object — no imports from the website-api package.
// The host normalizes it with defineSite(), so the usual fields are available
// (transport, cookies, parameters, run, …). Sibling files like this one's
// `microcenter-helper.js` are shipped alongside and imported relatively.
//
// HTML parsing uses the host's cheerio via `ctx.loadHtml(html)` — an installed
// extension can't resolve its own `node_modules`, so it never imports cheerio
// directly.
import { CATEGORY_URLS, parseProducts } from "./microcenter-helper.js";

/**
 * Micro Center has no public product API, so we render its search-results pages
 * in a real (fingerprinted) Chrome over CDP and parse the returned HTML with
 * cheerio. Two Apple categories are supported — `mac` (desktops: mini/Studio/
 * Pro/iMac) and `macbook` (laptops) — selected with `--mac` / `--macbook`.
 * With neither flag, both are scraped. Results are keyed to a store via
 * `--store` (Micro Center prices/stock are per-location; default 075).
 */

const DEFAULT_STORE = "075";

/** Navigate to a category page, wait for the product grid, and parse it. */
async function scrapeCategory(ctx, page, url, log, retries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      log(`[microcenter] fetching ${url} (attempt ${attempt}/${retries})`);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForSelector("li.product_wrapper", { timeout: 30_000 });
      const $ = await ctx.loadHtml(await page.content());
      const products = parseProducts($, url);
      log(`[microcenter] parsed ${products.length} products`);
      return products;
    } catch (e) {
      lastErr = e;
      log(`[microcenter] attempt ${attempt} failed: ${e.message}`);
      if (attempt < retries) {
        await page.waitForTimeout(attempt * 2000);
      }
    }
  }
  throw new Error(
    `Failed to scrape ${url} after ${retries} attempts: ${lastErr?.message ?? "unknown error"}`,
  );
}

export default {
  id: "microcenter",
  name: "Micro Center",
  domain: "microcenter.com",
  description:
    "Scrape Micro Center Apple search results — Mac desktops and/or MacBooks — into structured JSON (browser transport, parses with cheerio). Defaults to both categories; pick one with --mac / --macbook.",
  transport: "browser",
  cookies: "optional",

  parameters: [
    { name: "mac", type: "boolean", description: "Scrape Mac desktops (mini, Studio, Pro, iMac)" },
    { name: "macbook", type: "boolean", description: "Scrape MacBooks (Air, Pro)" },
    {
      name: "store",
      type: "string",
      description: `Micro Center store id for price/stock (default ${DEFAULT_STORE})`,
      default: DEFAULT_STORE,
      short: "s",
    },
  ],

  run: async (ctx) => {
    // With neither flag set, scrape both categories (the default).
    const wantMac = !!ctx.options.mac;
    const wantMacbook = !!ctx.options.macbook;
    const categories =
      wantMac || wantMacbook
        ? [...(wantMac ? ["mac"] : []), ...(wantMacbook ? ["macbook"] : [])]
        : ["mac", "macbook"];

    const storeId = String(ctx.options.store || DEFAULT_STORE);
    const page = await ctx.browser();
    const log = (m) => ctx.debug && console.log(m);

    const products = [];
    const byCategory = {};
    for (const category of categories) {
      const url = CATEGORY_URLS[category](storeId);
      const rows = await scrapeCategory(ctx, page, url, log);
      byCategory[category] = rows.length;
      products.push(...rows);
    }

    return {
      store: storeId,
      categories,
      counts: { total: products.length, ...byCategory },
      products,
    };
  },
};
