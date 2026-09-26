/**
 * Exzone Molding Parameter — team data backend (Google Apps Script)
 *
 * Keeps the trials the team enters in the app (values, ticks, sign-offs) in this Google Sheet.
 * Photos are NOT handled here: technicians post them in Teams → NPI 2026 → Molding Trials.
 * When a trial is approved, this script writes a small Google Doc into the Drive folder
 * "Molding Parameter – for Claude" so Rashid's Claude can make the EXZONE PDF on "Run now".
 *
 * SETUP (once):
 *  1. Change TEAM_CODE below to the team passcode used in the app.
 *  2. Click Save, choose "setup" in the function menu and click Run. Allow access when asked.
 *  3. Deploy → New deployment → type "Web app":  Execute as: Me   Who has access: Anyone
 *     Copy the Web app URL and send it to Claude.
 *  If you change this code later: Deploy → Manage deployments → Edit → Version: New version.
 */

const TEAM_CODE = 'CHANGE-ME'; // set the passcode here (never stored in GitHub)
const CLAUDE_FOLDER = 'Molding Parameter – for Claude';

/* ---------------- setup ---------------- */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const first = ss.getSheets()[0];
  if (!ss.getSheetByName('Trials')) { first.clear(); first.setName('Trials'); }
  ensure_('Trials', ['id', 'code', 'status', 'machine', 'mould', 'rev', 'updatedAt', 'json']);
  ensure_('Log', ['at', 'who', 'trial', 'what']);
  folder_();
  Logger.log('Setup OK');
}

/* ---------------- web app ---------------- */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.code !== TEAM_CODE) return out_({ ok: false, error: 'bad_code' });
  return out_({ ok: true, trials: all_().filter(t => !t.deleted), at: stamp_() });
}

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'bad_request' }); }
  if (!b || b.code !== TEAM_CODE) return out_({ ok: false, error: 'bad_code' });
  const who = clean_(b.who, 40);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const now = stamp_();
    if (b.op === 'create') {
      const src = b.trial || {};
      if (!src.machine || !src.machine.no || !src.brand) return out_({ ok: false, error: 'Pick a machine' });
      const prefix = clean_(src.machine.no, 12).replace(/[^A-Za-z0-9]/g, '') + '-' + Utilities.formatDate(new Date(), 'Asia/Kuala_Lumpur', 'MMdd') + '-';
      const n = all_().filter(t => String(t.code || '').indexOf(prefix) === 0).length + 1;
      const t = {
        id: Utilities.formatDate(new Date(), 'Asia/Kuala_Lumpur', 'yyMMdd') + '-' + Utilities.getUuid().slice(0, 6),
        code: prefix + n,
        brand: clean_(src.brand, 20), machine: src.machine, status: 'Draft', rev: null,
        trialNo: clean_(src.trialNo, 20), trialDate: clean_(src.trialDate, 10) || now.slice(0, 10),
        createdAt: now, values: {}, actuals: {}, people: { set_by: who }, log: [{ at: now, who: who, what: 'Trial created' }],
      };
      Object.keys(src.values || {}).forEach(k => { const x = src.values[k]; if (x && x.v !== '' && x.v != null) t.values[clean_(k, 40)] = cleanVal_(x); });
      if (src.copiedFrom) t.log.push({ at: now, who: who, what: 'Values copied from ' + clean_(src.copiedFrom, 80) });
      save_(t); log_(who, t.id, 'created ' + t.code);
      return out_({ ok: true, trial: t });
    }
    const t = get_(clean_(b.id, 40));
    if (!t || t.deleted) return out_({ ok: false, error: 'Trial not found' });

    if (b.op === 'set') {
      if (t.status === 'Approved' || t.status === 'Superseded') return out_({ ok: false, error: 'An approved standard is locked. Start a new trial to change it.' });
      if (b.values) {
        if (t.status !== 'Draft') return out_({ ok: false, error: 'Values are locked while in Review. Send it back to Draft first.' });
        Object.keys(b.values).forEach(k => {
          const x = b.values[k]; k = clean_(k, 40);
          if (x && (x.v === '' || x.v == null) && !x.keepEmpty) delete t.values[k]; else t.values[k] = cleanVal_(x);
        });
      }
      if (b.actuals && t.status === 'Draft') Object.keys(b.actuals).forEach(k => { t.actuals[clean_(k, 40)] = clean_(b.actuals[k], 20); });
      if (b.people) Object.keys(b.people).forEach(k => { t.people[clean_(k, 30)] = clean_(b.people[k], 60); });
      if (b.meta && t.status === 'Draft') { if (b.meta.trialNo != null) t.trialNo = clean_(b.meta.trialNo, 20); if (b.meta.trialDate) t.trialDate = clean_(b.meta.trialDate, 10); }
      save_(t);
      return out_({ ok: true, trial: t });
    }

    if (b.op === 'status') {
      if (b.people) Object.keys(b.people).forEach(k => { t.people[clean_(k, 30)] = clean_(b.people[k], 60); });
      const to = b.to;
      if (to === 'Review') {
        if (t.status !== 'Draft') return out_({ ok: false, error: 'Only a Draft can be submitted' });
        if (!t.people.set_by) return out_({ ok: false, error: 'Fill in "Set by"' });
        t.status = 'Review'; t.log.push({ at: now, who: who, what: 'Submitted for review' });
      } else if (to === 'Draft') {
        if (t.status !== 'Review') return out_({ ok: false, error: 'Only a trial in Review can be sent back' });
        t.status = 'Draft'; t.log.push({ at: now, who: who, what: 'Sent back to Draft' + (b.note ? ': ' + clean_(b.note, 200) : '') });
      } else if (to === 'Approved') {
        if (t.status !== 'Review') return out_({ ok: false, error: 'Submit for review first' });
        if (!t.people.checked_by || !t.people.approved_by) return out_({ ok: false, error: 'Fill in "Checked by" and "Approved by"' });
        const base = all_().filter(x => x.id !== t.id && x.status === 'Approved' && !x.deleted && key_(x) === key_(t)).sort((a, c) => c.rev - a.rev)[0];
        const changes = Array.isArray(b.changes) ? b.changes.slice(0, 300).map(c => ({ k: clean_(c.k, 40), label: clean_(c.label, 120), from: clean_(c.from, 40), to: clean_(c.to, 40) })) : [];
        const reason = clean_(b.reason, 500);
        if (base && changes.length && !reason) return out_({ ok: false, error: 'Give the reason for the ' + changes.length + ' change(s) against Rev ' + base.rev });
        if (base) { base.status = 'Superseded'; base.log.push({ at: now, who: who, what: 'Superseded by Rev ' + (base.rev + 1) }); save_(base); }
        t.rev = base ? base.rev + 1 : 0;
        t.status = 'Approved';
        t.approval = { at: now, reason: reason, changes: changes, baseRev: base ? base.rev : null };
        t.log.push({ at: now, who: who, what: 'Approved as Rev ' + t.rev });
      } else return out_({ ok: false, error: 'Unknown status' });
      save_(t);
      if (t.status === 'Approved') writeClaudeDoc_(t);
      log_(who, t.id, 'status ' + t.status);
      return out_({ ok: true, trial: t, trials: all_().filter(x => !x.deleted) });
    }

    if (b.op === 'delete') {
      if (t.status !== 'Draft') return out_({ ok: false, error: 'Only a Draft can be deleted' });
      t.deleted = now; save_(t); log_(who, t.id, 'deleted');
      return out_({ ok: true });
    }
    return out_({ ok: false, error: 'unknown_op' });
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- approved trial → Google Doc for Claude ---------------- */
// One "path=value" line per field, plus a check line so Claude's import can confirm nothing was lost.
function flatten_(obj, prefix, out) {
  Object.keys(obj).forEach(k => {
    const v = obj[k], p = prefix ? prefix + '.' + k : k;
    if (v == null) return;
    if (typeof v === 'object') flatten_(v, p, out);
    else out.push(p + '=' + String(v).replace(/[\r\n]+/g, ' '));
  });
  return out;
}
function check_(lines) {
  let h = 7;
  const s = lines.join('\n');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 2147483647;
  return lines.length + '/' + h;
}
function writeClaudeDoc_(t) {
  const copy = JSON.parse(JSON.stringify(t));
  delete copy.log;
  const lines = flatten_(copy, '', []);
  const text = ['MPA-TRIAL v1'].concat(lines, ['CHECK=' + check_(lines), 'END']).join('\n');
  const doc = DocumentApp.create('MPA ' + t.id + ' Rev ' + t.rev + ' ' + t.code);
  doc.getBody().setText(text);
  doc.saveAndClose();
  const file = DriveApp.getFileById(doc.getId());
  folder_().addFile(file);
  DriveApp.getRootFolder().removeFile(file);
}

/* ---------------- storage ---------------- */
function ensure_(name, head) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.getRange(1, 1, 1, head.length).setValues([head]);
  try { sh.getRange(1, 1, 1, head.length).setFontWeight('bold'); sh.setFrozenRows(1); } catch (e) { /* formatting only */ }
  SpreadsheetApp.flush();
  return sh;
}
function sheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) { setup(); return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); }
  return sh;
}
function all_() {
  const rows = sheet_('Trials').getDataRange().getValues();
  const out = [];
  for (let r = 1; r < rows.length; r++) { try { if (rows[r][7]) out.push(JSON.parse(rows[r][7])); } catch (e) {} }
  return out;
}
function get_(id) { return all_().filter(t => t.id === id)[0] || null; }
function save_(t) {
  t.updatedAt = stamp_();
  const sh = sheet_('Trials'), ids = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues();
  const row = [t.id, t.code, t.deleted ? 'Deleted' : t.status, t.machine.no, (t.values.mould_code || {}).v || '', t.rev == null ? '' : t.rev, t.updatedAt, JSON.stringify(t)];
  for (let r = 1; r < ids.length; r++) if (String(ids[r][0]) === t.id) { sh.getRange(r + 1, 1, 1, row.length).setValues([row]); return; }
  sh.appendRow(row);
}
function log_(who, id, what) { sheet_('Log').appendRow([stamp_(), who, id, what]); }
function key_(t) { return t.brand + '|' + t.machine.no + '|' + String((t.values.mould_code || {}).v || '').trim().toUpperCase(); }
function folder_() {
  const it = DriveApp.getFoldersByName(CLAUDE_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(CLAUDE_FOLDER);
}

/* ---------------- helpers ---------------- */
function cleanVal_(x) {
  const o = { v: clean_(x.v, 60), ok: !!x.ok, src: clean_(x.src, 12) || 'manual' };
  if (x.conf) o.conf = clean_(x.conf, 6);
  if (x.why) o.why = clean_(x.why, 120);
  if (x.from != null) o.from = x.from;
  return o;
}
function clean_(s, max) {
  return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B-\u001F]/g, '').trim().slice(0, max);
}
function stamp_() { return Utilities.formatDate(new Date(), 'Asia/Kuala_Lumpur', "yyyy-MM-dd'T'HH:mm:ss"); }
function out_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
