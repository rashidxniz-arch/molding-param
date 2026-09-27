# Run now – what Claude does

Scheduled task "Molding Parameter – read photos", run only when Rashid presses **Run now**.
Secrets (passcode, template key, script link) are in the task prompt – never write them into the repo.

Since v2.0 the technicians take the photos in the app and the Google script has them read at once
(Anthropic API). This task now only makes the EXZONE PDFs for approved trials.

Sources:
- **Approved trials:** Google Drive folder "Molding Parameter – for Claude" – one Google Doc per approved trial, named `MPA <trialId> Rev <n> <code>`.
- **Output:** this repo (`molding-param`, GitHub Pages). Everything written to `data/` is encrypted with the team passcode.

## Steps
1. Clone the repo; `cd tools && npm install --no-audit --no-fund`.
2. `node tools/run.js status` (with MPA_CODE) → approved trials already imported, PDFs missing.
3. **Approved trials.** Search Drive for `title contains 'MPA '` in the "Molding Parameter – for Claude" folder. For each doc whose trial id is not yet imported: `read_file_content`, copy the returned text EXACTLY (every line, as returned) into a scratch file, then `node tools/run.js import-trial <file>`. If it reports a copy-check failure, copy again more carefully.
4. `node tools/run.js apply` (env MPA_CODE, MPA_TPL_KEY, MPA_SCRIPT_URL) – makes missing PDFs, refreshes the app field list and config.js.
5. Commit `data/` and `config.js` ("Claude run <date>"), `git fetch`, rebase if needed, push to main. Never commit plain JSON, photos, PDFs, templates, node_modules or secrets.
6. Summary (2–4 lines): approved trials imported, PDFs made. If Google Drive or GitHub failed, say which.

Rules: report only what the docs show. Machine settings only – no personal data.
