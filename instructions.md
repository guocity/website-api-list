# How to add a new site

This registry serves **runnable JavaScript** sites that the `website-api` CLI
downloads and runs directly. There is **no build step on the user's machine** —
the loader imports your `.js` file as-is. So everything here is plain JS.

> TypeScript? You can author in TS for editor help, but you must **compile it to
> a single `.js`** before committing (see [Authoring in TypeScript](#authoring-in-typescript)).
> The published file must not import anything from the `website-api` package.

---

## 1. Create the site folder

One folder per site under `sites/`, named however you like (the folder name is
cosmetic — the `id` field is what matters):

```
sites/
  your-site/
    index.js        ← required entry point
    helper.js       ← optional extra files, shipped alongside
```

The entry file **default-exports a plain object**. Nothing is imported from the
`website-api` package — the host normalizes your object for you.

### Minimal example (declarative — just hit an API)

```js
// sites/cat-facts/index.js
export default {
  id: "cat-facts",
  name: "Cat Facts",
  domain: "catfact.ninja",
  description: "Returns a random cat fact from the public API.",
  cookies: "optional",               // no Chrome cookies needed
  endpoints: [{ url: "https://catfact.ninja/fact" }],
};
```

That's a complete, installable site. `endpoints[0]` is fetched and its JSON
returned automatically.

---

## 2. The site object — all fields

### Required

| Field | Type | Notes |
|---|---|---|
| `id` | string | Unique slug. This is what users type: `website-api <id>`. |
| `name` | string | Human-readable name. |
| `domain` | string | Cookie/credential domain, e.g. `"example.com"`. |
| `description` | string | One line; shown in `ext search` and `list`. |

### Behaviour

| Field | Default | Notes |
|---|---|---|
| `transport` | `"http"` | `"http"` for plain fetch, `"browser"` to drive Chrome via CDP. |
| `cookies` | `"required"` | `"optional"` if the site works without saved Chrome cookies. |
| `fingerprint` | `"stealth"` | Browser only. `false` disables, or pass an object to customize. |
| `keepBrowserOpen` | `false` | Browser only. Keep the tab open after running (useful for login/2FA). |
| `auth` | — | Login config (see [Login sites](#login-sites)). Browser transport. |
| `version` | — | Optional. Appears in the catalog and `ext list`. Bump it on changes. |
| `tags` | — | Optional `string[]` to make `ext search` matching better. |

### Inputs (CLI flags & positionals)

```js
parameters: [
  { name: "limit", type: "number",  description: "Max items", default: 10, short: "n" },
  { name: "json",  type: "boolean", description: "Raw JSON output" },
],
positionals: [
  { name: "query", description: "Search term", required: false, variadic: false },
],
```

- `parameters` → flags. `--limit 5`, `-n 5`, `--json`. Kebab names become
  camelCase in `ctx.options` (`--out-dir` → `ctx.options.outDir`).
- `positionals` → bare args. `variadic: true` collects all remaining ones into
  an array.

### Logic — pick **one** of:

- **`endpoints`** — declarative single fetch (see minimal example above):

  ```js
  endpoints: [{
    url: "https://api.example.com/data",
    method: "GET",                       // default GET
    headers: { "X-Foo": "bar" },         // optional
    responseType: "json",                // "auto" | "json" | "text" | "html"
    transform: (body, ctx) => body.items // optional post-processing
  }]
  ```

- **`run(ctx)`** — imperative; you drive the capabilities yourself and return
  whatever should be printed:

  ```js
  run: async (ctx) => {
    const limit = Number(ctx.options.limit ?? 10);
    const data = await ctx.http.json("https://api.example.com/list");
    return data.slice(0, limit);
  }
  ```

---

## 3. The `ctx` object (inside `run`)

| Member | What it does |
|---|---|
| `ctx.options` | Parsed flags + positionals (camelCase keys). |
| `ctx.debug` | `true` when `--debug` was passed. |
| `ctx.domain` | This site's domain. |
| `ctx.cookies()` / `ctx.cookieString()` | Decrypted Chrome cookies for the domain. |
| `ctx.credentials()` | Saved Chrome username/password for the domain. |
| `ctx.userAgent()` | Resolved User-Agent. |
| `ctx.http.json/text/html/sse/raw(url, init?)` | HTTP with cookies + UA auto-injected. |
| `ctx.loadHtml(html)` | Loads HTML string into the host's bundled cheerio ($). |
| `ctx.browser()` | Connects to Chrome over CDP, returns a Playwright `Page`. |
| `ctx.eval(fn)` | Sugar for `(await ctx.browser()).evaluate(fn)`. |
| `ctx.save(filename, content)` | Writes a file to `--out-dir` (or cwd); returns the path. |

> [!TIP]
> **Cheerio HTML Parsing**: Since installed extensions live in your config folder, they cannot resolve their own `node_modules` at runtime. Avoid importing `cheerio` directly (`import * as cheerio from "cheerio"`). Instead, use the host's built-in cheerio parser: `const $ = await ctx.loadHtml(html)`.

---

## Login sites

For a site behind a username/password form, set `transport: "browser"` and a
declarative `auth` config. The host detects an existing session and only logs in
when needed (credentials come from Chrome's saved passwords for the domain).

```js
export default {
  id: "example-portal",
  name: "Example Portal",
  domain: "example.com",
  description: "Logs in and fetches the account dashboard.",
  transport: "browser",
  cookies: "optional",
  keepBrowserOpen: true,
  auth: {
    intendedUrl: "https://example.com/dashboard",
    emailSelector: 'input[name="username"]',
    passwordSelector: 'input[name="password"]',
    submitButtonSelector: 'button[type="submit"]',
    delayMs: 1000,
    // Optional fallbacks for DOM variations:
    usernameSelectors: ["#user", 'input[type="email"]'],
    passwordSelectors: ["#pass"],
    submitSelectors: ['button[type="submit"]', "#login"],
    // Selectors that prove you're already logged in (skips the login):
    dashboardSelectors: ["#account-summary"],
  },
  run: async (ctx) => {
    const page = await ctx.browser();   // already authenticated here
    return ctx.eval(() => document.title);
  },
};
```

Login sites get the `[l]` (login) and `[p]` (needs Chrome) markers in `list`,
and `ext install` warns the user that the site reads saved credentials.

---

## 4. Test it locally before publishing

You don't have to push to test. Point the CLI's extensions path at your folder:

```bash
# from a checkout of this registry repo
WEBSITE_API_EXTENSIONS="$(pwd)/sites/your-site" npx website-api your-site --limit 3
```

`$WEBSITE_API_EXTENSIONS` is a colon-separated list of extra extension roots the
loader scans — handy for iterating without an install.

---

## 5. Regenerate the catalog

`index.json` is **generated** — never edit it by hand. It records each site's
metadata, a `sha256` for every file (integrity), and the git commit installs are
pinned to.

```bash
node scripts/generate-index.mjs
```

Or just push: the GitHub Action in `.github/workflows/index.yml` regenerates and
commits `index.json` on every push to `sites/**`.

> Because the CLI caches the catalog for ~1h, after publishing a new site run
> `npx website-api ext search --refresh` to see it immediately.

---

## 6. Publish

```bash
git add sites/your-site index.json
git commit -m "feat: add your-site"
git push
```

Then anyone can:

```bash
npx website-api ext search your-site
npx website-api ext install your-site
npx website-api your-site
```

Or run/update and execute it directly from the registry in one command:

```bash
npx website-api ext run your-site [args...]
```

---

## Authoring in TypeScript

The host imports your `.js` directly and does **not** run a build, so a `.ts`
file cannot be published as-is. If you prefer TypeScript:

1. Write `index.ts` exporting the same plain object (don't import from the
   `website-api` package — keep it standalone so the compiled output has no
   bare imports).
2. Compile to a single `.js` into the site folder, e.g.:
   ```bash
   npx esbuild index.ts --bundle --format=esm --platform=node --outfile=index.js
   ```
3. Commit the **`.js`** (and keep the `.ts` out of `sites/`, or the generator
   would try to load it). Only `.js`/`.mjs` files are catalogued.

---

## Checklist

- [ ] `sites/<folder>/index.js` default-exports a plain object
- [ ] Unique `id`, plus `name`, `domain`, `description`
- [ ] Either `endpoints` **or** `run` is defined (not neither)
- [ ] No imports from the `website-api` package
- [ ] Set `cookies: "optional"` if no Chrome cookies are needed
- [ ] Ran `node scripts/generate-index.mjs` (or pushed and let CI do it)
- [ ] Tested with `WEBSITE_API_EXTENSIONS=…` or after install
