// Writes the app's field/screen/machine list (meta.json) and the photo reading guide (READING-GUIDE.md).
// Usage: node tools/build-meta.js <out meta.json>
const fs = require('fs'), path = require('path');
const { PROFILES, HEADER_GROUPS } = require('./lib/profiles');
const MACHINES = require('./lib/machines.json');
const version = require('./package.json').version;
const profiles = Object.fromEntries(Object.entries(PROFILES).map(([b, p]) => [b, {
  brand: b, form: p.form, title: p.title,
  sections: p.sections.map(s => ({ id: s.id, title: s.title, fields: s.fields.map(({ k, label, unit, tol, note, cell }) => ({ k, label, unit, tol, note, onForm: !!cell })) })),
  screens: p.screens.map(({ id, title, page, hint, read, fields, actuals }) => ({ id, title, page, hint, read, fields, actuals: actuals || [] })),
}]));
const out = process.argv[2] || 'meta.json';
const teams = require('./teams.json');
fs.writeFileSync(out, JSON.stringify({ version, profiles, header: HEADER_GROUPS, machines: MACHINES, teams: { channel: teams.channelName, team: teams.teamName, link: teams.link } }));
console.log('wrote', out);

let md = `# How to read the machine-screen photos\n\nGenerated from tools/lib/profiles.js – do not edit by hand (run \`node tools/build-meta.js\`).\n\n` +
  `General rules\n- Copy each number exactly as displayed, keeping the decimals shown (e.g. "240.0", "0.10"). Do not convert units. Numbers as strings.\n` +
  `- If a field is not on the photo or cannot be read, leave it out. Never guess.\n` +
  `- confidence "high" only when the digits are sharp and the mapping to the field is certain; otherwise "low" with a short reason in "why".\n` +
  `- A clearly displayed 0 / 0.0 is a real value – include it.\n` +
  `- First decide which screen the photo shows (page title / layout, see the screen list for the machine's brand). Use that screen id. If it matches none, use screen "unknown" and say what it shows in "seen".\n` +
  `- Add up to 15 other clearly readable settings that are not in the field list under "other" ({label, value, unit}).\n\n`;
for (const p of Object.values(PROFILES)) {
  md += `## ${p.brand} (${p.form})\n\n`;
  for (const sc of p.screens) {
    md += `### screen \`${sc.id}\` – ${sc.title} (page: ${sc.page})\n${sc.read}\n\nFields (key: meaning [unit]):\n`;
    for (const k of sc.fields) { const f = p.fieldMap[k]; md += `- \`${k}\`: ${f.label}${f.unit ? ' [' + f.unit + ']' : ''}\n`; }
    if (sc.actuals) md += `\nAlso report ACTUAL (measured) values under "actuals" for: ${sc.actuals.join(', ')}\n`;
    md += '\n';
  }
}
fs.writeFileSync(path.join(__dirname, 'READING-GUIDE.md'), md);
console.log('wrote READING-GUIDE.md');
