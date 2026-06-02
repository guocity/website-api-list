# Extensions

`website-api` ships with a set of **bundled** sites, and can load additional
**extension** sites you install yourself — either from a public registry or
straight from local files. This document covers how extensions are discovered,
how to find and install them, how to test your own before publishing, and the
security model.

---

## Where sites come from

At startup the loader (`src/core/loader.ts`) discovers sites from three places,
in this order (later ones override earlier ones **by `id`**):

| Origin | Location | Marker in `list` |
|---|---|---|
| **bundled** | shipped inside the npm package (`dist/src/sites/`) | — |
| **extension** | `~/.config/website-api/extensions/` (XDG; honors `$XDG_CONFIG_HOME`) | `[x]` |
| **extension** | every dir in `$WEBSITE_API_EXTENSIONS` (colon-separated) | `[x]` |

A site is a single runnable `.js`/`.mjs` file (optionally in a folder with
helpers). There is **no build step** at load time — extensions must be plain
JavaScript. See the registry's [authoring guide](https://github.com/guocity/website-api-list/blob/main/instructions.md).

```bash
npx website-api list      # all sites; [x] = user extension, [l] = login, [p] = needs Chrome
```

---

## The `ext` command group

```
npx website-api ext <subcommand>
```

| Command | What it does |
|---|---|
| `ext search [query]` | Search configured registries for installable sites |
| `ext info <id>` | Show full catalog details for one site |
| `ext install <id>` | Download, verify, and install a site into your extensions folder |
| `ext list` | List sites you've installed from registries |
| `ext remove <id>` | Remove an installed site |
| `ext update [id]` | Re-install installed sites whose registry commit changed |
| `ext test <path>` | Run a local site file directly, **without** installing |
| `ext registry add\|list\|remove` | Manage which registries are searched |

### Search & install

```bash
npx website-api ext search                # everything in every registry
npx website-api ext search bank           # filter by id/name/domain/tags
npx website-api ext info chase
npx website-api ext install chase         # interactive y/N confirmation
npx website-api ext install chase -y      # skip the prompt (scripts/CI)
npx website-api chase                     # run it like any bundled site
```

`search` caches each registry's catalog for ~1h. Pass `--refresh` to force a
re-fetch after a registry publishes new sites:

```bash
npx website-api ext search --refresh
```

### List, update, remove

```bash
npx website-api ext list                  # id, version, registry, commit, install date
npx website-api ext update                # check every installed site for a newer commit
npx website-api ext update chase -y       # just one, no prompt
npx website-api ext remove chase
```

Each installed site carries a `.source.json` recording its registry, repo,
pinned commit, version, and install time — that's what `list`/`update` read.

---

## Registries

A registry is a public Git repo with a generated `index.json` catalog plus one
folder of prebuilt JS per site. The default registry is
**`guocity/website-api-list`**; you can add more (they're searched in priority
order).

```bash
npx website-api ext registry list                       # configured registries
npx website-api ext registry add owner/repo             # add (branch defaults to main)
npx website-api ext registry add owner/repo#dev         # pin a branch
npx website-api ext registry add https://github.com/owner/repo
npx website-api ext registry remove owner/repo
```

Resolution order (first match wins, duplicates dropped):

1. `$WEBSITE_API_REGISTRY` — one-off override; comma-separated for multiple
2. registries in `~/.config/website-api/config.json`
3. the built-in default (`guocity/website-api-list`)

`config.json` shape:

```json
{
  "registries": [
    { "name": "guocity", "repo": "guocity/website-api-list", "branch": "main" }
  ]
}
```

If the same `id` is offered by more than one registry, `install`/`info` ask you
to disambiguate with `--registry <name>`.

---

## How install works (and why it's safe-ish)

`index.json` pins every site's files to a `commit` and records a `sha256` for
each file. On `install`, the CLI:

1. resolves the `id` to a catalog entry,
2. downloads each file from `raw.githubusercontent.com/<repo>/<commit>/<path>`,
3. **verifies the sha256 before writing anything** (a mismatch aborts the whole
   install — no half-written site),
4. writes the files to `~/.config/website-api/extensions/<id>/`,
5. imports the entry and confirms it normalizes to a site with the expected id,
6. records provenance in `.source.json`.

**Trust matters.** An installed site runs with your decrypted Chrome cookies and
saved credentials. Before installing, the CLI prints the id, domain, registry,
and pinned commit; warns if the site performs a login; and warns if it would
**shadow a bundled site**. In a real terminal it asks for confirmation (`-y`
skips it). Only install sites you trust.

---

## Testing a site without installing

Two ways to run a site straight from disk while you develop it:

### `ext test` (recommended)

```bash
# point at the folder or the file
npx website-api ext test ./sites/hackernews --limit 3
npx website-api ext test ./sites/hackernews/index.js --limit 3

# if a site flag collides with parsing, separate with --
npx website-api ext test ./sites/hackernews -- --limit 3

# site-level help
npx website-api ext test ./sites/hackernews -- --help
```

`ext test` loads the file, normalizes it (so missing required fields error
early), parses the trailing args against the site's own positionals/parameters,
runs it, and prints the result. Status messages go to **stderr** so stdout stays
clean and pipeable. Nothing is copied into your config.

### `$WEBSITE_API_EXTENSIONS`

Add a directory to the loader's search path for the duration of a command, so
the site is discoverable by its `id` exactly as if installed:

```bash
WEBSITE_API_EXTENSIONS="$(pwd)/sites" npx website-api hackernews --limit 3
WEBSITE_API_EXTENSIONS="$(pwd)/sites" npx website-api list   # shows it with [x]
```

---

## Environment variables

| Variable | Effect |
|---|---|
| `XDG_CONFIG_HOME` | Base for config/cache/installs (defaults to `~/.config`) |
| `WEBSITE_API_EXTENSIONS` | Extra extension roots (colon-separated) the loader scans |
| `WEBSITE_API_REGISTRY` | Override registries (comma-separated `owner/repo[#branch]`) |
| `WEBSITE_API_DEBUG` | Log loader failures (which files failed to import and why) |

---

