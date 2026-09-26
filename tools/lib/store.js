// Simple JSON-file store. One file per trial so a broken write can only ever affect one record.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA = process.env.MPA_DATA || path.join(__dirname, '..', 'data');
const TRIALS = path.join(DATA, 'trials');
const PHOTOS = path.join(DATA, 'photos');
for (const d of [DATA, TRIALS, PHOTOS]) fs.mkdirSync(d, { recursive: true });

function writeAtomic(file, text) {
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

const cache = new Map();
function loadAll() {
  cache.clear();
  for (const f of fs.readdirSync(TRIALS)) {
    if (!f.endsWith('.json')) continue;
    try { const t = JSON.parse(fs.readFileSync(path.join(TRIALS, f), 'utf8')); cache.set(t.id, t); }
    catch (e) { console.error('Could not read', f, e.message); }
  }
}
loadAll();

const newId = () => new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + crypto.randomBytes(3).toString('hex');

module.exports = {
  DATA, PHOTOS,
  all: () => [...cache.values()],
  get: id => cache.get(id),
  save(t) { t.updatedAt = new Date().toISOString(); cache.set(t.id, t); writeAtomic(path.join(TRIALS, t.id + '.json'), JSON.stringify(t, null, 1)); return t; },
  remove(id) { cache.delete(id); try { fs.unlinkSync(path.join(TRIALS, id + '.json')); } catch {} fs.rmSync(path.join(PHOTOS, id), { recursive: true, force: true }); },
  newId,
  savePhoto(id, name, buf) { const dir = path.join(PHOTOS, id); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, name), buf); return name; },
  photoPath: (id, name) => path.join(PHOTOS, path.basename(id), path.basename(name)),
  readJson(name, dflt) { try { return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8')); } catch { return dflt; } },
  writeJson(name, obj) { writeAtomic(path.join(DATA, name), JSON.stringify(obj, null, 1)); },
};
