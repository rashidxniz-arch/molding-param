// Fills the EXZONE Standard Moulding Parameter form (FRONT), the History Data Sheet (BACK)
// and adds a Photos sheet with each screen photo next to the values read from it.
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { PROFILES, limits } = require('./profiles');
const store = require('./store');

const TEMPLATES = process.env.MPA_TEMPLATES || path.join(__dirname, '..', 'templates');
const STAMP = {
  NISSEI: { remarks: 'B39', stamp: 'A46', merge: ['AF6:AG6', 'AF7:AG7', 'AF8:AG8', 'AF9:AG9'],
    sketches: [{ c0: 34, c1: 44, r0: 8, r1: 19 }, { c0: 34, c1: 44, r0: 21, r1: 33 }] },
  ARBURG: { remarks: 'C55', stamp: 'A63', merge: [
      'W16:X16', 'Z16:AA16', 'AC16:AD16',
      'C23:E23', 'F23:H23', 'I23:J23', 'K23:N23', 'S23:X23', 'Y23:AF23', 'AG23:AH23',
      'E24:G24', 'H24:J24', 'K24:N24', 'T24:Y24', 'Z24:AE24', 'AF24:AH24',
      'U32:AA32', 'AB32:AF32', 'AG32:AK32', 'Y33:AE33', 'AF33:AG33',
      ...[40, 41, 42, 45, 46].flatMap(r => ['F', 'J', 'P', 'T', 'Y', 'AC'].map((c, i) => `${c}${r}:${['I', 'O', 'S', 'X', 'AB', r === 42 ? 'AF' : 'AG'][i]}${r}`)),
      'F52:H52', 'I52:K52', 'L52:O52', 'P52:R52', 'S52:U52', 'V52:X52', 'Y52:AA52', 'AB52:AE52'],
    sketches: [{ c0: 38, c1: 47, r0: 7, r1: 22 }, { c0: 38, c1: 47, r0: 24, r1: 39 }] },
};
// Merge a value box so the number is centred in it (unmerging any smaller merge inside it first)
const { decode } = (() => {
  const col = s => s.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  return { decode: a => { const m = /^([A-Z]+)(\d+)$/.exec(a); return { c: col(m[1]), r: +m[2] }; } };
})();
function mergeBox(ws, range) {
  const [a, b] = range.split(':').map(decode);
  for (const m of Object.keys(ws._merges || {})) {
    const mm = ws._merges[m].model || ws._merges[m];
    const top = mm.top, left = mm.left, bottom = mm.bottom, right = mm.right;
    if (top <= b.r && bottom >= a.r && left <= b.c && right >= a.c) { try { ws.unMergeCells(top, left, bottom, right); } catch {} }
  }
  try { ws.mergeCells(range); } catch (e) { /* leave as is */ }
}
const SKETCH = path.join(TEMPLATES, 'water-sketch.png');

// Column/row sizes in pixels, used to centre the sketch picture in its box
const colPx = (ws, i) => { const w = ws.getColumn(i + 1).width; return Math.round((w || 8.43) * 7 + 5); };
const rowPx = (ws, i) => Math.round((ws.getRow(i + 1).height || 15) * 4 / 3);
function toCol(ws, startCol, px) { let c = startCol; while (px > colPx(ws, c) && c < 200) { px -= colPx(ws, c); c++; } return c + px / colPx(ws, c); }
function toRow(ws, startRow, px) { let r = startRow; while (px > rowPx(ws, r) && r < 500) { px -= rowPx(ws, r); r++; } return r + px / rowPx(ws, r); }
function placeSketch(wb, ws, imgId, box) {
  let W = 0, H = 0;
  for (let c = box.c0; c < box.c1; c++) W += colPx(ws, c);
  for (let r = box.r0; r < box.r1; r++) H += rowPx(ws, r);
  const ar = 640 / 225, w = Math.min(W * 0.92, H * 0.8 * ar), h = w / ar;
  ws.addImage(imgId, { tl: { col: toCol(ws, box.c0, (W - w) / 2), row: toRow(ws, box.r0, (H - h) / 2) }, ext: { width: w, height: h }, editAs: 'oneCell' });
}

function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return { w: 1600, h: 1200 };
}

const val = (t, k) => { const x = t.values[k]; return x && x.v !== '' && x.v != null ? x.v : ''; };
const asCell = v => (v !== '' && /^-?\d+(\.\d+)?$/.test(String(v).trim()) ? Number(v) : v);
const fmtDate = iso => { if (!iso) return ''; const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };

const INPUT_BLUE = 'FF0038C8';
function put(ws, addr, v, opts = {}) {
  if (v === '' || v == null) return;
  const c = ws.getCell(addr);
  c.style = JSON.parse(JSON.stringify(c.style || {})); // template cells share style objects – give this cell its own
  c.value = asCell(v);
  const dec = /^-?\d+\.(\d+)$/.exec(String(v).trim());
  if (typeof c.value === 'number') c.numFmt = dec ? '0.' + '0'.repeat(dec[1].length) : '0';
  const old = c.font || {};
  // Entered values print in blue so they stand out from the form's printed labels
  c.font = { name: old.name || 'Arial', size: opts.size || Math.min(old.size || 9, 10), bold: !!opts.bold, color: { argb: opts.black ? 'FF000000' : INPUT_BLUE } };
  c.alignment = { horizontal: opts.left ? 'left' : 'center', vertical: opts.top ? 'top' : 'middle', shrinkToFit: !!opts.shrink, wrapText: !!opts.wrap };
}

async function buildWorkbook(trial, chain, opts = {}) {
  const p = PROFILES[trial.brand];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(TEMPLATES, p.template));
  const ws = wb.worksheets[0];

  // ---- form fixes: wider value boxes, water-system sketch pictures (lost in the .xls -> .xlsx conversion) ----
  for (const m of STAMP[p.brand].merge) mergeBox(ws, m);
  if (fs.existsSync(SKETCH)) { const id = wb.addImage({ filename: SKETCH, extension: 'png' }); for (const b of STAMP[p.brand].sketches) placeSketch(wb, ws, id, b); }

  // ---- header ----
  const H = p.headerCells;
  const hv = {
    ...Object.fromEntries(Object.keys(trial.values).map(k => [k, val(trial, k)])),
    machine_no: `${trial.machine.no}${trial.machine.model ? '  (' + trial.machine.model + ')' : ''}`,
    tonnage: trial.machine.ton || '', date: fmtDate(trial.trialDate || trial.createdAt),
    set_by: trial.people.set_by || '', checked_by: trial.people.checked_by || '', approved_by: trial.people.approved_by || '',
    prod_check: trial.people.prod_check || '', ipqc_confirm: trial.people.ipqc_confirm || '',
  };
  for (const [k, cell] of Object.entries(H)) {
    let v = hv[k];
    if (v === '' || v == null) continue;
    if (Array.isArray(cell)) { put(ws, v === 'Yes' ? cell[0] : cell[1], '√', { bold: true }); continue; }
    if (p.headerFormat[k]) v = p.headerFormat[k](v);
    const small = ['set_by', 'checked_by', 'approved_by'].includes(k);
    const sign = ['prod_check', 'ipqc_confirm'].includes(k);
    put(ws, cell, v, { left: ['customer', 'machine_no', 'mould_code', 'part_name', 'part_no', 'material', 'colour'].includes(k), size: small ? 7 : sign ? 11 : undefined, shrink: small || ['machine_no', 'core_sv', 'cav_sv', 'core_av', 'cav_av', 'dry_temp', 'dry_time', 'cycle_time', 'fill_time', 'plast_time', 'cushion', 'runner_wt', 'part_wt', 'g_seal'].includes(k), top: sign });
  }
  // Nissei/Arburg forms have no Doc # box: add it to the title line
  if (hv.doc_no) { const t = ws.getCell(p.brand === 'NISSEI' ? 'A2' : 'U2'); t.value = `${p.title}      Doc # ${hv.doc_no}`; }

  // ---- parameter fields ----
  for (const s of p.sections) for (const fl of s.fields) if (fl.cell) put(ws, fl.cell, val(trial, fl.k), { shrink: true });

  // ---- remarks / extras ----
  const extras = (p.remarkExtras || []).filter(k => val(trial, k) !== '').map(k => `${p.fieldMap[k].label} ${val(trial, k)} ${p.fieldMap[k].unit}`.trim());
  if (val(trial, 'water')) extras.unshift('Water: ' + val(trial, 'water'));
  if (val(trial, 'remarks')) extras.push(val(trial, 'remarks'));
  if (extras.length) put(ws, STAMP[p.brand].remarks, 'Remarks: ' + extras.join(';  '), { left: true, size: 8 });
  const stampText = trial.status === 'Approved' || trial.status === 'Superseded'
    ? `Rev ${trial.rev} – ${trial.status.toUpperCase()} ${fmtDate(trial.approval && trial.approval.at)} by ${trial.people.approved_by || ''}.${trial.trialNo ? '  Trial ' + trial.trialNo + '.' : ''}  Generated by Molding Parameter App.`
    : `${trial.status.toUpperCase()} – NOT AN APPROVED STANDARD.${trial.trialNo ? '  Trial ' + trial.trialNo + '.' : ''}  Generated by Molding Parameter App ${fmtDate(new Date().toISOString())}.`;
  put(ws, STAMP[p.brand].stamp, stampText, { left: true, size: 8, bold: trial.status !== 'Approved', black: true });

  // ---- History Data Sheet ----
  const hs = wb.getWorksheet(p.history.sheet);
  if (hs) hs.pageSetup = { ...hs.pageSetup, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
  if (hs && chain.length) {
    chain.slice(-(p.history.lastRow - p.history.firstRow + 1)).forEach((t, i) => {
      const r = p.history.firstRow + i;
      const a = t.approval || {};
      const rowVals = {
        rev: t.rev, date: fmtDate(a.at), time: a.at ? new Date(a.at).toTimeString().slice(0, 5) : '',
        changed_by: t.people.set_by || '', ipqc: t.people.ipqc_confirm || t.people.checked_by || '',
        verification: t.people.checked_by || '', approved_by: t.people.approved_by || '',
        reason: [a.reason, a.changes && a.changes.length ? a.changes.map(c => `${c.k && p.fieldMap[c.k] ? p.fieldMap[c.k].label : c.label} ${c.from}→${c.to}`).join(', ') : ''].filter(Boolean).join('. ') || (t.rev === 0 ? 'First standard' : ''),
      };
      for (const [col, k] of Object.entries(p.history.cols)) {
        const v = k in rowVals ? rowVals[k] : val(t, k);
        put(hs, col + r, v, { size: k === 'reason' ? 6 : 7, left: k === 'reason', shrink: k !== 'reason', wrap: k === 'reason' });
      }
    });
  }

  // ---- Photos sheet ----
  const ps = wb.addWorksheet('Photos', { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  ps.columns = [{ width: 2 }, ...Array(8).fill({ width: 10 }), { width: 2 }, { width: 26 }, { width: 12 }, { width: 8 }, { width: 16 }, { width: 12 }, { width: 16 }];
  ps.getCell('B1').value = `Screen photos – ${trial.machine.no} ${trial.brand} – ${val(trial, 'mould_code')} ${val(trial, 'part_no')} ${trial.trialNo ? '– Trial ' + trial.trialNo : ''}`;
  ps.getCell('B1').font = { bold: true, size: 13, color: { argb: 'FF2F3031' } };
  const npi = path.join(__dirname, '..', 'brand', 'npi-logo-compact.png');
  if (fs.existsSync(npi)) { ps.getRow(1).height = 42; ps.addImage(wb.addImage({ filename: npi, extension: 'png' }), { tl: { col: 14.2, row: 0.1 }, ext: { width: 100, height: 54 } }); }
  let row = 3;
  for (const sc of p.screens) {
    const ph = (trial.photos[sc.id] || []).slice(-1)[0];
    const keys = sc.fields.filter(k => val(trial, k) !== '');
    if (!ph && !keys.length) continue;
    ps.getCell('B' + row).value = sc.title; ps.getCell('B' + row).font = { bold: true, size: 11 };
    if (ph && ph.read && ph.read.at) { ps.getCell('K' + row).value = `Read ${new Date(ph.read.at).toLocaleString('en-GB')} (${ph.read.model || ''})`; ps.getCell('K' + row).font = { size: 8, color: { argb: 'FF666666' } }; }
    const top = row + 1;
    let imgRows = 0;
    if (ph) {
      const file = store.photoPath(trial.id, ph.file);
      if (fs.existsSync(file)) {
        const buf = fs.readFileSync(file);
        const { w, h } = jpegSize(buf);
        const W = 560, Hh = Math.round(W * h / w);
        ps.addImage(wb.addImage({ buffer: buf, extension: 'jpeg' }), { tl: { col: 1, row: top - 1 }, ext: { width: W, height: Hh } });
        imgRows = Math.ceil(Hh / 20) + 1;
      }
    }
    const hdr = ['Parameter', 'Value', 'Unit', 'Window (min – max)', 'Source', 'Checked'];
    hdr.forEach((t, i) => { const c = ps.getCell(top, 11 + i); c.value = t; c.font = { bold: true, size: 9 }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } }; });
    let r2 = top + 1;
    for (const k of sc.fields) {
      const fl = p.fieldMap[k], x = trial.values[k] || {};
      const lim = limits(fl, x.v);
      const dec = /^-?\d+\.(\d+)$/.exec(String(x.v ?? '').trim());
      [fl.label, dec ? String(x.v) : asCell(x.v ?? ''), fl.unit, lim ? `${lim.min} – ${lim.max}` : '', x.src === 'ai' ? `Claude (${x.conf || ''})` : x.src === 'ai-edited' ? 'Claude, corrected' : x.src === 'copy' ? `from Rev ${x.from ?? ''}` : x.src || '', x.ok ? '✓' : ''].forEach((t, i) => { const c = ps.getCell(r2, 11 + i); c.value = t; c.font = { size: 9 }; c.alignment = { horizontal: 'left' }; });
      if (trial.actuals && trial.actuals[k] != null) { const c = ps.getCell(r2, 17); c.value = 'actual ' + trial.actuals[k]; c.font = { size: 8, color: { argb: 'FF666666' } }; }
      r2++;
    }
    for (let rr = top; rr < r2; rr++) ps.getRow(rr).height = 15;
    row = Math.max(top + imgRows, r2) + 2;
  }
  return wb;
}

async function build(trial, chain) { return (await buildWorkbook(trial, chain)).xlsx.writeBuffer(); }

module.exports = { build, buildWorkbook, INPUT_BLUE };
