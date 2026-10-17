# Activate the private saving test

The working public rendering test remains at `/api/mcp`. The private test is separate at `/api/secure-mcp` and requires OAuth; it cannot expose or save records until configured. It uses a new private test record per approved account, not the old Sites test database or any real jobs.

## 1. Create a dedicated Supabase test project

Create a project named `production-hq-test` in your Supabase account. Keep its database password private; this app does not need that password or a service-role key.

Run `supabase/001_private_test.sql` once in that project's SQL Editor. It creates the state/history tables, membership and OAuth client allowlists, a transactional save function and a token hook. All tables have row-level security; anonymous users cannot access them. Authenticated clients cannot directly edit state/history tables.

## 2. Add your login

In Supabase Authentication > Users, add your own account and set its password through Supabase's dashboard. There is no public signup form in this app. Disable public signups in the project as an additional restriction.

Copy that user's UUID and grant it access in the SQL Editor:

```sql
insert into public.phq_members(user_id) values ('YOUR_USER_UUID');
```

Only an administrator can grant membership; merely creating a login does not grant access to the test. To revoke access, an administrator can remove that membership. Each member has a separate test record.

## 3. Configure Supabase and Vercel

In Supabase Authentication > URL Configuration, set Site URL:

```text
https://production-hq-seven.vercel.app
```

In Authentication > OAuth Server, enable the OAuth 2.1 server and set Authorization Path to `/oauth/consent`. Use asymmetric JWT signing keys (ES256 or RS256) in Authentication's signing-key settings. Do not enable dynamic client registration for this test; use a predefined client instead.

In Authentication > Hooks, enable **Custom Access Token** using the Postgres function `public.phq_access_token_hook` created by the migration. It adds a signed resource binding and the test-job permissions only to the explicitly registered client. Without the hook the MCP server rejects tokens.

In Vercel's `production-hq` project, add these Environment Variables for Production:

```text
APP_ORIGIN=https://production-hq-seven.vercel.app
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Use the project URL and publishable API key from Supabase's Connect dialog. Do not substitute a secret/service-role key. Redeploy after changing environment variables. Vercel Preview environments need a separate test project/configuration if enabled; do not automatically share Production credentials across previews.

At this point, `/dashboard` should let your approved account sign in and save its checkbox. Test the website before connecting ChatGPT.

## 4. Register the ChatGPT OAuth client

Create a **new** custom MCP connection named **Production HQ Private Test** in ChatGPT, with:

```text
Server URL: https://production-hq-seven.vercel.app/api/secure-mcp
Authentication: OAuth
```

Keep the existing **Production HQ Vercel Test** connection for the anonymous rendering test.

Copy the **exact redirect URI shown by ChatGPT's connection/Advanced OAuth settings**. Do not guess a callback URL; ChatGPT can use a connection-specific callback.

In Supabase Authentication > OAuth Apps, add a new client named **Production HQ ChatGPT**, choose **Public** and register that exact redirect URI. Public clients use PKCE and `token_endpoint_auth_method=none`; they do not have a client secret. Enable the provider's supported OIDC identity scopes if requested by ChatGPT.

Copy the real OAuth Client ID from Supabase. In the SQL Editor register it for this resource:

```sql
insert into public.phq_oauth_clients(client_id,resource)
values ('YOUR_OAUTH_CLIENT_ID','https://production-hq-seven.vercel.app/api/secure-mcp');
```

Add a fourth Production environment variable in Vercel, then redeploy:

```text
MCP_OAUTH_CLIENT_ID=YOUR_OAUTH_CLIENT_ID
```

Enter that **same registered Client ID** in ChatGPT's Advanced OAuth settings and select public-client token authentication (`none`) if shown. Do not enter a fake client ID or put the Supabase API key into the Client ID field. If the form insists on a confidential client/secret, stop at that screen and inspect its available settings before creating a different client type.

The server publishes protected resource discovery at:

```text
https://production-hq-seven.vercel.app/.well-known/oauth-protected-resource
```

That points to Supabase's issuer `https://YOUR_PROJECT_REF.supabase.co/auth/v1`. Supabase discovery is available at `https://YOUR_PROJECT_REF.supabase.co/.well-known/oauth-authorization-server/auth/v1`. Use discovered endpoints instead of manually guessing them.

Connect, sign in using the account created in step 2 and approve the consent screen. If the consent request expires during setup, start a fresh connection attempt after all settings are ready.

## 5. Acceptance test

In a new chat, enable **Production HQ Private Test** and ask **Show my saved test job**.

1. The card should identify itself as **PRIVATE SAVE TEST · BUILD 0.2.0**.
2. Tick the checkbox. It must show a proposed change without saving yet.
3. Click **Approve & save**. It must show a saved revision after server-side readback.
4. Start a new card or reopen `/dashboard`. Completion and revision must match the database.
5. Untick and approve saving. Reopen again to confirm both directions persist.
6. Open the job in two places, save from one and attempt to save the old revision from the other. The stale save must be rejected; reload before editing again.
7. Confirm history contains one row for each approved save, no extra row for an idempotent retry, and no row from merely ticking a checkbox.
8. A signed-out visitor, an unapproved account, or another member must not see your record. Test a second approved account to confirm it has a separate state.

Do not report live authentication/persistence as verified until these checks pass against the configured project. Google Sheets and production jobs are outside this test.

## Local validation

`npm run build` and `npm test` validate the deployed framework routes, both rendering bridges, the saved-card approval flow, token signature/issuer/audience/resource/client checks and the SQL migration. Database tests run the actual migration in PGlite (Postgres), including RLS and idempotency. They do not exercise hosted Supabase settings, remote OAuth issuance, email/password login or a real ChatGPT OAuth connection. Hosted concurrent writes and end-to-end authorization remain live acceptance checks.

References:
- https://supabase.com/docs/guides/auth/oauth-server/getting-started
- https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication
- https://supabase.com/docs/guides/auth/oauth-server/token-security
- https://developers.openai.com/plugins/build/auth
