# iPhone board investigation — 18 October 2026

## History and evidence

- `8e9f15a` added job creation and reversible archiving. Its GitHub `check` run passed. Its HTML passes the real-browser baseline rendering test with synthetic data. This is the recovery baseline before approval placement changes; there is no evidence certifying it as the last working release inside iPhone ChatGPT.
- `6a35453` moved approval from a sticky top panel into a selected task and preserved expanded jobs. `f25cd11` adjusted the simulated DOM tests; `1ca5e8d` changed the resource URI; `91cef3c` hid the top approval; `46255ca` restored visibility for creation/lifecycle actions.
- At original HEAD `46255ca`, the compatibility bridge ignores `window.openai.toolOutput`, and startup always calls `get_production_board` again. A browser test reproduces an empty jobs area when the supplied board is valid but this redundant read fails. The revised code passes that same test. This is a confirmed failure path, not proof of the cause of the reported live incident.
- Original HEAD can detach the approval panel when filters hide its job. Creation approval lives outside the creation form. Original fake-DOM tests cannot establish panel placement, focus, overflow, or visibility in a real browser.
- A read-only call to the connected Production HQ `show_production_board` succeeded: available board, 11 jobs, revision 3. No production records were changed. The current Codex session exposes no rendered MCP App tab for inspecting that result, so this does not certify actual ChatGPT rendering.

## Changes

- Consume initial and delayed ChatGPT board results; retain the standard MCP Apps and website paths. Report compatibility-widget height changes and keep a visible loading fallback.
- Keep task, subtask and lifecycle approvals next to their action; place new-job approval inside its form. Explicit non-submit approval buttons prevent accidental form submissions. Disable filters while a draft is pending and keep its job expanded. Focus and scroll to the local approval.
- Use 44px controls, 16px form text, wrapping cards, compact phone filters and safe-area bottom spacing. Job completion remains a deliberate two-tap proposal/approval action, with no optimistic claim of persistence.
- Preserve shared Supabase storage, revision protection, retry UUIDs, authentication and archive rules. No SQL or data migration is required.
- Add real-browser mobile regression checks to CI. Update Next.js from 16.3.4 to 16.3.8 to resolve dependency audit findings.

## Verification and release boundary

Run `npm ci`, `npm run build`, `npm run typecheck`, `npm test`, `npx playwright install chromium`, and `npm run test:mobile`.

Browser tests use synthetic in-memory data and intercepted requests only. They exercise 320, 375, 390 and 430px widths through the compatibility bridge, a parent-iframe standard MCP bridge and the website endpoint. They check completion, approval placement, creation, archive/restore, JavaScript errors and horizontal overflow. Additional tests cover initial and delayed host data and cancellation. Existing database tests use local PGlite, including membership, revision conflicts and idempotency.

These checks are Chromium viewport simulations, not physical iPhone Safari or a live ChatGPT host. Hosted OAuth, host-controlled approval prompts, cached resource delivery, keyboard/safe-area behavior on an actual iPhone, and the revised UI in ChatGPT remain release gates. Do not ask the user to acceptance-test until an isolated preview connection has passed these checks. Do not merge to the production branch as a substitute for this verification.

References: https://developers.openai.com/plugins/build/chatgpt-ui and https://developers.openai.com/plugins/reference (initial tool output, delayed globals, bridge calls and height notifications).
