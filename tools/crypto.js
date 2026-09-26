// Same format as the NPI Tracker: PBKDF2-SHA256 (250k) -> AES-256-GCM, JSON {v, iter, salt, iv, ct} in base64.
// The PWA decrypts it in the browser with WebCrypto.
const crypto = require('crypto');
const ITER = 250000;
function encrypt(buf, code) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(code, salt, ITER, 32, 'sha256');
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(buf), c.final(), c.getAuthTag()]);
  return JSON.stringify({ v: 1, iter: ITER, salt: salt.toString('base64'), iv: iv.toString('base64'), ct: ct.toString('base64') });
}
function decrypt(text, code) {
  const e = JSON.parse(text);
  const key = crypto.pbkdf2Sync(code, Buffer.from(e.salt, 'base64'), e.iter, 32, 'sha256');
  const all = Buffer.from(e.ct, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(e.iv, 'base64'));
  d.setAuthTag(all.subarray(all.length - 16));
  return Buffer.concat([d.update(all.subarray(0, all.length - 16)), d.final()]);
}
module.exports = { encrypt, decrypt };

// CLI: node tools/crypto.js enc <in> <out> <code> | dec <in> <out> <code>
if (require.main === module) {
  const fs = require('fs');
  const [mode, inp, out, code] = process.argv.slice(2);
  if (!mode || !inp || !out || !code) { console.error('usage: node tools/crypto.js enc|dec <in> <out> <passcode>'); process.exit(1); }
  if (mode === 'enc') fs.writeFileSync(out, encrypt(fs.readFileSync(inp), code));
  else fs.writeFileSync(out, decrypt(fs.readFileSync(inp, 'utf8'), code));
  console.log(`${mode} ${inp} -> ${out}`);
}
