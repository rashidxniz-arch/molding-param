// Child process used by run.js: makes one PDF. Env: MPA_DATA (temp dir with trials/ and photos/), MPA_TEMPLATES.
// Usage: node tools/make-pdf.js <trialId> <out.pdf>
const fs = require('fs');
const store = require('./lib/store');
const pdf = require('./lib/pdf');
const [id, out] = process.argv.slice(2);
const t = store.get(id);
if (!t) { console.error('No trial ' + id); process.exit(1); }
const key = x => `${x.brand}|${x.machine.no}|${String((x.values.mould_code || {}).v || '').trim().toUpperCase()}`;
const chain = store.all().filter(x => (x.status === 'Approved' || x.status === 'Superseded') && key(x) === key(t)).sort((a, b) => a.rev - b.rev);
pdf.build(t, chain).then(buf => { fs.writeFileSync(out, buf); console.log('wrote', out, buf.length, 'bytes'); });
