// Converts Alan Jones' 2025 road age-standard tables (xlsx) into src/engine/data/ageGradeRoad2025.json.
// Usage: node scripts/convert-age-tables.mjs <path-to-Age-Grade-Tables-clone>
// Reads the "AgeStdSec" sheet (standard times in seconds, one row per single year of age).
// No dependencies: includes a minimal zip + sheet XML reader.
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { execSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const repo = resolve(process.argv[2] ?? '../tasuki-cards-data');
const FILES = { M: '2025 Files/MaleRoadStd2025.xlsx', F: '2025 Files/FemaleRoadStd2025.xlsx' };
const SHEET = 'AgeSt(?:d|an)Sec'; // male workbook: AgeStdSec, female: AgeStanSec

function unzip(buf) {
  // Locate the end-of-central-directory record, then walk the central directory.
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = {};
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const data = buf.subarray(start, start + compSize);
    out[name] = method === 0 ? data : inflateRawSync(data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function readSheet(path, sheetName) {
  const files = unzip(readFileSync(path));
  const text = (n) => files[n]?.toString('utf8');
  const shared = [...(text('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''),
  );
  const wb = text('xl/workbook.xml');
  const rid = new RegExp(`<sheet [^>]*name="${sheetName}"[^>]*r:id="(rId\\d+)"`).exec(wb)?.[1];
  const rels = text('xl/_rels/workbook.xml.rels');
  const target = new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1]
    ?? new RegExp(`Target="([^"]+)"[^>]*Id="${rid}"`).exec(rels)?.[1];
  if (!target) throw new Error(`sheet ${sheetName} not found in ${path}`);
  const xml = text('xl/' + target.replace(/^\/?xl\//, ''));
  const colIndex = (s) => [...s].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1;
  const rows = [];
  for (const rm of xml.matchAll(/<row [^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cm of rm[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const v = /<v>([\s\S]*?)<\/v>/.exec(cm[3] ?? '')?.[1];
      row[colIndex(cm[1])] = /t="s"/.test(cm[2]) && v != null ? shared[+v] : v;
    }
    rows[+rm[1] - 1] = row;
  }
  return rows;
}

function convert(path) {
  const rows = readSheet(path, SHEET).filter(Boolean);
  const title = rows[0][0];
  const distRow = rows.find((r) => r[0] === 'Distance');
  const nameRow = rows.find((r) => r[0] === 'Age');
  const distancesKm = distRow.slice(1).filter((x) => x != null && x !== '').map(Number);
  const distanceNames = nameRow.slice(1, 1 + distancesKm.length);
  const ageRows = rows.filter((r) => /^\d+$/.test(String(r[0] ?? '')));
  const ages = ageRows.map((r) => Number(r[0]));
  const secs = ageRows.map((r) => r.slice(1, 1 + distancesKm.length).map((x) => Math.round(Number(x) * 1000) / 1000));
  const open = rows.find((r) => r[0] === 'OC sec').slice(1, 1 + distancesKm.length).map((x) => Math.round(Number(x)));
  for (let i = 1; i < ages.length; i++) if (ages[i] !== ages[i - 1] + 1) throw new Error('ages not contiguous');
  return { title, distanceNames, distancesKm, minAge: ages[0], maxAge: ages.at(-1), openClassSec: open, standardsSec: secs };
}

const commit = execSync('git rev-parse HEAD', { cwd: repo }).toString().trim();
const commitDate = execSync('git log -1 --format=%cI', { cwd: repo }).toString().trim();
const out = {
  source: 'Alan Jones road age-grading standards 2025 (public domain), https://github.com/AlanLyttonJones/Age-Grade-Tables',
  commit,
  commitDate,
  files: FILES,
  sheet: { M: "AgeStdSec", F: "AgeStanSec" },
  convertedAt: new Date().toISOString().slice(0, 10),
  M: convert(join(repo, FILES.M)),
  F: convert(join(repo, FILES.F)),
};
const dest = resolve('src/engine/data/ageGradeRoad2025.json');
writeFileSync(dest, JSON.stringify(out));
console.log(`wrote ${dest}`);
console.log(`commit ${commit} (${commitDate})`);
for (const s of ['M', 'F']) {
  const t = out[s];
  console.log(`${s}: ${t.title} | ages ${t.minAge}-${t.maxAge} | ${t.distancesKm.length} distances ${t.distancesKm[0].toFixed(3)}..${t.distancesKm.at(-1)} km | open 5k ${t.openClassSec[1]}s`);
}
