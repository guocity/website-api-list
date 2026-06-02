# website-api-list

A public registry of installable sites for [`website-api`](https://www.npmjs.com/package/website-api).

The CLI reads [`index.json`](index.json) (generated from the `sites/` folder) to
let users **search** and **install** sites:

```bash
npx website-api ext registry add guocity/website-api-list   # (default already configured)
npx website-api ext search hacker
npx website-api ext install hackernews
npx website-api hackernews --limit 5
```

## Repository layout

```
website-api-list/
  index.json                 # generated catalog (do not hand-edit)
  sites/
    hackernews/
      index.js               # one runnable-JS site per folder
  scripts/generate-index.mjs # builds index.json from sites/
  .github/workflows/index.yml# regenerates index.json on every push
```

## Adding a site

1. Create `sites/<your-id>/index.js`. Default-export a **plain object** — no
   imports from the `website-api` package (the host normalizes it for you):

   ```js
   export default {
     id: "example",
     name: "Example",
     domain: "example.com",
     description: "What this site fetches.",
     cookies: "optional",
     endpoints: [{ url: "https://example.com/api/data" }],
   };
   ```

   Authoring in TypeScript? Compile it to a single `.js` first — the host
   imports the file directly and does **not** run a build step.

2. Run `node scripts/generate-index.mjs` (or just push — CI does it) to refresh
   `index.json` with the new entry, its file hashes, and the current commit.

## How install works

`index.json` pins every site's files to a `commit` and records a `sha256` per
file. The CLI downloads each file from `raw.githubusercontent.com` at that
commit and **verifies the hash before writing it** to
`~/.config/website-api/extensions/<id>/`. Installed sites run with the user's
Chrome session, so the CLI shows the source and asks for confirmation first —
only publish code you'd want people to trust.
