# Run now – what Claude does

Scheduled task "Molding Parameter – read photos", run only when Rashid presses **Run now**.
Secrets (passcode, template key, script link) are in the task prompt – never write them into the repo.

Sources:
- **Photos:** Microsoft Teams → team "NPI 2026" → channel "Molding Trials" (ids in `tools/teams.json`). Each post's text (subject or body) holds a trial code like `AR26-0927-1`; photos are attached to the post or to replies in its thread.
- **Approved trials:** Google Drive folder "Molding Parameter – for Claude" – one Google Doc per approved trial, named `MPA <trialId> Rev <n> <code>`.
- **Output:** this repo (`molding-param`, GitHub Pages). Everything written to `data/` is encrypted with the team passcode.

## Steps
1. Clone the repo; `cd tools && npm install --no-audit --no-fund`.
2. `node tools/run.js status` (with MPA_CODE) → attachment ids already read, approved trials already imported.
3. **Teams photos.** List the channel's top-level messages with `teams_list_channel_messages` (teamId/channelId from teams.json; page with `cursor` until you reach messages older than the last run) and, for each post, its replies (`parentMessageId`).
   For every image attachment (jpg/jpeg/png/heic) whose attachment id is not in `teamsAttachmentsDone`:
   - Trial code: from the post subject/body (reply → use its parent post's code). `node tools/run.js brand <code>` gives the machine and brand.
   - Open the photo with `read_resource` on `file:///<driveId>/Molding Trials/<attachment name>` (the name is the end of the attachment's contentUrl; files in sub-folders keep their path after "Molding Trials/"). The result shows the image and the local file path it was saved to.
   - Using `tools/READING-GUIDE.md` for that brand: decide the screen id, then read only that screen's field keys. Copy digits exactly, "low" confidence when unsure, never guess.
   - Add an entry to a scratch `readings.json` (outside the repo):
     `{"code":"AR26-0927-1","screen":"barrel","attachmentId":"<id>","file":"<local image path>","messageUrl":"<webUrl>","postedAt":"<createdDateTime>","postedBy":"<name>","ok":true,"seen":"BARREL-OIL TEMPERATURE","values":{"bt_noz":{"value":"240.0","confidence":"high"}},"actuals":{"bt_noz":"231.2"},"other":[],"warnings":[]}`
   - No trial code in the post, or a code whose machine is unknown → still add the entry (code as found or "") so it is listed in the app as a photo without a trial.
4. **Approved trials.** Search Drive for `title contains 'MPA '` in the "Molding Parameter – for Claude" folder. For each doc whose trial id is not yet imported: `read_file_content`, copy the returned text EXACTLY (every line, as returned) into a scratch file, then `node tools/run.js import-trial <file>`. If it reports a copy-check failure, copy again more carefully.
5. `node tools/run.js apply readings.json` (env MPA_CODE, MPA_TPL_KEY, MPA_SCRIPT_URL) – stores the photos (resized, encrypted) and readings, makes missing PDFs, refreshes the app field list and config.js. Run it even with no new photos (use no file argument): it makes PDFs and sets the app up on the first run.
6. Commit `data/` and `config.js` ("Claude run <date>"), `git fetch`, rebase if needed, push to main. Never commit plain JSON, photos, PDFs, templates or secrets.
7. Summary (3–6 lines): posts read per trial code (screens, values, low-confidence or unrecognised photos), photos without a trial code, PDFs made. If Teams, Drive or GitHub failed, say which.

Rules: report only what the photos and docs show. Machine settings only – no personal data.
