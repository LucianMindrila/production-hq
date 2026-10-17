# Activate production jobs

The authenticated endpoint and OAuth client remain unchanged. The existing private checkbox test tools remain available.

Run `supabase/002_production_board.sql` in the configured Supabase project to add account-isolated production boards and append-only change history. The schema uses the existing membership and OAuth resource checks. Do not add customer information to this public repository.

Prepare an import privately, with the current Google Sheet's job and stage IDs, recorded completion, dates, people, notes, material requirements and history. The import is a copy: visual and dictated changes are saved to Supabase; Google Sheets is not automatically updated. Confirm that operating mode with the user before activation.

`scripts/prepare-board-import.mjs` packages a validated JSON snapshot and the schema into a single transaction. Supply input/output paths outside this repository, the existing user's UUID and their expected email. The import checks that exact user and membership. Rerunning the same file is safe; a different existing board raises an error and is never overwritten. The final result reports job, stage, completed-stage, material and original-history counts.

Deploy the code after approval. The website dashboard loads `/production-board.html?surface=website` using its authenticated cookie API. ChatGPT uses the same saved board through OAuth tools. Refresh the plugin tools and ask **Show my production board** to load the new card.

Each checkbox/status change is a proposal until **Approve & save**. New subtasks follow the same approval flow. A board-wide revision rejects stale saves, a request UUID deduplicates retries, and the server reads the board back after saving. Changing stage completion does not silently rewrite a job's recorded status or next action. The displayed progress is calculated from actual complete stages.

Local validation runs the real PostgreSQL schema to check permissions, account isolation, approval, retries, stale revisions, partial status, new stages and history. The website and in-chat card must also be checked after activation. The old test can be opened under **Connection test** on the website.
