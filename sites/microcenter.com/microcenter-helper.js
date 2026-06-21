/**
 * Pure parsing helpers for Micro Center search-result pages.
 *
 * This extension imports **no external packages** — an installed extension lives
 * under ~/.config/website-api/extensions/ where a bare `import "cheerio"` can't
 * resolve the host's node_modules. Instead `parseProducts` receives a cheerio
 * document (`$`) that the host hands over via `ctx.loadHtml(html)`, so the
 * host's bundled cheerio does the work and nothing needs to be bundled here.
 */

export const ORIGIN = "https://www.microcenter.com";
export const SEARCH_BASE = `${ORIGIN}/search/search_results.aspx`;

/** Search-result URLs per category. `N` codes are Micro Center's facet ids. */
export const CATEGORY_URLS = {
  mac: (storeId) =>
    `${SEARCH_BASE}?N=4294967292+4294819353&NTK=all&sortby=match&rpp=96&storeid=${storeId}`,
  macbook: (storeId) =>
    `${SEARCH_BASE}?N=4294967288+4294820432&NTK=all&sortby=match&rpp=96&storeid=${storeId}`,
};

const COLORS = [
  "midnight",
  "starlight",
  "space gray",
  "silver",
  "blue",
  "green",
  "yellow",
  "orange",
  "red",
  "purple",
  "pink",
  "gold",
  "gray",
  "black",
  "white",
];

const CATEGORY_PATTERNS = [
  [/macbook\s+pro.*?16(?:\.\d+)?(\D|$)/i, "MacBook Pro 16"],
  [/macbook\s+pro.*?14(?:\.\d+)?(\D|$)/i, "MacBook Pro 14"],
  [/macbook\s+air.*?15(?:\.\d+)?(\D|$)/i, "MacBook Air 15"],
  [/macbook\s+air.*?13(?:\.\d+)?(\D|$)/i, "MacBook Air 13"],
  [/macbook\s+neo/i, "MacBook Neo"],
  [/mac\s+mini/i, "Mac mini"],
  [/imac\s*24/i, "iMac 24"],
  [/mac\s+pro/i, "Mac Pro"],
  [/mac\s+studio/i, "Mac Studio"],
];

const SPEC_RULES = [
  ["CPU", ["cpu", "processor"]],
  ["RAM", ["memory", "ram", "gb"]],
  ["Storage", ["drive", "storage", "ssd", "hdd", "nvme"]],
  ["GPU", ["gpu", "graphics"]],
  ["OS", ["macos", "windows", "linux", "os"]],
  ["WIFI", ["wi-fi", "wifi"]],
  ["Bluetooth", ["bluetooth"]],
  ["Display", ["display", "screen", "inch"]],
];

function normalizeText(text) {
  if (!text) return "";
  return text.replace(/(\S)\$/g, "$1 $");
}

function findElement(item, tag, attrs) {
  let selector = tag;
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "class" || key === "className") {
        const classes = value.split(/\s+/).filter(Boolean);
        selector += classes.map((c) => `.${c}`).join("");
      } else {
        selector += `[${key}="${value}"]`;
      }
    }
  }
  const el = item.find(selector);
  return el.length > 0 ? el.first() : null;
}

function safeGetText(item, selectors) {
  for (const [tag, attrs] of selectors) {
    const el = findElement(item, tag, attrs);
    if (el) {
      let text = el.text();
      if (text) {
        text = text.replace(/\s+/g, " ").trim();
        if (text) return normalizeText(text);
      }
    }
  }
  return "";
}

function parseColorFromName(name) {
  if (!name) return null;
  const low = name.toLowerCase();
  const found = COLORS.find((c) => low.includes(c));
  if (found) {
    return found
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return null;
}

function parsePrice(text) {
  if (!text) return "";
  const m = text.match(/\$\s*[\d,]+(?:\.\d{2})?/);
  if (!m) return "";
  return m[0].replace(/\s+/g, "");
}

function parseInstock(text) {
  if (!text) return "";
  const m = text.match(/\d+/);
  return m ? m[0] : text.trim();
}

function getCategory(name) {
  if (!name) return null;
  const truncatedName = name.includes('"') ? name.split('"')[0].trim() : name;
  for (const [pattern, label] of CATEGORY_PATTERNS) {
    if (pattern.test(truncatedName)) return label;
  }
  return null;
}

function getDirectText(el) {
  return el
    .contents()
    .filter((_i, child) => child.type === "text")
    .text()
    .trim();
}

function extractInventoryText($, item) {
  let invEl = null;
  item.find("span, div").each((_i, el) => {
    const $el = $(el);
    const clsAttr = $el.attr("class");
    if (clsAttr?.toLowerCase().includes("inventorycnt")) {
      invEl = $el;
      return false; // break
    }
  });

  if (invEl) {
    const directText = getDirectText(invEl);
    if (directText) return directText;
  }

  const classes = ["inventoryCnt", "inventory-cnt", "inventory_cnt", "stock-qty"];
  for (const cls of classes) {
    const el = item.find(`.${cls}`);
    if (el.length > 0) {
      const directText = getDirectText(el.first());
      if (directText) return directText;
    }
  }

  return "";
}

function parseModelFromName(name) {
  if (!name) return null;
  const m = name.match(/([A-Z0-9]{7}\/[A-Z])/);
  return m ? m[1] : null;
}

function parseYearFromName(name) {
  if (!name) return null;
  const m = name.match(/\((Early|Mid|Late) (\d{4})\)/);
  return m ? `${m[1]} ${m[2]}` : null;
}

function mapSpecs($, item, name) {
  const specs = {};
  const color = parseColorFromName(name);
  if (color) specs.Color = color;

  item.find("li[class*=spec_]").each((_i, node) => {
    const text = $(node).text().trim();
    if (!text) return;
    const low = text.toLowerCase();

    let matched = false;
    for (const [key, keywords] of SPEC_RULES) {
      if (specs[key] !== undefined) continue;
      if (keywords.some((k) => low.includes(k))) {
        specs[key] = text;
        matched = true;
        break;
      }
    }

    if (!matched && low.includes("color") && specs.Color === undefined && !color) {
      specs.Color = text;
    }
  });

  return specs;
}

/**
 * Split a Micro Center clearance blurb like "1 open box from $947.96" into the
 * condition ("1 open box") and the price ("$947.96"). Either part may be empty.
 */
function parseClearance(text) {
  if (!text) return { clearance_condition: "", clearance_price: "" };
  const clearance_price = parsePrice(text);
  const dollarAt = text.indexOf("$");
  const clearance_condition = (dollarAt >= 0 ? text.slice(0, dollarAt) : text)
    // Drop the trailing connector ("from" / "starting at" / "at").
    .replace(/\b(?:starting\s+)?(?:from|at)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return { clearance_condition, clearance_price };
}

function moneyToFloat(s) {
  if (!s?.startsWith("$")) return null;
  const val = Number.parseFloat(s.slice(1).replace(/,/g, ""));
  return Number.isNaN(val) ? null : val;
}

function urljoin(base, relative) {
  if (!relative) return null;
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

/**
 * Parse a Micro Center search-results document into product records.
 * `$` is a cheerio document from the host (`ctx.loadHtml(html)`).
 */
export function parseProducts($, pageUrl) {
  const results = [];

  $("li.product_wrapper").each((_i, el) => {
    const item = $(el);
    const imgEl = item.find("img");
    const rawImg = imgEl.attr("src");

    const name = safeGetText(item, [["div", { class: "pDescription" }]]);
    const sku = safeGetText(item, [["p", { class: "sku" }]])
      .replace("SKU:", "")
      .trim();
    const linkEl = item.find("a.productClickItemV2");

    const originalPriceText = safeGetText(item, [["div", { class: "standardDiscount" }]]);
    const priceText = safeGetText(item, [
      ["span", { itemprop: "price" }],
      ["div", { class: "price" }],
      ["span", { class: "price" }],
      ["span", { class: "activePrice" }],
      ["span", { class: "instoreOnly" }],
    ]);
    const rebateText = safeGetText(item, [
      ["div", { class: "rebate-price" }],
      ["div", { class: "rebatePrice" }],
    ]);

    const originalPrice = parsePrice(originalPriceText);
    const price = parsePrice(priceText);
    const rebatePrice = parsePrice(rebateText);

    const origF = moneyToFloat(originalPrice);
    const priceF = moneyToFloat(price);
    const clearance = parseClearance(safeGetText(item, [["div", { class: "clearance" }]]));

    results.push({
      img: urljoin(pageUrl, rawImg),
      highlight: safeGetText(item, [["div", { class: "highlight" }]]),
      link: urljoin(pageUrl, linkEl.attr("href")),
      sku,
      category: getCategory(name),
      model: parseModelFromName(name),
      year: parseYearFromName(name),
      name,
      specs: mapSpecs($, item, name),
      original_price: originalPrice,
      price,
      clearance_condition: clearance.clearance_condition,
      clearance_price: clearance.clearance_price,
      rebate_price: rebatePrice,
      instock: parseInstock(extractInventoryText($, item)),
      footerrestrictions: safeGetText(item, [["div", { class: "footerrestrictions" }]]),
      save: origF !== null && priceF !== null ? Math.round((origF - priceF) * 100) / 100 : null,
    });
  });

  return results;
}
