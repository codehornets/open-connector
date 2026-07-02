// Hacker News API docs: https://github.com/HackerNews/API

import { fetchJson, localHeaders } from "./client.ts";

const result = await fetchJson("http://localhost:3000/api/actions/hackernews.get_top_stories/runs", {
  method: "POST",
  headers: localHeaders({ "content-type": "application/json" }),
  body: JSON.stringify({ input: {} }),
});

console.log(JSON.stringify(result, null, 2));
