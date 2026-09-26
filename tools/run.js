// Helper for the "Run now" Claude task. See tools/RUN.md.
// Env: MPA_CODE (team passcode), MPA_TPL_KEY (key for the EXZONE form templates), MPA_SCRIPT_URL (Google script link).
//
//   node tools/run.js status                 what is already done (Teams attachments read, approved trials, PDFs)
//   node tools/run.js brand <trial code>     machine + brand for a trial code, e.g. AR26-0927-1
//   node tools/run.js import-trial <txt>     add an approved trial copied from its Google Doc (checks it is complete)
//   node tools/run.js apply [readings.json]  store photo readings, make missing PDFs, write the encrypted data files
//   node tools/run.js lock-templates <dir>   (setup only) encrypt the EXZONE form templates into tools/templates.enc.json
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const { encrypt, decrypt } = require('./crypto');
const REPO = path.join(__dirname, '..');
const RES = path.join(REPO, 'data', 'results.enc.json');
const CODE = process.env.MPA_CODE;
const [cmd, arg] = process.argv.slice(2);
const need = (v, n) => { if (!v) { console.error(`Set ${n}`); process.exit(1); } };
const myt = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 19);
const load = () => fs.existsSync(RES) ? JSON.parse(decrypt(fs.readFileSync(RES, 'utf8'), CODE).toString('utf8')) : {};
function norm(r) { return { version: 2, trials: {}, approved: {}, pdfs: {}, orphans: [], teams: { done: [] }, ...r }; }
const save = r => { r.updatedAt = myt(); fs.writeFileSync(RES, encrypt(Buffer.from(JSON.stringify(r)), CODE)); JSON.parse(decrypt(fs.readFileSync(RES, 'utf8'), CODE).toString('utf8')); };
const MACHINES = require('./lib/machines.json');
const machineOf = code => { const pre = String(code).split('-')[0].toUpperCase(); return MACHINES.find(m => m.no.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === pre); };

function check(lines) { let h = 7; const s = lines.join('\n'); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 2147483647; return lines.length + '/' + h; }
function importTrial(text) {
  // Google Docs text comes back Markdown-escaped (\_ \* \[ ...): undo that, drop blank lines
  const lines = text.replace(/\r/g, '').split('\n').map(l => l.replace(/\\([\\`*_{}\[\]()#+\-.!|>~<="&'])/g, '$1').trim()).filter(Boolean);
  if (lines[0] !== 'MPA-TRIAL v1') throw new Error('Not an MPA trial doc (first line must be "MPA-TRIAL v1")');
  const ci = lines.findIndex(l => l.startsWith('CHECK='));
  if (ci < 0) throw new Error('CHECK line missing – copy the whole document');
  const body = lines.slice(1, ci), want = lines[ci].slice(6), got = check(body);
  if (want !== got) throw new Error(`Copy check failed (doc ${want}, copied ${got}) – re-read the document and copy every line exactly`);
  const t = {};
  for (const l of body) {
    const i = l.indexOf('='); const p = l.slice(0, i).split('.'); let v = l.slice(i + 1);
    const last = p[p.length - 1];
    if (last === 'ok') v = v === 'true';
    else if (['rev', 'baseRev', 'from'].includes(last) && /^-?\d+$/.test(v)) v = Number(v);
    let o = t; p.slice(0, -1).forEach((k, j) => { const nk = p[j + 1]; o = o[k] = o[k] || (/^\d+$/.test(nk) ? [] : {}); }); o[last] = v;
  }
  t.values = t.values || {}; t.actuals = t.actuals || {}; t.people = t.people || {}; t.photos = {};
  if (t.approval && !Array.isArray(t.approval.changes)) t.approval.changes = Object.values(t.approval.changes || {});
  return t;
}

if (cmd === 'lock-templates') {
  need(process.env.MPA_TPL_KEY, 'MPA_TPL_KEY');
  const files = Object.fromEntries(fs.readdirSync(arg).map(f => [f, fs.readFileSync(path.join(arg, f)).toString('base64')]));
  fs.writeFileSync(path.join(__dirname, 'templates.enc.json'), encrypt(Buffer.from(JSON.stringify(files)), process.env.MPA_TPL_KEY));
  console.log('templates locked:', Object.keys(files).join(', '));
  process.exit(0);
}
need(CODE, 'MPA_CODE');
const r = norm(load());

if (cmd === 'status') {
  const key = t => `${t.brand}|${t.machine.no}|${String((t.values.mould_code || {}).v || '').trim().toUpperCase()}`;
  console.log(JSON.stringify({
    lastRun: r.updatedAt || null,
    teamsAttachmentsDone: r.teams.done,
    approvedTrialsImported: Object.values(r.approved).map(t => `${t.id} Rev ${t.rev} ${t.code}`),
    pdfsMissing: Object.values(r.approved).filter(t => !(r.pdfs[t.id] && r.pdfs[t.id].rev === t.rev)).map(t => t.id),
  }, null, 1));
} else if (cmd === 'brand') {
  const m = machineOf(arg); console.log(m ? JSON.stringify({ machine: m.no, brand: m.maker, model: m.model }) : 'unknown machine in code ' + arg);
} else if (cmd === 'import-trial') {
  const t = importTrial(fs.readFileSync(arg, 'utf8'));
  const key = x => `${x.brand}|${x.machine.no}|${String((x.values.mould_code || {}).v || '').trim().toUpperCase()}`;
  for (const o of Object.values(r.approved)) if (o.id !== t.id && key(o) === key(t) && o.rev < t.rev) o.status = 'Superseded';
  r.approved[t.id] = t; save(r);
  console.log(`imported ${t.id} ${t.code} Rev ${t.rev} (${Object.keys(t.values).length} values)`);
} else if (cmd === 'apply') {
  const list = arg ? JSON.parse(fs.readFileSync(arg, 'utf8')) : [];
  let n = 0;
  for (const x of list) {
    if (x.attachmentId && r.teams.done.includes(x.attachmentId)) continue;
    const code = String(x.code || '').toUpperCase();
    let photo = null;
    if (x.file && fs.existsSync(x.file)) {
      const tmp = path.join(os.tmpdir(), 'mpa-photo.jpg');
      try { execFileSync('python3', ['-c', `from PIL import Image, ImageOps; im=ImageOps.exif_transpose(Image.open(${JSON.stringify(x.file)})).convert('RGB'); im.thumbnail((1600,1600)); im.save(${JSON.stringify(tmp)}, quality=82)`]); }
      catch { fs.copyFileSync(x.file, tmp); }
      const rel = `data/photos/${code || 'no-code'}/${x.screen || 'unknown'}-${String(x.attachmentId || Date.now()).slice(0, 8)}.enc`;
      fs.mkdirSync(path.dirname(path.join(REPO, rel)), { recursive: true });
      fs.writeFileSync(path.join(REPO, rel), encrypt(fs.readFileSync(tmp), CODE));
      photo = rel;
    }
    const values = {};
    for (const [k, v] of Object.entries(x.values || {})) {
      const val = v && typeof v === 'object' ? v.value : v;
      if (val == null || String(val).trim() === '') continue;
      values[k] = { value: String(val).trim(), confidence: v && v.confidence === 'high' ? 'high' : 'low', why: (v && v.why) || '' };
    }
    const rec = { photo, at: myt(), postedAt: x.postedAt || '', postedBy: x.postedBy || '', msg: x.messageUrl || '', ok: x.ok !== false, seen: x.seen || '',
      values, actuals: x.actuals || {}, other: (x.other || []).slice(0, 15), warnings: x.warnings || [] };
    if (!code || !machineOf(code)) r.orphans.push({ ...rec, code, note: x.note || 'No trial code in the Teams post' });
    else {
      const tr = r.trials[code] = r.trials[code] || { screens: {}, unmatched: [] };
      if (!x.screen || x.screen === 'unknown' || rec.ok === false) tr.unmatched.push(rec); else tr.screens[x.screen] = rec;
    }
    if (x.attachmentId) r.teams.done.push(x.attachmentId);
    n++;
  }
  r.orphans = r.orphans.slice(-50);
  save(r);
  // PDFs for approved trials that don't have one yet
  const todo = Object.values(r.approved).filter(t => !(r.pdfs[t.id] && r.pdfs[t.id].rev === t.rev));
  if (todo.length) {
    need(process.env.MPA_TPL_KEY, 'MPA_TPL_KEY');
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mpa-'));
    const tpl = JSON.parse(decrypt(fs.readFileSync(path.join(__dirname, 'templates.enc.json'), 'utf8'), process.env.MPA_TPL_KEY).toString('utf8'));
    fs.mkdirSync(path.join(work, 'templates')); fs.mkdirSync(path.join(work, 'trials')); fs.mkdirSync(path.join(work, 'photos'));
    for (const [f, b] of Object.entries(tpl)) fs.writeFileSync(path.join(work, 'templates', f), Buffer.from(b, 'base64'));
    for (const t of Object.values(r.approved)) {
      const c = JSON.parse(JSON.stringify(t)); c.photos = {};
      const tr = r.trials[String(t.code || '').toUpperCase()];
      if (tr) for (const [sc, rec] of Object.entries(tr.screens)) {
        if (!rec.photo || !fs.existsSync(path.join(REPO, rec.photo))) continue;
        fs.mkdirSync(path.join(work, 'photos', t.id), { recursive: true });
        fs.writeFileSync(path.join(work, 'photos', t.id, sc + '.jpg'), decrypt(fs.readFileSync(path.join(REPO, rec.photo), 'utf8'), CODE));
        c.photos[sc] = [{ file: sc + '.jpg', at: rec.postedAt || rec.at, by: rec.postedBy || '', read: { at: rec.at, model: 'Claude' } }];
      }
      fs.writeFileSync(path.join(work, 'trials', t.id + '.json'), JSON.stringify(c));
    }
    fs.mkdirSync(path.join(REPO, 'data', 'pdf'), { recursive: true });
    for (const t of todo) {
      const out = path.join(work, t.id + '.pdf');
      execFileSync('node', [path.join(__dirname, 'make-pdf.js'), t.id, out], { stdio: 'inherit', env: { ...process.env, MPA_DATA: work, MPA_TEMPLATES: path.join(work, 'templates') } });
      const rel = `data/pdf/${t.id}-r${t.rev}.enc`;
      fs.writeFileSync(path.join(REPO, rel), encrypt(fs.readFileSync(out), CODE));
      r.pdfs[t.id] = { rev: t.rev, file: rel, at: myt() };
      console.log('PDF', t.code, 'Rev', t.rev);
    }
    fs.rmSync(work, { recursive: true, force: true });
  }
  // App field list and Google script link (rewritten only when changed)
  const metaTmp = path.join(os.tmpdir(), 'mpa-meta.json');
  execFileSync('node', [path.join(__dirname, 'build-meta.js'), metaTmp], { stdio: 'ignore' });
  const meta = fs.readFileSync(metaTmp), mf = path.join(REPO, 'data', 'meta.enc.json');
  let same = false; try { same = decrypt(fs.readFileSync(mf, 'utf8'), CODE).equals(meta); } catch {}
  if (!same) { fs.writeFileSync(mf, encrypt(meta, CODE)); console.log('meta updated'); }
  if (process.env.MPA_SCRIPT_URL) {
    const cfg = `// Web app URL of the Google Apps Script.\nwindow.MPA_CONFIG = { scriptUrl: ${JSON.stringify(process.env.MPA_SCRIPT_URL)} };\n`;
    const cf = path.join(REPO, 'config.js');
    if (fs.readFileSync(cf, 'utf8') !== cfg) { fs.writeFileSync(cf, cfg); console.log('config.js updated'); }
  }
  save(r);
  console.log(`photos stored: ${n}; results written`);
} else { console.error('unknown command – see the top of tools/run.js'); process.exit(1); }
