# Production HQ

Independent GitHub + Vercel rendering test for the future job dashboard.

## What this checkpoint does

- Serves a clickable sample job on the website.
- Exposes an MCP server at `/api/mcp` using Vercel's `mcp-handler` and the official MCP SDK.
- Registers an HTML resource with `text/html;profile=mcp-app` and links it to the show tool.
- Sends a checkbox value from the card to a tool and displays the server's response.

**This is a rendering/communication test, not the production task manager.** No authentication, database, Google Sheets access, employee information or actual customer jobs are included. Checkbox changes are previews and reset when the card reopens. There are no shared mutable records. Do not enter real job information in this version.

## Run

Node 22 or later:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. The embedded card uses the same MCP tools as ChatGPT.

```sh
npm run typecheck
npm run build
npm test
```

The integration test starts the production server on port 3219 (run `npm run build` first), discovers the tools and resource, reads the actual HTML, and calls the sample checkbox tool in both directions. It does not certify rendering inside ChatGPT.

## GitHub and Vercel

1. Create a new private repository named `production-hq`; initialize it with a README so connected tools can see its default branch.
2. Upload this project's files to that repository, replacing its placeholder README. Do not upload `node_modules`, `.next`, or credentials.
3. In Vercel choose **Add New → Project → Import Git Repository**, and select `production-hq`.
4. Use framework **Next.js**, the repository root, and the default install/build settings. This checkpoint needs no environment variables or external services.
5. Deploy and open the website. Test the checkbox; verify the response says the server received the value.
6. For ChatGPT to call `/api/mcp`, Vercel deployment protection must not intercept this sample deployment's MCP endpoint. Keep production deployments protected as appropriate; this checkpoint contains only synthetic data.

## ChatGPT test

Create a custom MCP connection to `https://YOUR-DEPLOYMENT.vercel.app/api/mcp` with **No authentication**. If that option is unavailable, stop and report the available choices; do not enter an invented OAuth client ID. This version has no OAuth issuer or OAuth client registration.

Ask: **Show the Production HQ rendering test job.**

The test passes only when all of these happen **inside ChatGPT**:

1. The interactive card opens.
2. The checkbox can be clicked.
3. **Test connection** returns the selected value from the server.

If it fails, inspect Vercel logs for `resources/read` and `tools/call`; capture the ChatGPT error and HTTP response. A working website or text response is not a passing card test. Do not repeatedly rename template URIs without new evidence.

## Subsequent checkpoints

After rendering passes:

1. Add a real OAuth authorization provider, register the ChatGPT client, verify issuer/audience/expiry/scopes, and isolate each user's records. Vercel hosting does not supply OAuth automatically.
2. Add durable server-side storage and history; test save, reopen, duplicate requests and stale revisions. Never use process memory or Vercel's local filesystem as durable job storage.
3. Add job creation, nested tasks, workers, partial completion and proposed edits with explicit approval before saving.
4. Connect the approved Google Sheets source using separately configured server credentials; preserve existing IDs, append history and verify readback.
5. Verify dictated requests through ChatGPT and visual edits use the same records.

## References

- https://developers.openai.com/plugins/build/app-quickstart
- https://vercel.com/docs/mcp/deploy-mcp-servers-to-vercel
- https://github.com/vercel-labs/mcp-handler
