// GitHub REST API docs: https://docs.github.com/en/rest

import { fetchJson, localHeaders } from "./client.ts";

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.log("Set GITHUB_TOKEN to run this example.");
  process.exit(0);
}

await fetchJson("http://localhost:3000/api/connections/github", {
  method: "PUT",
  headers: localHeaders({ "content-type": "application/json" }),
  body: JSON.stringify({ authType: "api_key", values: { apiKey: token } }),
});

const result = await fetchJson("http://localhost:3000/api/actions/github.get_authenticated_user/runs", {
  method: "POST",
  headers: localHeaders({ "content-type": "application/json" }),
  body: JSON.stringify({ input: {} }),
});

console.log(JSON.stringify(result, null, 2));
