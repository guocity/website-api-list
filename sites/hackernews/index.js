// A registry site is a plain object — no imports from the website-api package.
// It must be runnable JavaScript (the host imports it directly), so author in
// JS, or compile your TypeScript to a single .js before publishing.
//
// The host normalizes this object with defineSite(), so the same fields the
// bundled sites use are available here (transport, cookies, auth, parameters,
// positionals, endpoints, run).
export default {
  id: "hackernews",
  name: "Hacker News",
  domain: "news.ycombinator.com",
  description: "Fetches the current Hacker News top stories from the public Firebase API.",
  // No cookies or login needed — it's a public API.
  cookies: "optional",
  parameters: [
    { name: "limit", type: "number", description: "How many top stories to return", default: 10 },
  ],
  run: async (ctx) => {
    const limit = Number(ctx.options.limit ?? 10);
    const ids = await ctx.http.json("https://hacker-news.firebaseio.com/v0/topstories.json");
    const top = ids.slice(0, limit);
    const stories = await Promise.all(
      top.map((id) => ctx.http.json(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)),
    );
    return stories.map((s) => ({ title: s.title, url: s.url, score: s.score, by: s.by }));
  },
};
