// Builds review-pack/: the whole project as a handful of Markdown files that can be pasted or uploaded to
// another model for criticism. Personal identifiers are replaced with placeholders.
// Usage: node scripts/make-review-pack.mjs
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'review-pack');

function walk(dir) {
  return readdirSync(join(root, dir))
    .sort()
    .flatMap((name) => {
      const rel = join(dir, name);
      return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel];
    });
}

const isTest = (f) => /\.test\.tsx?$/.test(f);
const isCode = (f) => ['.ts', '.tsx', '.css', '.mjs', '.rules', '.json', '.html', '.yml'].includes(extname(f));
const src = walk('src').filter((f) => isCode(f) && !f.includes('/fixtures/') && !f.endsWith('ageGradeRoad2025.json'));

/** Placeholders for anything that identifies a person or the school's accounts. */
function redact(text) {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => (m.endsWith('anthropic.com') ? m : 'person@school.example'))
    .replace(/harrowappi\[?\.\]?jp/gi, 'school.example')
    .replace(/harrowappi\\\.jp/gi, 'school\\.example')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '00000000-0000-0000-0000-000000000000')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, 'REDACTED_KEY')
    .replace(/Fabian Loke/g, 'the head coach')
    .replace(/\bFabian(?:'s)?\b/g, (m) => (m.endsWith("'s") ? "the head coach's" : 'the head coach'))
    .replace(/\bMr Loke\b/g, 'the head coach')
    .replace(/\bLoke\b/g, 'Coach')
    .replace(/\bfloke\b/gi, 'headcoach')
    .replace(/C:\\Users\\[A-Za-z0-9._-]+/g, 'C:\\Users\\coach');
}

const LANG = { '.ts': 'ts', '.tsx': 'tsx', '.css': 'css', '.mjs': 'js', '.json': 'json', '.html': 'html', '.yml': 'yaml', '.rules': 'text', '.md': 'markdown' };

function section(file) {
  const body = redact(readFileSync(join(root, file), 'utf8')).replace(/\s+$/, '');
  const rel = relative(root, join(root, file));
  if (extname(file) === '.md') return `\n\n<!-- ===== FILE: ${rel} ===== -->\n\n${body}`;
  // A longer fence than any run of backticks inside the file.
  const fence = '`'.repeat(Math.max(3, ...(body.match(/`+/g) ?? []).map((x) => x.length + 1)));
  return `\n\n## FILE: ${rel}\n\n${fence}${LANG[extname(file)] ?? ''}\n${body}\n${fence}`;
}

function write(name, title, intro, files) {
  const head = `# Tasuki Cards review pack: ${title}\n\n${intro}\n\nFiles in this part (${files.length}):\n${files.map((f) => `- \`${f}\``).join('\n')}`;
  const text = head + files.map(section).join('') + '\n';
  writeFileSync(join(out, name), text);
  return text;
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const commit = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
const stamp = `Source: commit ${commit}. Read 00-BRIEF.md first.`;

const inDir = (d) => (f) => f.startsWith(d);
const engineTop = src.filter((f) => /^src\/engine\/[^/]+$/.test(f) && !isTest(f));
const intakeTop = ['src/engine/names.ts', 'src/engine/time.ts'];
const parts = [];

const brief = redact(readFileSync(join(root, 'docs/REVIEW-BRIEF.md'), 'utf8'));
writeFileSync(join(out, '00-BRIEF.md'), brief);
parts.push(brief);

parts.push(
  write('01-engine-scoring.md', 'data model and scoring engine', stamp, ['src/types.ts', ...engineTop.filter((f) => !intakeTop.includes(f)), 'src/demo/demoData.ts']),
  write('02-engine-intake.md', 'intake: parsers, names and times', stamp, [...intakeTop, ...src.filter((f) => inDir('src/engine/parse/')(f) && !isTest(f)), 'docs/LINE-FORMAT.md']),
  write('03-store-cloud-security.md', 'persistence, website and security rules', stamp, [
    ...src.filter((f) => (inDir('src/store/')(f) || inDir('src/cloud/')(f)) && !isTest(f)),
    'firestore.rules',
    'firebase.json',
    '.github/workflows/deploy.yml',
    'package.json',
    'vite.config.ts',
    'tsconfig.json',
    'index.html',
  ]),
  write('04-ui.md', 'interface', stamp, ['src/main.tsx', 'src/vite-env.d.ts', ...src.filter((f) => inDir('src/ui/')(f) && !isTest(f))]),
  write('05-project-docs.md', 'project documents', `${stamp} These are the project's own records: the original spec, every decision since, and the safeguarding note.`, [
    'README.md',
    'HOW-TO-USE.md',
    'docs/TASUKI-BUILD-BRIEF.md',
    'docs/GO-LIVE-PLAN.md',
    'docs/YAMA-PLAN.md',
    'DECISIONS.md',
    'BUILD-REPORT.md',
    'docs/WEBSITE-SETUP.md',
    'docs/SAFEGUARDING-NOTE.md',
  ]),
);
write('06-tests.md', 'unit tests (worked examples)', stamp, src.filter(isTest));
writeFileSync(join(out, 'ALL-IN-ONE.md'), parts.join('\n\n---\n\n'));

for (const f of readdirSync(out).sort()) {
  const n = statSync(join(out, f)).size;
  console.log(`${f.padEnd(30)} ${(n / 1024).toFixed(0).padStart(6)} KB  ~${Math.round(n / 3.6 / 1000)}k tokens`);
}
