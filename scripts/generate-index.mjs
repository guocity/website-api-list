#!/usr/bin/env node
// Generates index.json — the catalog the website-api CLI reads to search and
// install sites. Run in CI on every push so the catalog never drifts from the
// committed site code.
//
//   node scripts/generate-index.mjs
//
// For each folder under sites/, it:
//   • picks the entry file (index.js, index.mjs, or the first *.js)
//   • imports it to read the site's declared metadata
//   • records every shipped file with its sha256 (integrity for the installer)
//   • stamps the current git commit (files are fetched pinned to it)

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sitesDir = join(root, "sites");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/** Files that are part of a site (loadable code), excluding docs/tests. */
function siteFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.(m?js)$/.test(name) && !/\.test\./.test(name)) {
        out.push(full);
      }
    }
  };
  walk(dir);
  return out;
}

/** Picks the module entry point inside a site directory. */
function entryFile(files, dir) {
  for (const pref of ["index.mjs", "index.js"]) {
    const hit = files.find((f) => f === join(dir, pref));
    if (hit) return hit;
  }
  return files[0];
}

const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root }).toString().trim();

const sites = [];
for (const name of readdirSync(sitesDir)) {
  const dir = join(sitesDir, name);
  if (!statSync(dir).isDirectory()) continue;

  const files = siteFiles(dir);
  if (files.length === 0) {
    console.warn(`! ${name}: no .js files, skipping`);
    continue;
  }
  const entry = entryFile(files, dir);

  // Import the entry to read its declared metadata.
  const mod = await import(pathToFileURL(entry).href);
  const def = mod.default ?? mod.site;
  if (!def || typeof def !== "object" || !def.id) {
    console.warn(`! ${name}: entry does not export a site object, skipping`);
    continue;
  }

  // Entry first, then the rest — the installer treats files[0] as the entry.
  const ordered = [entry, ...files.filter((f) => f !== entry)];
  sites.push({
    id: def.id,
    name: def.name,
    domain: def.domain,
    description: def.description,
    version: def.version, // optional; set it in your site object if you version
    transport: def.transport ?? "http",
    auth: Boolean(def.auth),
    tags: def.tags,
    path: relative(root, dir),
    files: ordered.map((f) => ({
      name: relative(dir, f),
      sha256: sha256(readFileSync(f)),
    })),
  });
  console.log(`✓ ${def.id} (${sites.length})`);
}

sites.sort((a, b) => a.id.localeCompare(b.id));

const index = {
  schemaVersion: 1,
  commit,
  updatedAt: new Date().toISOString(),
  sites,
};
writeFileSync(join(root, "index.json"), JSON.stringify(index, null, 2) + "\n");
console.log(`\nWrote index.json with ${sites.length} site(s) at commit ${commit.slice(0, 10)}`);
