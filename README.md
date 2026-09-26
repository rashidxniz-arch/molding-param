# Exzone Molding Parameter (team app)

Team web app (PWA) for the Exzone NPI / moulding team. Open the site link, enter the team passcode and your name, then Share → "Add to Home Screen".

1. Create the trial in the app – it gets a trial code (e.g. `AR26-0927-1`).
2. Post the machine-screen photos in Teams → NPI 2026 → Molding Trials, with the trial code as the post text.
3. Rashid presses **Run now** on his Claude scheduled task: Claude reads the photos and makes the EXZONE PDFs for approved trials.
4. Check and tick the values in the app, then submit and approve.

- Trials, values and sign-offs: private Google Sheet through a Google Apps Script (`tools/Code.gs`; its link is in `config.js`).
- `data/` is written only by Claude and is encrypted with the team passcode (PBKDF2-SHA256 → AES-256-GCM). The EXZONE form templates are encrypted separately (`tools/templates.enc.json`). Never commit plain data.
- `tools/RUN.md` – what the Run now task does.
