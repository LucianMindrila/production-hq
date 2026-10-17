# Activate production jobs

The authenticated endpoint and OAuth client remain unchanged. The existing private checkbox test tools remain available.

Run `supabase/002_production_board.sql` in the configured Supabase project to add account-isolated production boards and append-only change history. The schema uses the existing membership and OAuth resource checks. Do not add customer information to this public repository.

Prepare an import privately, with the current Google Sheet's job and stage IDs, recorded completion, dates, people, notes, material requirements and history. The import is a copy: visual and dictated changes are saved to Supabase; Google Sheets is not automatically updated. Confirm that operating mode with the user before activation.

`scripts/prepare-board-import.mjs` packages a validated JSON snapshot and the schema into a single transaction. Supply input/output paths outside this repository, the existing user's UUID and their expected email. The import checks that exact user and membership. Rerunning the same file is safe; a different existing board raises an error and is never overwritten. The final result reports job, stage, completed-stage, material and original-history counts.

Deploy the code after approval. The website dashboard loads `/production-board.html?surface=website` using its authenticated cookie API. ChatGPT uses the same saved board through OAuth tools. Refresh the plugin tools and ask **Show my production board** to load the new card.

Each checkbox/status change is a proposal until **Approve & save**. New subtasks follow the same approval flow. A board-wide revision rejects stale saves, a request UUID deduplicates retries, and the server reads the board back after saving. Changing stage completion does not silently rewrite a job's recorded status or next action. The displayed progress is calculated from actual complete stages.

Local validation runs the real PostgreSQL schema to check permissions, account isolation, approval, retries, stale revisions, partial status, new stages and history. The website and in-chat card must also be checked after activation. The old test can be opened under **Connection test** on the website.

## New jobs and archive (v0.4)

For an existing v0.3 board, run only `supabase/003_job_lifecycle.sql` in Supabase. It retains all imported data and adds audited job creation, archive and restore operations under the existing access rules. Do not rerun the old import or earlier migrations. For a fresh installation apply 001, 002, then 003; the current import packager includes 002 and 003 together.

After approval, deploy v0.4 and refresh the ChatGPT connection's tool definitions. The endpoint and OAuth client ID stay the same. Open the production board again to load its updated card.

Use **+ New job** to choose the business, customer and description; delivery, priority, next action, notes and initial subtasks are optional. Review the proposal and choose **Approve & save**. The server assigns the next DTS or CE ID, considering archived jobs too. Initial subtasks are not completed; owners and dates remain blank unless supplied. Dictation uses the same approved change tool, including individual task owners and targets.

The default **Current jobs** view excludes archived jobs. When every subtask is complete and the job has at least one subtask, **Archive completed job** becomes available. Archiving is a separate approved action, never automatic. The **Completed — ready to archive** filter finds eligible jobs. Archived jobs retain their IDs, tasks, materials, notes and history. Select **Archived**, then **Restore job** and approve to return one to Current jobs. Restore before changing its subtasks. Permanent deletion is not offered.

Validation covers sequential IDs, initial task defaults, duplicate and stale requests, forbidden payload fields, cross-account access, incomplete archive rejection, archived edit rejection, restore and history snapshots in PostgreSQL. The website and both ChatGPT bridge modes verify proposal-before-save and archive visibility. Production activation still requires the migration, deployment and refreshed plugin definitions; local checks do not prove the live version is activated.
