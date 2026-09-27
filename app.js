/* EXZONE Molding Parameter – team PWA
 * Trials, typed values and sign-offs live in a private Google Sheet (via the Google Apps Script).
 * Technicians take the machine-screen photos in the app: the Google script saves each photo in Drive and
 * has Claude (Anthropic API) read the values straight back to the phone.
 * When Rashid presses "Run now", his Claude makes the approved EXZONE PDFs and publishes them here
 * encrypted with the team passcode (data/results.enc.json, data/pdf).
 */
'use strict';
const SCRIPT_URL = (window.MPA_CONFIG && window.MPA_CONFIG.scriptUrl) || '';
let AI_ON = null, META = null, RESULTS = { trials: {}, pdfs: {}, orphans: [] }, TRIALS = [], T = null, FILTER = 'All', Q = '';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = { get(k, d = '') { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} }, del(k) { try { localStorage.removeItem(k); } catch {} } };
let CODE = ls.get('mpa.code');
const me = () => ls.get('mpa.name');
const fmtD = iso => iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const fmtDT = iso => iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
function toast(msg, bad) { const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), bad ? 6000 : 2500); }

// ---------------------------------------------------------------- encrypted files (same format as the NPI Tracker)
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function decryptBytes(enc, pass) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(enc.salt), iterations: enc.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(enc.iv) }, key, b64(enc.ct)));
}
async function fetchEnc(path) {
  const r = await fetch(path + '?t=' + Date.now(), { cache: 'no-store' }).catch(() => fetch(path));
  if (!r.ok) throw new Error('missing ' + path);
  return r.json();
}
async function loadEncJson(path, pass) { return JSON.parse(new TextDecoder().decode(await decryptBytes(await fetchEnc(path), pass))); }

// ---------------------------------------------------------------- Google script
async function sget(params = {}) {
  if (!SCRIPT_URL || SCRIPT_URL.startsWith('PASTE')) throw new Error('The Google script link is not set yet (config.js)');
  const q = new URLSearchParams({ code: CODE, ...params });
  const r = await fetch(SCRIPT_URL + '?' + q.toString());
  const j = await r.json();
  if (!j.ok) throw new Error(j.error === 'bad_code' ? 'Wrong passcode' : j.error || 'Server error');
  return j;
}
async function spost(payload) {
  const r = await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify({ ...payload, code: CODE, who: me() }) });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'Server error');
  if (j.trials) TRIALS = j.trials;
  if (j.trial) { const i = TRIALS.findIndex(x => x.id === j.trial.id); if (i >= 0) TRIALS[i] = j.trial; else TRIALS.push(j.trial); if (T && T.id === j.trial.id) T = j.trial; }
  return j;
}
async function reload() {
  const [tr, res] = await Promise.all([sget(), loadEncJson('data/results.enc.json', CODE).catch(() => ({}))]);
  TRIALS = tr.trials; AI_ON = tr.ai; RESULTS = { trials: {}, pdfs: {}, orphans: [], ...res };
  if (T) T = TRIALS.find(x => x.id === T.id) || null;
  chip();
}

// ---------------------------------------------------------------- helpers: fields, limits, readings
function limits(fl, value) {
  const v = parseFloat(value);
  if (!fl || !fl.tol || value === '' || value == null || isNaN(v)) return null;
  const [type, n] = fl.tol, d = type === 'rel' ? Math.abs(v) * n / 100 : n, r = x => Math.round(x * 100) / 100;
  return { min: r(Math.max(0, v - d)), max: r(v + d), text: type === 'rel' ? `±${n}%` : `±${n}` };
}
const prof = t => META.profiles[(t || T).brand];
function fieldDef(k, t) {
  const p = prof(t);
  for (const s of p.sections) { const f = s.fields.find(x => x.k === k); if (f) return { ...f, section: s.title, param: true }; }
  for (const g of META.header) { const f = g.fields.find(x => x.k === k); if (f) return { ...f, section: g.title }; }
  return { k, label: k, unit: '' };
}
// Photo readings: new ones are stored on the trial (t.reads); older ones came from Teams via Run now
function readsOf(t) {
  const old = RESULTS.trials[String(t.code || '').toUpperCase()] || { screens: {}, unmatched: [] };
  return { screens: { ...old.screens, ...(t.reads || {}) }, unmatched: [...(old.unmatched || []), ...(t.unmatched || [])] };
}
const readingFor = (t, sc) => readsOf(t).screens[sc] || null;
// Values as shown: what the team saved, plus Claude's readings (purple) where nothing is saved yet
function view(t) {
  const vals = {}, act = { ...(t.actuals || {}) };
  for (const [k, x] of Object.entries(t.values)) vals[k] = { ...x };
  for (const sc of prof(t).screens) {
    const rd = readingFor(t, sc.id);
    if (!rd) continue;
    for (const [k, x] of Object.entries(rd.values || {})) {
      if (!vals[k]) vals[k] = { v: x.value, src: 'ai', conf: x.confidence, why: x.why, ok: false, suggested: true };
      else if (vals[k].v !== '' && String(vals[k].v) !== String(x.value) && Number(vals[k].v) !== Number(x.value)) vals[k].readV = x.value;
    }
    for (const [k, a] of Object.entries(rd.actuals || {})) if (act[k] == null) act[k] = a;
  }
  return { vals, act };
}
const keyOf = t => `${t.brand}|${t.machine.no}|${String((t.values.mould_code || {}).v || '').trim().toUpperCase()}`;
const baselineOf = t => TRIALS.filter(x => x.id !== t.id && x.status === 'Approved' && keyOf(x) === keyOf(t)).sort((a, b) => b.rev - a.rev)[0] || null;
const chainOf = t => TRIALS.filter(x => (x.status === 'Approved' || x.status === 'Superseded') && keyOf(x) === keyOf(t)).sort((a, b) => a.rev - b.rev);
const sv = (t, k) => (t.values[k] && t.values[k].v != null ? String(t.values[k].v).trim() : '');
function changesVs(t, base) {
  if (!base) return [];
  const out = [];
  for (const s of prof(t).sections) for (const fl of s.fields) {
    const a = sv(base, fl.k), b = sv(t, fl.k);
    if (a === b || (a !== '' && b !== '' && Number(a) === Number(b))) continue;
    const lim = limits(fl, a);
    out.push({ k: fl.k, label: `${s.title} – ${fl.label}`, from: a || '(blank)', to: b || '(blank)', outside: lim && b !== '' && !isNaN(+b) ? (+b < lim.min || +b > lim.max) : false });
  }
  return out;
}
const readCount = t => Object.keys(readsOf(t).screens).length;
function checks(t) {
  const { vals } = view(t), mustFix = [], advice = [];
  for (const k of ['mould_code', 'part_no', 'part_name']) if (!sv(t, k)) mustFix.push(`${fieldDef(k, t).label} is empty`);
  if (!t.people.set_by) mustFix.push('“Set by” (technician name) is empty');
  const un = Object.entries(vals).filter(([k, x]) => x.v !== '' && x.v != null && !x.ok).length;
  if (un) mustFix.push(`${un} value(s) not yet checked against the photo`);
  if (!prof(t).sections.flatMap(s => s.fields).some(f => sv(t, f.k) !== '')) mustFix.push('No machine parameters yet');
  for (const sc of prof(t).screens) if (!readingFor(t, sc.id) && !sc.fields.some(k => vals[k] && vals[k].v !== '')) advice.push(`No photo read for “${sc.title}”`);
  const base = baselineOf(t);
  if (base) { const out = changesVs(t, base).filter(c => c.outside).length; if (out) advice.push(`${out} value(s) are outside the window of approved Rev ${base.rev}`); }
  return { mustFix, advice };
}
const editable = () => T.status === 'Draft';

// ---------------------------------------------------------------- router
window.addEventListener('hashchange', route);
async function route() {
  if (!CODE || !META) return renderUnlock();
  const h = location.hash.replace(/^#/, '') || '/';
  const m = h.match(/^\/t\/([^/]+)(?:\/(\w+))?/);
  try {
    if (h.startsWith('/new')) return renderNew();
    if (m) { T = TRIALS.find(x => x.id === m[1]); if (!T) { await reload(); T = TRIALS.find(x => x.id === m[1]); } if (!T) throw new Error('Trial not found'); return renderTrial(m[2] || 'photos'); }
    T = null; renderHome();
  } catch (e) { $('#app').innerHTML = `<div class="card note bad">${esc(e.message)}</div><a class="btn" href="#/">← Back</a>`; }
}

// ---------------------------------------------------------------- unlock
function renderUnlock(err) {
  $('#app').innerHTML = `<div class="unlock card">
    <img src="brand/npi-logo-full.png" alt="New Gen NPI">
    <h1>Molding <span style="color:var(--navy)">Parameter</span></h1>
    <p class="muted small">Enter the team passcode.</p>
    <input type="password" id="pc" autocomplete="current-password" placeholder="Passcode">
    <label class="f" style="text-align:left">Your name</label><input type="text" id="nm" value="${esc(me())}" placeholder="e.g. Ali">
    ${err ? `<div class="note bad">${esc(err)}</div>` : ''}
    <button class="btn primary" id="go" style="margin-top:12px;width:100%;justify-content:center">Open</button></div>`;
  const go = async () => {
    const pc = $('#pc').value.trim(), nm = $('#nm').value.trim();
    if (nm) ls.set('mpa.name', nm);
    if (!pc || !nm) return renderUnlock('Enter the passcode and your name');
    $('#go').disabled = true; $('#go').textContent = 'Opening…';
    try { META = await loadEncJson('data/meta.enc.json', pc); }
    catch (e) { return renderUnlock(/missing/.test(e.message) ? 'The app is not set up yet – Rashid: press Run now once in your Claude app' : 'Wrong passcode'); }
    CODE = pc; ls.set('mpa.code', pc); ls.set('mpa.name', nm);
    try { await reload(); } catch (e) { return renderUnlock(e.message); }
    route();
  };
  $('#go').onclick = go; $('#pc').onkeydown = e => { if (e.key === 'Enter') go(); };
}
function chip() {
  const c = $('#aiChip');
  c.className = 'chip ai' + (AI_ON ? '' : ' off');
  c.textContent = AI_ON ? 'AI reading' : 'AI off';
  c.title = AI_ON ? 'Photos are read by Claude as soon as you take them' : 'No API key in the Google script – type the values by hand';
}

// ---------------------------------------------------------------- home
function renderHome() {
  const q = Q.toLowerCase();
  const rows = TRIALS.filter(t => (FILTER === 'All' || t.status === FILTER) && (!q || [t.machine.no, t.brand, sv(t, 'mould_code'), sv(t, 'part_no'), sv(t, 'part_name'), sv(t, 'customer'), t.trialNo].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const count = s => TRIALS.filter(t => s === 'All' || t.status === s).length;
  const pdfN = TRIALS.filter(t => t.status === 'Approved' && !(RESULTS.pdfs[t.id] && RESULTS.pdfs[t.id].rev === t.rev)).length;
  $('#app').innerHTML = `
    <section class="hero">
      <img src="brand/npi-logo-full.png" alt="New Gen NPI – Innovate, Collaborate, Deliver">
      <div>
        <h1>Molding <span>Parameter</span></h1>
        <div class="tag">New trial <i>→</i> photo each screen <i>→</i> Claude reads <i>→</i> check <i>→</i> EXZONE PDF</div>
        <p>Create the trial and take a photo of each machine screen in the app. Claude reads the values in a few seconds – you check them against the photo, tick, and sign off.</p>
        <div class="row" style="justify-content:inherit"><a class="btn primary" href="#/new">＋ New trial</a><button class="btn" id="refresh">↻ Refresh</button></div>
      </div>
    </section>
    ${pdfN ? `<div class="banner wait"><span>⏳</span><div><b class="h">${pdfN} approved PDF(s) to make</b>Rashid: open the Claude app → scheduled task “Molding Parameter – read photos” → <b>Run now</b>. Then press Refresh here.</div></div>` : ''}
    ${AI_ON === false ? `<div class="banner"><span>ℹ</span><div><b class="h">Photo reading is off</b>Photos are saved, but the values must be typed by hand until the API key is added to the Google script.</div></div>` : ''}
    <input type="search" id="q" placeholder="Search machine, mould code, part no…" value="${esc(Q)}">
    <div class="filters">${['All', 'Draft', 'Review', 'Approved', 'Superseded'].map(s => `<button data-f="${s}" class="${FILTER === s ? 'on' : ''}">${s} (${count(s)})</button>`).join('')}</div>
    <div class="list">${rows.map(t => {
      const scr = prof(t).screens.length, shots = readCount(t);
      return `<a class="card item" href="#/t/${t.id}">
        <div><b>${esc(t.machine.no)}</b> <span class="chip ${t.brand}">${t.brand}</span> · <b>${esc(sv(t, 'mould_code') || '—')}</b> ${esc(sv(t, 'part_no'))}
          <div class="small muted">${esc(sv(t, 'part_name'))}${sv(t, 'customer') ? ' · ' + esc(sv(t, 'customer')) : ''}${t.trialNo ? ' · Trial ' + esc(t.trialNo) : ''}</div></div>
        <div style="text-align:right"><span class="chip ${t.status}">${t.status}${t.rev != null ? ' · Rev ' + t.rev : ''}</span>
          <div class="small muted">${esc(t.code || '')} · ${shots}/${scr} screens read · ${fmtD(t.updatedAt)}</div></div>
      </a>`; }).join('') || `<div class="empty-state">No trials yet.<br><br><a class="btn primary" href="#/new">＋ Start the first trial</a></div>`}</div>
    <p class="small muted">Nissei (MSU-009-01) and Arburg (MSU-012-02). Signed in as <b>${esc(me())}</b> · <a href="#" id="signout">sign out</a> · v${esc(META.version)}</p>`;
  $('#q').oninput = e => { Q = e.target.value; const pos = e.target.selectionStart; renderHome(); const el = $('#q'); el.focus(); el.setSelectionRange(pos, pos); };
  document.querySelectorAll('[data-f]').forEach(b => (b.onclick = () => { FILTER = b.dataset.f; renderHome(); }));
  $('#refresh').onclick = async () => { try { await reload(); renderHome(); toast('Updated'); } catch (e) { toast(e.message, true); } };
  $('#signout').onclick = e => { e.preventDefault(); ls.del('mpa.code'); CODE = ''; META = null; renderUnlock(); };
}

// ---------------------------------------------------------------- new trial
function renderNew() {
  const sup = META.machines.filter(m => META.profiles[m.maker]);
  const other = META.machines.filter(m => !META.profiles[m.maker]);
  const approved = TRIALS.filter(t => t.status === 'Approved');
  const pre = (location.hash.split('?')[1] || '').replace('from=', '');
  const src = approved.find(t => t.id === pre);
  $('#app').innerHTML = `
    <a href="#/" class="small">← Back</a><h1>New trial</h1>
    <div class="card">
      <label class="f">Machine *</label>
      <select id="n_machine"><option value="">Pick the machine…</option>
        ${['NISSEI', 'ARBURG'].map(b => `<optgroup label="${b}">${sup.filter(m => m.maker === b).map(m => `<option value="${m.no}" ${src && src.machine.no === m.no ? 'selected' : ''}>${m.no} – ${esc(m.model)} ${esc(m.ton)} (${esc(m.section)})</option>`).join('')}</optgroup>`).join('')}
        <optgroup label="Not set up yet">${other.map(m => `<option disabled>${m.no} – ${esc(m.maker || 'maker unknown')} ${esc(m.model)} ${esc(m.ton)}</option>`).join('')}</optgroup>
      </select>
      <div class="grid2">
        <div><label class="f">Mould code *</label><input type="text" id="n_mould" autocapitalize="characters" value="${esc(src ? sv(src, 'mould_code') : '')}"></div>
        <div><label class="f">Part no. *</label><input type="text" id="n_partno" autocapitalize="characters" value="${esc(src ? sv(src, 'part_no') : '')}"></div>
        <div><label class="f">Part name *</label><input type="text" id="n_partname" value="${esc(src ? sv(src, 'part_name') : '')}"></div>
        <div><label class="f">Customer</label><input type="text" id="n_customer" value="${esc(src ? sv(src, 'customer') : '')}"></div>
        <div><label class="f">Trial no.</label><input type="text" id="n_trial" placeholder="e.g. T1"></div>
        <div><label class="f">Trial date</label><input type="date" id="n_date" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div><label class="f">Copy values from an approved standard (optional)</label>
          <select id="n_copy"><option value="">— none —</option>${approved.map(t => `<option value="${t.id}" ${src && src.id === t.id ? 'selected' : ''}>${esc(t.machine.no)} · ${esc(sv(t, 'mould_code'))} ${esc(sv(t, 'part_no'))} · Rev ${t.rev}</option>`).join('')}</select>
          <div class="small muted">Same machine: all values are copied, so only changed screens need new photos. Other machine: part &amp; material info only.</div></div>
      </div>
      <div class="row" style="margin-top:14px"><span class="sp"></span><button class="btn primary" id="n_go">Create trial →</button></div>
    </div>`;
  $('#n_copy').onchange = e => {
    const s = approved.find(t => t.id === e.target.value); if (!s) return;
    for (const [id, k] of [['n_mould', 'mould_code'], ['n_partno', 'part_no'], ['n_partname', 'part_name'], ['n_customer', 'customer']]) if (!$('#' + id).value) $('#' + id).value = sv(s, k);
  };
  $('#n_go').onclick = async () => {
    const m = META.machines.find(x => x.no === $('#n_machine').value);
    if (!m || !$('#n_mould').value.trim() || !$('#n_partno').value.trim() || !$('#n_partname').value.trim()) return toast('Fill in the fields marked *', true);
    const values = {};
    const s = approved.find(t => t.id === $('#n_copy').value);
    if (s) {
      const same = s.machine.no === m.no;
      const headerKeys = META.header.flatMap(g => g.fields.map(f => f.k));
      for (const [k, x] of Object.entries(s.values)) if (k !== 'remarks' && x.v !== '' && (same || headerKeys.includes(k))) values[k] = { v: x.v, ok: true, src: 'copy', from: s.rev };
    }
    Object.assign(values, { mould_code: { v: $('#n_mould').value.trim(), ok: true }, part_no: { v: $('#n_partno').value.trim(), ok: true }, part_name: { v: $('#n_partname').value.trim(), ok: true } });
    if ($('#n_customer').value.trim()) values.customer = { v: $('#n_customer').value.trim(), ok: true };
    $('#n_go').disabled = true;
    try {
      const j = await spost({ op: 'create', trial: { machine: m, brand: m.maker, trialNo: $('#n_trial').value.trim(), trialDate: $('#n_date').value, values, copiedFrom: s ? `${s.machine.no} ${sv(s, 'mould_code')} Rev ${s.rev}` : '' } });
      T = j.trial; location.hash = '#/t/' + T.id + '/photos';
    } catch (e) { toast(e.message, true); $('#n_go').disabled = false; }
  };
}

// ---------------------------------------------------------------- trial page
function toCheck() { const { vals } = view(T); return Object.values(vals).filter(x => x.v !== '' && x.v != null && !x.ok).length; }
function renderTrial(tab) {
  const p = prof();
  const base = baselineOf(T);
  const approvedLine = T.approval && (T.status === 'Approved' || T.status === 'Superseded')
    ? `Approved ${fmtD(T.approval.at)} by ${esc(T.people.approved_by)}${T.approval.baseRev != null ? ` · replaced Rev ${T.approval.baseRev}` : ' · first standard'}`
    : base ? `Compared with approved <b>Rev ${base.rev}</b> (${fmtD(base.approval && base.approval.at)})` : 'No approved standard yet for this mould on this machine – this will become Rev 0.';
  $('#app').innerHTML = `
    <a href="#/" class="small">← All trials</a>
    <div class="thead"><div>
      <h1 style="margin-bottom:2px">${esc(T.machine.no)} <span class="chip ${T.brand}">${T.brand}</span> · ${esc(sv(T, 'mould_code'))}</h1>
      <div class="small">Trial code <b class="code">${esc(T.code || '')}</b></div>
      <div class="small muted">${esc(sv(T, 'part_no'))} ${esc(sv(T, 'part_name'))} · ${esc(T.machine.model)} ${esc(T.machine.ton)} · ${p.form}${T.trialNo ? ' · Trial ' + esc(T.trialNo) : ''} · ${fmtD(T.trialDate)}</div>
      <div class="small muted">${approvedLine}</div>
    </div><span class="chip ${T.status}" style="font-size:13px">${T.status}${T.rev != null ? ' · Rev ' + T.rev : ''}</span></div>
    <nav class="tabs">
      ${[['photos', 'Photos'], ['values', 'All values'], ['info', 'Part info'], ['sign', 'Sign-off']].map(([id, t]) =>
        `<a href="#/t/${T.id}/${id}" class="${tab === id ? 'on' : ''}">${t}${id === 'values' && toCheck() ? `<span class="n">${toCheck()} to check</span>` : ''}</a>`).join('')}
    </nav>
    <div id="tab"></div>`;
  ({ photos: tabPhotos, values: tabValues, info: tabInfo, sign: tabSign })[tab]();
}
function refreshTabs() { const a = document.querySelector('.tabs a[href$="/values"]'); if (a) a.innerHTML = `All values${toCheck() ? `<span class="n">${toCheck()} to check</span>` : ''}`; }

function rowHTML(k) {
  const { vals, act } = view(T);
  const fl = fieldDef(k), x = vals[k] || {}, v = x.v ?? '';
  const base = baselineOf(T), bv = base ? sv(base, k) : null;
  const lim = limits(fl, v), blim = limits(fl, bv);
  const isAI = (x.src === 'ai') && !x.ok;
  const cls = ['frow', isAI ? 'ai' : '', isAI && x.conf === 'low' ? 'low' : '', !editable() ? 'locked' : ''].join(' ');
  const meta = [];
  if (lim) meta.push(`window ${lim.min} – ${lim.max} (${lim.text})`);
  if (base && fl.param) {
    if (bv === '' || bv == null) { if (v !== '') meta.push(`<span class="chg">new (blank in Rev ${base.rev})</span>`); }
    else if (String(bv) !== String(v) && Number(bv) !== Number(v)) {
      const out = blim && v !== '' && !isNaN(+v) && (+v < blim.min || +v > blim.max);
      meta.push(`<span class="${out ? 'out' : 'chg'}">Rev ${base.rev}: ${esc(bv)}${out ? ' – outside its window' : ' – changed'}</span>`);
    } else meta.push(`Rev ${base.rev}: same`);
  }
  if (act[k] != null) { const d = +act[k] - (+v); meta.push(`actual ${esc(act[k])}${!isNaN(d) && v !== '' ? ` (${d >= 0 ? '+' : ''}${Math.round(d * 10) / 10})` : ''}`); }
  if (isAI) meta.push(`<span class="rd">read by Claude${x.conf === 'low' ? ' – unsure' + (x.why ? ': ' + esc(x.why) : '') : ''}</span>`);
  if (x.readV != null && editable()) meta.push(`<span class="rd">new photo reads ${esc(x.readV)}</span>`);
  if (x.src === 'ai-edited') meta.push('corrected by hand');
  if (editable() && x.src === 'copy' && x.from != null && fl.param) meta.push(`copied from Rev ${x.from} – retake the photo if it was changed`);
  if (fl.note) meta.push(esc(fl.note));
  const input = fl.options
    ? `<select data-k="${k}" ${editable() ? '' : 'disabled'} style="grid-column:2/4"><option value=""></option>${fl.options.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
    : `<input data-k="${k}" value="${esc(v)}" inputmode="${fl.unit ? 'decimal' : 'text'}" ${editable() ? '' : 'readonly'} autocomplete="off"><span class="unit">${esc(fl.unit)}</span>`;
  const tick = v !== '' ? `<button class="tick ${x.ok ? 'on' : ''}" data-tick="${k}" title="${x.ok ? 'Checked' : 'Tick after checking against the photo'}" ${editable() ? '' : 'disabled'}>✓</button>` : '<span></span>';
  return `<div class="${cls}" id="r_${k}"><div class="lab">${esc(fl.label)}${fl.onForm === false ? ' <small>not on the form – printed in Remarks</small>' : ''}</div>${input}${tick}${meta.length ? `<div class="meta">${meta.join('<span>·</span>')}</div>` : ''}</div>`;
}
async function saveVals(payload, keys) {
  try { await spost({ op: 'set', id: T.id, values: payload }); keys.forEach(updateRow); }
  catch (e) { toast(e.message, true); keys.forEach(updateRow); }
}
function bindRows(root) {
  root.querySelectorAll('[data-k]').forEach(el => {
    el.addEventListener('change', () => {
      const k = el.dataset.k, v = el.value.trim(), cur = view(T).vals[k] || {};
      if (String(cur.v ?? '') === v) return;
      const src = cur.src === 'ai' || cur.src === 'ai-edited' ? 'ai-edited' : 'manual';
      saveVals({ [k]: { v, ok: true, src, keepEmpty: v === '' && cur.suggested } }, [k]);
    });
    el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const all = [...document.querySelectorAll('[data-k]')]; const n = all[all.indexOf(el) + 1]; el.blur(); if (n) n.focus(); } });
  });
  root.querySelectorAll('[data-tick]').forEach(b => (b.onclick = () => tickRows([b.dataset.tick])));
}
function tickRows(keys, force) {
  const { vals } = view(T);
  const payload = {};
  for (const k of keys) { const x = vals[k]; if (!x) continue; payload[k] = { v: x.v, ok: force != null ? force : !x.ok, src: x.src || 'manual', conf: x.conf, why: x.why, from: x.from }; }
  return saveVals(payload, keys);
}
function updateRow(k) {
  const el = document.getElementById('r_' + k);
  if (el) { const tmp = document.createElement('div'); tmp.innerHTML = rowHTML(k); const n = tmp.firstChild; el.replaceWith(n); bindRows(n); }
  refreshTabs(); document.querySelectorAll('[data-scstate]').forEach(e => (e.outerHTML = screenState(e.dataset.scstate)));
}

// ----- photos tab
function screenState(id) {
  const sc = prof().screens.find(s => s.id === id), rd = readingFor(T, id), { vals } = view(T);
  const filled = sc.fields.filter(k => vals[k] && vals[k].v !== ''), un = filled.filter(k => !vals[k].ok);
  let cls = 'todo', txt = 'No photo read yet';
  if (un.length) { cls = 'check'; txt = `${un.length} of ${filled.length} to check`; }
  else if (filled.length) { cls = 'done'; txt = `✓ ${filled.length} checked`; }
  else if (rd) { cls = 'check'; txt = 'Read – nothing found, type the values'; }
  return `<span class="state ${cls}" data-scstate="${id}">${txt}</span>`;
}
const PHOTO_CACHE = {};
// Older photos: encrypted files in this site (data/photos/...). New photos: in Google Drive, fetched through the script.
const imgTag = (ref, alt) => `<img data-ph="${esc(ref)}" alt="${esc(alt)}">`;
async function loadPhotos(root) {
  for (const img of root.querySelectorAll('img[data-ph]')) {
    const f = img.dataset.ph;
    try {
      if (!PHOTO_CACHE[f]) PHOTO_CACHE[f] = f.startsWith('data/')
        ? fetchEnc(f).then(e => decryptBytes(e, CODE)).then(b => URL.createObjectURL(new Blob([b], { type: 'image/jpeg' })))
        : sget({ op: 'photo', id: f }).then(j => URL.createObjectURL(new Blob([b64(j.data)], { type: j.type || 'image/jpeg' })));
      img.src = await PHOTO_CACHE[f];
    } catch { delete PHOTO_CACHE[f]; img.alt = 'Photo could not be loaded'; }
  }
}
// ----- taking and reading photos
const BUSY = {};   // screen id (or 'any') -> number of photos being read
function photoCard() {
  const n = Object.values(BUSY).reduce((a, b) => a + b, 0);
  return `<div class="card postcard">
    <h2>Photos of the machine screens</h2>
    <ol class="small steps">
      <li>Open each page on the machine screen. Hold the phone straight, whole page in the frame, no glare.</li>
      <li>Tap <b>📷 Photo</b> on that screen below${AI_ON ? ' – Claude reads it in a few seconds' : ''}. Or take several photos first and add them all at once.</li>
      <li>Check each purple value against the photo and tick ✓. Correct anything that is wrong.</li>
    </ol>
    <div class="row"><label class="btn primary">📷 Add photos (any screen)<input type="file" accept="image/*" multiple hidden data-shoot="any"></label>
      ${n ? `<span class="small muted"><span class="spin"></span> Reading ${n} photo(s)…</span>` : ''}</div>
  </div>`;
}
async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('Not a photo')); i.src = url; });
    const k = Math.min(1, 1568 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85).split(',')[1];
  } finally { URL.revokeObjectURL(url); }
}
function guideFor(brand) {
  const p = META.profiles[brand], lab = {};
  for (const s of p.sections) for (const f of s.fields) lab[f.k] = f.label + (f.unit ? ' [' + f.unit + ']' : '');
  return `${brand} (${p.form})\n` + p.screens.map(sc => `### screen "${sc.id}" – ${sc.title} (page title: ${sc.page})\n${sc.read || sc.hint}\nFields (key: meaning):\n` +
    sc.fields.map(k => `- ${k}: ${lab[k] || k}`).join('\n') + (sc.actuals && sc.actuals.length ? `\nAlso report ACTUAL values under "actuals" for: ${sc.actuals.join(', ')}` : '')).join('\n\n');
}
async function readPhoto(file, screen) {
  const trial = T, p = prof(trial);
  BUSY[screen] = (BUSY[screen] || 0) + 1; if (T === trial) keepScroll(tabPhotos);
  try {
    const image = await shrink(file);
    const j = await spost({ op: 'read', id: trial.id, screen, image, mediaType: 'image/jpeg', guide: guideFor(trial.brand),
      fields: Object.fromEntries(p.screens.map(sc => [sc.id, sc.fields])) });
    const sc = p.screens.find(s => s.id === j.screen);
    const n = Object.keys(j.read.values || {}).length;
    toast(sc ? `${sc.title}: ${n} value(s) read${j.read.warnings.length ? ' – see note' : ''}` : 'Photo not recognised as a screen of this form', !sc);
  } catch (e) { toast(e.message, true); }
  finally { BUSY[screen]--; if (location.hash.includes("/photos") && T && T.id === trial.id) { keepScroll(tabPhotos); refreshTabs(); } }
}
function tabPhotos() {
  const p = prof(), rs = readsOf(T);
  $('#tab').innerHTML = `
    ${editable() ? photoCard() : ''}
    ${rs.unmatched && rs.unmatched.length ? `<div class="card"><h2>Other photos</h2><div class="small muted">Claude could not match these to a screen of the form.</div>
      ${rs.unmatched.map(u => `<div class="row" style="margin-top:8px;align-items:flex-start">${u.photo ? `<div class="shot" style="width:160px;aspect-ratio:4/3" data-view="1">${imgTag(u.photo, 'photo')}</div>` : ''}<div class="small">${esc(u.seen || 'Unknown screen')}${u.warnings && u.warnings.length ? '<br>' + u.warnings.map(esc).join('<br>') : ''}</div></div>`).join('')}</div>` : ''}
    ${p.screens.map(sc => {
      const rd = readingFor(T, sc.id), { vals } = view(T);
      const un = sc.fields.filter(k => vals[k] && vals[k].v !== '' && !vals[k].ok);
      return `<div class="card" id="sc_${sc.id}">
        <div class="sectionh"><div><h3>${esc(sc.title)}</h3><div class="small muted">${esc(sc.hint)}</div></div>${screenState(sc.id)}</div>
        ${rd && rd.warnings && rd.warnings.length ? `<div class="note ai">Claude: ${rd.warnings.map(esc).join(' · ')}</div>` : ''}
        ${rd && rd.ok !== false && editable() && !Object.keys(rd.values || {}).length ? `<div class="note ai">Claude could not read any value on this photo – retake it (straight, no glare) or type the values.</div>` : ''}
        <div class="screen">
          <div class="leftcol">
            ${rd && rd.photo ? `<div class="shot" data-view="1">${imgTag(rd.photo, sc.title + ' photo')}</div>
              <div class="controls"><div class="small muted" style="margin-top:4px">${rd.postedAt ? 'Posted ' + fmtDT(rd.postedAt) + (rd.postedBy ? ' · ' + esc(rd.postedBy) : '') + ' · read ' + fmtDT(rd.at) : 'Taken ' + fmtDT(rd.at) + (rd.by ? ' by ' + esc(rd.by) : '') + ' · read by Claude'}</div>`
              : `<div class="shot empty">${editable() ? 'No photo yet<br>' + esc(sc.page) : 'No photo in this revision'}</div><div class="controls">`}
            ${editable() ? `<div class="row" style="margin-top:6px">${BUSY[sc.id] ? '<span class="small muted"><span class="spin"></span> Reading…</span>' : `<label class="btn small ${rd && rd.photo ? '' : 'primary'}">📷 ${rd && rd.photo ? 'Retake' : 'Photo'}<input type="file" accept="image/*" hidden data-shoot="${sc.id}"></label>`}</div>` : ''}
            ${rd && rd.other && rd.other.length ? `<details class="small" style="margin-top:6px"><summary class="muted">Other settings Claude saw (${rd.other.length})</summary>${rd.other.map(o => `${esc(o.label)}: <b>${esc(o.value)}</b> ${esc(o.unit || '')}`).join('<br>')}</details>` : ''}
          </div></div>
          <div class="fields">
            ${sc.fields.map(k => rowHTML(k)).join('')}
            ${editable() && un.length ? `<div class="row" style="margin-top:8px"><span class="sp"></span><button class="btn small good" data-tickall="${sc.id}">✓ All ${un.length} match the photo</button></div>` : ''}
          </div>
        </div>
      </div>`;
    }).join('')}`;
  bindRows($('#tab'));
  loadPhotos($('#tab'));
  document.querySelectorAll('[data-shoot]').forEach(inp => (inp.onchange = () => {
    const files = [...inp.files]; inp.value = '';
    files.forEach((f, i) => setTimeout(() => readPhoto(f, inp.dataset.shoot), i * 400));
  }));
  document.querySelectorAll('[data-view]').forEach(d => (d.onclick = () => openViewer(d)));
  document.querySelectorAll('[data-tickall]').forEach(b => (b.onclick = async () => {
    const sc = prof().screens.find(s => s.id === b.dataset.tickall), { vals } = view(T);
    await tickRows(sc.fields.filter(k => vals[k] && vals[k].v !== '' && !vals[k].ok), true); keepScroll(tabPhotos);
  }));
}
const keepScroll = fn => { const y = scrollY; fn(); scrollTo(0, y); };

// ----- viewer
let zoom = 0;
function openViewer(d) {
  const img = d.querySelector('img'); if (!img || !img.src) return;
  const h = d.closest('.card').querySelector('h3,h2'); $('#vTitle').textContent = h ? h.textContent : ''; $('#vImg').src = img.src; zoom = 0; applyZoom(); $('#viewer').hidden = false;
}
function applyZoom() { const img = $('#vImg'), W = $('#vBody').clientWidth || innerWidth; img.style.width = zoom === 0 ? W + 'px' : Math.round(W * (1 + zoom * 0.75)) + 'px'; }
document.addEventListener('click', e => {
  const z = e.target.closest('[data-z]'); if (z) { zoom = z.dataset.z === '0' ? 0 : Math.max(0, Math.min(6, zoom + +z.dataset.z)); applyZoom(); }
  if (e.target.id === 'vClose') $('#viewer').hidden = true;
});

// ----- all values
function tabValues() {
  const p = prof(), only = ls.get('mpa.only') === '1', { vals } = view(T), base = baselineOf(T), ch = changesVs(T, base);
  const keep = k => !only || (vals[k] && vals[k].v !== '' && !vals[k].ok) || ch.some(c => c.k === k);
  $('#tab').innerHTML = `
    <div class="row" style="margin:6px 0"><label class="small"><input type="checkbox" id="only" ${only ? 'checked' : ''}> Show only values to check or changed</label>
      <span class="sp"></span><span class="small muted">${ch.length && base ? `${ch.length} change(s) vs Rev ${base.rev}` : ''}</span></div>
    ${p.sections.map(s => { const ks = s.fields.map(f => f.k).filter(keep); return ks.length ? `<div class="card"><h2>${esc(s.title)}</h2>${ks.map(k => rowHTML(k)).join('')}</div>` : ''; }).join('') || '<div class="empty-state">Nothing to check. ✓</div>'}`;
  $('#only').onchange = e => { ls.set('mpa.only', e.target.checked ? '1' : '0'); tabValues(); };
  bindRows($('#tab'));
}

// ----- part info
function tabInfo() {
  $('#tab').innerHTML = `
    <div class="card"><div class="grid2">
      <div><label class="f">Trial no.</label><input type="text" id="i_trial" value="${esc(T.trialNo)}" ${editable() ? '' : 'readonly'}></div>
      <div><label class="f">Trial date</label><input type="date" id="i_date" value="${esc(T.trialDate)}" ${editable() ? '' : 'readonly'}></div>
    </div></div>
    ${META.header.map(g => `<div class="card"><h2>${esc(g.title)}</h2>${g.fields.map(f => rowHTML(f.k)).join('')}</div>`).join('')}`;
  bindRows($('#tab'));
  const save = async meta => { try { await spost({ op: 'set', id: T.id, meta }); } catch (e) { toast(e.message, true); } };
  $('#i_trial').onchange = e => save({ trialNo: e.target.value.trim() });
  $('#i_date').onchange = e => save({ trialDate: e.target.value });
}

// ----- sign-off
function tabSign() {
  const c = checks(T), pp = T.people, base = baselineOf(T), st = T.status, ch = changesVs(T, base);
  const locked = st === 'Approved' || st === 'Superseded';
  const pdf = RESULTS.pdfs[T.id];
  const pdfReady = pdf && pdf.rev === T.rev;
  const person = (k, label) => `<div><label class="f">${label}</label><input type="text" data-p="${k}" value="${esc(pp[k] || '')}" ${locked ? 'readonly' : ''}></div>`;
  $('#tab').innerHTML = `
    ${!locked ? `<div class="card"><h2>Checks</h2>
      ${c.mustFix.length ? `<ul class="checks">${c.mustFix.map(m => `<li style="color:var(--bad)">✗ ${esc(m)}</li>`).join('')}</ul>` : '<div style="color:var(--ok)">✓ Nothing blocking</div>'}
      ${c.advice.length ? `<ul class="checks small">${c.advice.map(m => `<li style="color:var(--warn)">! ${esc(m)}</li>`).join('')}</ul>` : ''}
    </div>` : ''}
    ${base && !locked ? `<div class="card"><h2>Changes against approved Rev ${base.rev}</h2>
      ${ch.length ? `<table class="t"><tr><th>Parameter</th><th>Rev ${base.rev}</th><th>This trial</th></tr>${ch.map(x => `<tr><td>${esc(x.label)}</td><td>${esc(x.from)}</td><td style="color:${x.outside ? 'var(--bad)' : 'var(--warn)'};font-weight:600">${esc(x.to)}${x.outside ? ' ⚠ outside window' : ''}</td></tr>`).join('')}</table>` : '<div class="muted">No parameter changes.</div>'}
    </div>` : ''}
    <div class="card"><h2>Sign-off</h2><div class="grid2">
      ${person('set_by', 'Set by (technician)')}${person('checked_by', 'Checked by')}${person('approved_by', 'Approved by')}
      ${person('prod_check', 'Check by (Prod)')}${person('ipqc_confirm', 'Confirm by (IPQC)')}
    </div>
    ${st === 'Review' && base && ch.length ? `<label class="f">Reason for change (goes on the History Data Sheet) *</label><textarea id="reason" placeholder="e.g. Short shot at cavity 2 – raised hold pressure"></textarea>` : ''}
    ${T.approval && T.approval.reason ? `<p class="small"><b>Reason:</b> ${esc(T.approval.reason)}</p>` : ''}
    <div class="row" style="margin-top:12px">
      ${st === 'Draft' ? `<button class="btn primary" id="toReview" ${c.mustFix.length ? 'disabled' : ''}>Submit for review →</button>` : ''}
      ${st === 'Review' ? `<button class="btn" id="toDraft">← Send back to Draft</button><button class="btn good" id="approve">✓ Approve as Rev ${base ? base.rev + 1 : 0}</button>` : ''}
      ${st === 'Approved' ? `<a class="btn" href="#/new?from=${T.id}">Start a new trial from this</a>` : ''}
    </div></div>
    ${locked ? `<div class="card"><h2>EXZONE PDF (${prof().form})</h2>
      ${pdfReady ? `<p class="small muted">Made by Claude ${fmtDT(pdf.at)}. Entered values print in blue.</p><button class="btn primary" id="pdf">📄 Open PDF – Rev ${T.rev}</button>`
        : `<div class="banner wait"><span>⏳</span><div><b class="h">PDF not made yet</b>Claude makes it on the next <b>Run now</b> (Rashid's Claude app → “Molding Parameter – read photos”).</div></div>`}
    </div>` : ''}
    ${chainOf(T).length ? `<div class="card"><h2>Revision history</h2><table class="t"><tr><th>Rev</th><th>Status</th><th>Approved</th><th>By</th></tr>${chainOf(T).map(r => `<tr><td>${r.id === T.id ? '<b>' + r.rev + '</b>' : `<a href="#/t/${r.id}/sign">${r.rev}</a>`}</td><td>${r.status}</td><td>${fmtD(r.approval && r.approval.at)}</td><td>${esc(r.people.approved_by)}</td></tr>`).join('')}</table></div>` : ''}
    <div class="card"><h2>Log</h2><table class="t small">${(T.log || []).slice().reverse().map(l => `<tr><td style="white-space:nowrap">${fmtDT(l.at)}</td><td>${esc(l.who)}</td><td>${esc(l.what)}</td></tr>`).join('')}</table>
      ${st === 'Draft' ? `<div class="row" style="margin-top:10px"><span class="sp"></span><button class="btn small danger" id="del">Delete this draft</button></div>` : ''}</div>`;
  document.querySelectorAll('[data-p]').forEach(i => (i.onchange = async () => { try { await spost({ op: 'set', id: T.id, people: { [i.dataset.p]: i.value.trim() } }); keepScroll(tabSign); } catch (e) { toast(e.message, true); } }));
  const go = async (to, extra = {}) => {
    try { await spost({ op: 'status', id: T.id, to, ...extra }); renderTrial('sign'); toast(to === 'Approved' ? `Approved as Rev ${T.rev}` : `Status: ${T.status}`); }
    catch (e) { toast(e.message, true); }
  };
  $('#toReview') && ($('#toReview').onclick = () => go('Review'));
  $('#toDraft') && ($('#toDraft').onclick = () => { const note = prompt('What needs fixing? (optional)'); if (note !== null) go('Draft', { note }); });
  $('#approve') && ($('#approve').onclick = () => go('Approved', { reason: $('#reason') ? $('#reason').value : '', changes: ch.map(({ k, label, from, to }) => ({ k, label, from, to })) }));
  $('#del') && ($('#del').onclick = async () => { if (!confirm('Delete this draft?')) return; try { await spost({ op: 'delete', id: T.id }); TRIALS = TRIALS.filter(x => x.id !== T.id); T = null; location.hash = '#/'; } catch (e) { toast(e.message, true); } });
  $('#pdf') && ($('#pdf').onclick = openPdf);
}
async function openPdf() {
  const w = window.open('', '_blank');
  try {
    const pdf = RESULTS.pdfs[T.id];
    const bytes = await decryptBytes(await fetchEnc(pdf.file), CODE);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    if (w) w.location = url; else location.href = url;
  } catch (e) { if (w) w.close(); toast('Could not open the PDF: ' + e.message, true); }
}

// ---------------------------------------------------------------- start
function setTopH() { const h = document.querySelector('.top'); if (h) document.documentElement.style.setProperty('--toph', (h.offsetHeight - 1) + 'px'); }
window.addEventListener('resize', setTopH);
document.addEventListener('visibilitychange', async () => { if (document.visibilityState === 'visible' && META && (!T || T.status !== 'Draft' || !document.activeElement || document.activeElement.tagName !== 'INPUT')) { try { await reload(); route(); } catch {} } });
(async function init() {
  setTopH();
  if (CODE) {
    try { META = await loadEncJson('data/meta.enc.json', CODE); await reload(); }
    catch (e) { META = null; return renderUnlock(e.message === 'Wrong passcode' || e.name === 'OperationError' ? 'Passcode changed – enter the new one' : e.message); }
  }
  route();
})();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
