// Issues the Standard Moulding Parameter as a PDF, without Excel or LibreOffice.
// Page 1 = the EXZONE form (FRONT), page 2 = History Data Sheet (BACK), then photo evidence pages.
// The form pages are drawn straight from the filled workbook (column widths, row heights,
// merges, borders, fonts, alignment), so the PDF matches the controlled form layout.
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { buildWorkbook, INPUT_BLUE } = require('./excel');
const { PROFILES, limits } = require('./profiles');
const store = require('./store');

const FONTS = path.join(__dirname, '..', 'fonts');
const F = n => path.join(FONTS, n + '.ttf');
const FACES = {
  serif: { r: F('LiberationSerif-Regular'), b: F('LiberationSerif-Bold'), i: F('LiberationSerif-Italic'), bi: F('LiberationSerif-BoldItalic') },
  sans: { r: F('LiberationSans-Regular'), b: F('LiberationSans-Bold'), i: F('LiberationSans-Italic'), bi: F('LiberationSans-BoldItalic') },
  symbol: { r: F('DejaVuSans'), b: F('DejaVuSans-Bold'), i: F('DejaVuSans'), bi: F('DejaVuSans-Bold') },
};
const PRINT_AREA = { NISSEI: { FRONT: 'A1:AR47', BACK: 'A1:AP28' }, ARBURG: { FRONT: 'A1:AU64', BACK: 'A1:BB27' } };
const NPI_LOGO = path.join(__dirname, '..', 'brand', 'npi-logo-compact.png');

// ------------------------------------------------------------- helpers
const colNum = s => s.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const addr = a => { const m = /^([A-Z]+)(\d+)$/.exec(a); return { c: colNum(m[1]), r: +m[2] }; };
const hex = argb => (argb && argb.length >= 6 ? '#' + argb.slice(-6) : null);

function faceFor(font, text) {
  const n = ((font && font.name) || 'Arial').toLowerCase();
  const fam = /[✓⁰]/.test(text) ? 'symbol' : /garamond|times|serif|georgia|book/.test(n) ? 'serif' : 'sans';
  const k = font && font.bold ? (font.italic ? 'bi' : 'b') : (font && font.italic ? 'i' : 'r');
  return FACES[fam][k];
}

function display(cell) {
  let v = cell.value;
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(t => t.text).join('');
    if (v instanceof Date) return `${String(v.getUTCDate()).padStart(2, '0')}/${String(v.getUTCMonth() + 1).padStart(2, '0')}/${v.getUTCFullYear()}`;
    if ('result' in v) v = v.result; else if (v.text) return String(v.text); else return '';
  }
  if (typeof v === 'number') {
    const fmt = cell.numFmt || '';
    const m = /^0(\.(0+))?$/.exec(fmt);
    if (m) return v.toFixed(m[2] ? m[2].length : 0);
    return String(Math.round(v * 1e6) / 1e6);
  }
  return String(v);
}

// Draw one worksheet range scaled to fit the page box
function drawSheet(doc, ws, range, box) {
  const [a, b] = range.split(':').map(addr);
  const dCol = (ws.properties && ws.properties.defaultColWidth) || 9.14;
  const dRow = (ws.properties && ws.properties.defaultRowHeight) || 12.75;
  const colW = [], rowH = [];
  for (let c = a.c; c <= b.c; c++) { const col = ws.getColumn(c); colW[c] = col.hidden ? 0 : ((col.width || dCol) * 7 + 5) * 0.75; }
  for (let r = a.r; r <= b.r; r++) { const row = ws.getRow(r); rowH[r] = row.hidden ? 0 : (row.height || dRow); }
  const X = [], Y = [];
  X[a.c] = 0; for (let c = a.c; c <= b.c; c++) X[c + 1] = X[c] + colW[c];
  Y[a.r] = 0; for (let r = a.r; r <= b.r; r++) Y[r + 1] = Y[r] + rowH[r];
  const W = X[b.c + 1], H = Y[b.r + 1];
  const s = Math.min(box.w / W, box.h / H);

  // merges
  const master = new Map(), slave = new Map();
  for (const m of Object.values(ws._merges || {})) {
    const mm = m.model || m;
    master.set(`${mm.top},${mm.left}`, mm);
    for (let r = mm.top; r <= mm.bottom; r++) for (let c = mm.left; c <= mm.right; c++) slave.set(`${r},${c}`, mm);
  }
  const inRange = (r, c) => r >= a.r && r <= b.r && c >= a.c && c <= b.c;
  const hasValue = (r, c) => { const cl = ws.findCell ? ws.findCell(r, c) : ws.getCell(r, c); return cl && cl.value != null && cl.value !== ''; };

  // Coordinates are scaled, so stop pdfkit from starting new pages when text runs past the unscaled page end
  doc.page.margins = { top: 0, left: 0, right: 0, bottom: -1e7 };
  doc.save();
  doc.translate(box.x + (box.w - W * s) / 2, box.y);
  doc.scale(s);

  // 1) fills
  for (let r = a.r; r <= b.r; r++) for (let c = a.c; c <= b.c; c++) {
    const mm = slave.get(`${r},${c}`);
    if (mm && (mm.top !== r || mm.left !== c)) continue;
    const cell = ws.getCell(r, c);
    const fill = cell.fill;
    if (fill && fill.type === 'pattern' && fill.pattern === 'solid' && fill.fgColor && fill.fgColor.argb) {
      const col = hex(fill.fgColor.argb);
      if (col && col.toLowerCase() !== '#ffffff') {
        const r2 = mm ? Math.min(mm.bottom, b.r) : r, c2 = mm ? Math.min(mm.right, b.c) : c;
        doc.rect(X[c], Y[r], X[c2 + 1] - X[c], Y[r2 + 1] - Y[r]).fill(col);
      }
    }
  }

  // 2) images (e.g. water-system sketches added by the export)
  for (const im of ws.getImages ? ws.getImages() : []) {
    try {
      const media = ws._workbook.getImage(Number(im.imageId));
      const tl = im.range.tl;
      const fc = typeof tl.col === 'number' ? tl.col : tl.nativeCol, fr = typeof tl.row === 'number' ? tl.row : tl.nativeRow;
      const nc = Math.floor(fc) + 1, nr = Math.floor(fr) + 1;
      if (!inRange(nr, nc)) continue;
      const x = X[nc] + (fc - Math.floor(fc)) * colW[nc], y = Y[nr] + (fr - Math.floor(fr)) * rowH[nr];
      let w, h;
      if (im.range.ext) { w = im.range.ext.width * 0.75; h = im.range.ext.height * 0.75; }
      else if (im.range.br) { const br = im.range.br; const bc = Math.floor(br.col) + 1, brr = Math.floor(br.row) + 1; w = X[bc] + (br.col % 1) * colW[bc] - x; h = Y[brr] + (br.row % 1) * rowH[brr] - y; }
      const buf = media.buffer || (media.filename && fs.readFileSync(media.filename));
      if (buf && w > 0 && h > 0) doc.image(buf, x, y, { width: w, height: h });
    } catch (e) { /* skip unreadable image */ }
  }

  // 3) text
  for (let r = a.r; r <= b.r; r++) for (let c = a.c; c <= b.c; c++) {
    const mm = slave.get(`${r},${c}`);
    if (mm && (mm.top !== r || mm.left !== c)) continue;
    const cell = ws.getCell(r, c);
    let text = display(cell);
    if (!text.trim()) continue;
    text = text.replace(/\r/g, '');
    const r2 = mm ? Math.min(mm.bottom, b.r) : r, c2 = mm ? Math.min(mm.right, b.c) : c;
    let x0 = X[c], x1 = X[c2 + 1];
    const y0 = Y[r], y1 = Y[r2 + 1];
    const font = cell.font || {};
    const al = cell.alignment || {};
    let size = font.size || 10;
    const color = (font.color && hex(font.color.argb)) || '#000000';
    const isNum = typeof cell.value === 'number';
    const hAlign = al.horizontal && al.horizontal !== 'general' ? al.horizontal : (isNum ? 'right' : 'left');
    doc.font(faceFor(font, text)).fillColor(color);

    if (al.textRotation === 90 || al.textRotation === 'vertical') {
      doc.fontSize(size);
      const tw = doc.widthOfString(text);
      if (tw > (y1 - y0) - 2) { size = size * ((y1 - y0) - 2) / tw; doc.fontSize(size); }
      doc.save();
      doc.rect(x0, y0, x1 - x0, y1 - y0).clip();
      doc.translate((x0 + x1) / 2 + size * 0.35, y1 - 1).rotate(-90);
      doc.text(text, 0, -size * 0.8, { width: y1 - y0 - 2, align: 'center', lineBreak: false });
      doc.restore();
      continue;
    }

    const padX = 1.5;
    let cw = x1 - x0 - 2 * padX;
    doc.fontSize(size);
    const lines = text.split('\n');
    const tw = Math.max(...lines.map(l => doc.widthOfString(l)));
    if (al.shrinkToFit && tw > cw) { size = Math.max(3.5, size * cw / tw); doc.fontSize(size); }

    // Let plain text run into empty neighbours, like Excel does
    let clipX0 = x0, clipX1 = x1;
    if (!al.wrapText && !al.shrinkToFit && doc.widthOfString(text) > cw && !mm) {
      if (hAlign === 'left' || hAlign === 'center') { let k = c2 + 1; while (k <= b.c && !hasValue(r, k) && !slave.has(`${r},${k}`)) { clipX1 = X[k + 1]; k++; } }
      if (hAlign === 'right' || hAlign === 'center') { let k = c - 1; while (k >= a.c && !hasValue(r, k) && !slave.has(`${r},${k}`)) { clipX0 = X[k]; k--; } }
    }
    const lh = size * 1.15;
    const wrap = !!al.wrapText;
    const boxW = (hAlign === 'left' ? clipX1 - x0 : hAlign === 'right' ? x1 - clipX0 : clipX1 - clipX0) - 2 * padX;
    const textH = wrap ? doc.heightOfString(text, { width: x1 - x0 - 2 * padX }) : lines.length * lh;
    const v = al.vertical || 'bottom';
    const ty = v === 'top' ? y0 + 1 : v === 'middle' || v === 'center' ? y0 + (y1 - y0 - textH) / 2 + 0.5 : y1 - textH - 0.5;
    doc.save();
    doc.rect(clipX0, y0, clipX1 - clipX0, y1 - y0).clip();
    const tx = hAlign === 'left' ? x0 + padX : hAlign === 'right' ? clipX0 + padX : clipX0 + padX;
    doc.text(text, tx, ty, { width: wrap ? x1 - x0 - 2 * padX : boxW, align: hAlign === 'centerContinuous' ? 'center' : hAlign === 'justify' ? 'left' : hAlign, lineBreak: wrap, underline: !!font.underline, lineGap: 0 });
    doc.restore();
  }

  // 4) borders (drawn last so they sit on top)
  const LW = { hair: 0.25, thin: 0.5, dotted: 0.5, dashed: 0.5, dashDot: 0.5, dashDotDot: 0.5, medium: 1.1, mediumDashed: 1.1, mediumDashDot: 1.1, mediumDashDotDot: 1.1, slantDashDot: 1.1, thick: 1.7, double: 0.4 };
  const seg = (x1, y1, x2, y2, st, col) => {
    doc.save().strokeColor(col || '#000000').lineWidth(LW[st] || 0.5);
    if (/dot/i.test(st) && !/dash/i.test(st)) doc.dash(0.6, { space: 1 }); else if (/dash/i.test(st)) doc.dash(2.5, { space: 1.5 });
    if (st === 'double') {
      const vert = x1 === x2, o = 0.7;
      doc.moveTo(x1 - (vert ? o : 0), y1 - (vert ? 0 : o)).lineTo(x2 - (vert ? o : 0), y2 - (vert ? 0 : o)).stroke();
      doc.moveTo(x1 + (vert ? o : 0), y1 + (vert ? 0 : o)).lineTo(x2 + (vert ? o : 0), y2 + (vert ? 0 : o)).stroke();
    } else doc.moveTo(x1, y1).lineTo(x2, y2).stroke();
    doc.undash().restore();
  };
  for (let r = a.r; r <= b.r; r++) for (let c = a.c; c <= b.c; c++) {
    const cell = ws.getCell(r, c);
    const bd = cell.border; if (!bd) continue;
    const mm = slave.get(`${r},${c}`);
    const edge = { top: !mm || r === mm.top, bottom: !mm || r === mm.bottom, left: !mm || c === mm.left, right: !mm || c === mm.right };
    const col = side => (bd[side] && bd[side].color && hex(bd[side].color.argb)) || '#000000';
    if (bd.top && bd.top.style && edge.top) seg(X[c], Y[r], X[c + 1], Y[r], bd.top.style, col('top'));
    if (bd.bottom && bd.bottom.style && edge.bottom) seg(X[c], Y[r + 1], X[c + 1], Y[r + 1], bd.bottom.style, col('bottom'));
    if (bd.left && bd.left.style && edge.left) seg(X[c], Y[r], X[c], Y[r + 1], bd.left.style, col('left'));
    if (bd.right && bd.right.style && edge.right) seg(X[c + 1], Y[r], X[c + 1], Y[r + 1], bd.right.style, col('right'));
  }
  doc.restore();
  return { width: W * s, height: H * s };
}

function watermark(doc, text) {
  doc.save();
  doc.font(FACES.sans.b).fontSize(64).fillColor('#c62828').fillOpacity(0.08);
  doc.translate(doc.page.width / 2, doc.page.height / 2).rotate(-28);
  doc.text(text, -400, -40, { width: 800, align: 'center', lineBreak: false });
  doc.restore();
  doc.fillOpacity(1);
}

// ------------------------------------------------------------- photo evidence pages
function photoPages(doc, trial) {
  const p = PROFILES[trial.brand];
  const v = k => (trial.values[k] && trial.values[k].v != null ? String(trial.values[k].v) : '');
  const M = 28, PW = doc.page.width, PH = doc.page.height;
  let y = PH; // force new page on first block
  const header = () => {
    doc.addPage();
    if (fs.existsSync(NPI_LOGO)) doc.image(NPI_LOGO, PW - M - 70, M - 6, { height: 38 });
    doc.font(FACES.sans.b).fontSize(12).fillColor('#2f3031').text('Screen photo evidence', M, M);
    doc.font(FACES.sans.r).fontSize(8.5).fillColor('#555').text(`${trial.machine.no} ${trial.brand} ${trial.machine.model || ''} · ${v('mould_code')} ${v('part_no')} ${v('part_name')}${trial.trialNo ? ' · Trial ' + trial.trialNo : ''} · ${trial.status}${trial.rev != null ? ' Rev ' + trial.rev : ''}`, M, M + 16);
    doc.moveTo(M, M + 30).lineTo(PW - M, M + 30).lineWidth(1.2).strokeColor('#0450b1').stroke();
    y = M + 40;
  };
  for (const sc of p.screens) {
    const ph = (trial.photos[sc.id] || []).slice(-1)[0];
    const keys = sc.fields.filter(k => v(k) !== '');
    if (!ph && !keys.length) continue;
    const rows = sc.fields.filter(k => v(k) !== '');
    const imgW = 330;
    let imgH = 0, buf = null;
    if (ph) { const f = store.photoPath(trial.id, ph.file); if (fs.existsSync(f)) { buf = fs.readFileSync(f); const img = doc.openImage(buf); imgH = imgW * img.height / img.width; } }
    const rowH = 11.5;
    const blockH = 18 + Math.max(imgH, 14 + rows.length * rowH) + 14;
    if (y + blockH > PH - M) header();
    doc.font(FACES.sans.b).fontSize(10).fillColor('#0450b1').text(sc.title, M, y);
    const allCopied = rows.length && rows.every(k => trial.values[k].src === 'copy');
    const meta = ph ? `Photo ${new Date(ph.at).toLocaleString('en-GB')}${ph.by ? ' · ' + ph.by : ''}` : allCopied ? `No new photo – values carried over from Rev ${trial.values[rows[0]].from ?? ''}` : 'No photo – values entered by hand';
    doc.font(FACES.sans.r).fontSize(7.5).fillColor('#777').text(meta, M + 200, y + 2, { width: PW - 2 * M - 200, align: 'right' });
    const top = y + 16;
    if (buf) { doc.image(buf, M, top, { width: imgW }); doc.rect(M, top, imgW, imgH).lineWidth(0.5).strokeColor('#999').stroke(); }
    // table
    const tx = M + imgW + 16, cols = [150, 62, 34, 92, 70, 28];
    const hdr = ['Parameter', 'Value', 'Unit', 'Window (min – max)', 'Source', 'Chk'];
    let cx = tx;
    doc.rect(tx, top, cols.reduce((s, w) => s + w, 0), 13).fill('#e9edf3');
    hdr.forEach((h, i) => { doc.font(FACES.sans.b).fontSize(7.5).fillColor('#2f3031').text(h, cx + 3, top + 3, { width: cols[i] - 4, lineBreak: false }); cx += cols[i]; });
    let ry = top + 14;
    for (const k of rows) {
      const fl = p.fieldMap[k], x = trial.values[k];
      const lim = limits(fl, x.v);
      const src = x.src === 'ai' ? `Claude (${x.conf || ''})` : x.src === 'ai-edited' ? 'Claude, corrected' : x.src === 'copy' ? `from Rev ${x.from ?? ''}` : 'typed';
      const cells = [fl.label, String(x.v), fl.unit, lim ? `${lim.min} – ${lim.max}` : '', src, x.ok ? '✓' : ''];
      cx = tx;
      cells.forEach((t, i) => {
        const blue = i === 1;
        doc.font(i === 5 ? FACES.symbol.r : blue ? FACES.sans.b : FACES.sans.r).fontSize(7.5).fillColor(blue ? '#' + INPUT_BLUE.slice(-6) : '#333').text(t, cx + 3, ry + 2, { width: cols[i] - 4, lineBreak: false });
        cx += cols[i];
      });
      doc.moveTo(tx, ry + rowH).lineTo(cx, ry + rowH).lineWidth(0.3).strokeColor('#dde1e7').stroke();
      ry += rowH;
    }
    y = top + Math.max(imgH, ry - top) + 16;
  }
}

// ------------------------------------------------------------- main
async function build(trial, chain) {
  const wb = await buildWorkbook(trial, chain);
  const p = PROFILES[trial.brand];
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, autoFirstPage: false,
    info: { Title: `${p.title} – ${trial.machine.no} ${(trial.values.mould_code || {}).v || ''}`, Author: 'EXZONE NPI – Molding Parameter App', Subject: p.form } });
  const chunks = [];
  doc.on('data', d => chunks.push(d));
  const done = new Promise(res => doc.on('end', res));
  const M = 22;
  const approved = trial.status === 'Approved' || trial.status === 'Superseded';

  const front = wb.worksheets[0];
  doc.addPage();
  drawSheet(doc, front, PRINT_AREA[trial.brand].FRONT, { x: M, y: M, w: doc.page.width - 2 * M, h: doc.page.height - 2 * M });
  if (!approved) watermark(doc, `${trial.status.toUpperCase()} – NOT APPROVED`);
  else if (trial.status === 'Superseded') watermark(doc, 'SUPERSEDED');

  const back = wb.getWorksheet(p.history.sheet);
  if (back) {
    doc.addPage();
    drawSheet(doc, back, PRINT_AREA[trial.brand].BACK, { x: M, y: M, w: doc.page.width - 2 * M, h: doc.page.height - 2 * M });
  }
  photoPages(doc, trial);
  doc.end();
  await done;
  return Buffer.concat(chunks);
}

module.exports = { build };
