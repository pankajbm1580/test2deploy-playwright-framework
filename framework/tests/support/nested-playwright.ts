import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export const repoRoot = path.resolve(__dirname, '../../..');

/** An import specifier (a quoted string) for a repository file, usable from a config in a temporary folder. */
export const repoImport = (file: string): string => JSON.stringify(path.join(repoRoot, file).split(path.sep).join('/'));

/**
 * Runs Playwright in `dir` with a clean environment (no worker, API, UI or report variables
 * from the current run) plus `env`. Reports and results resolve against `dir`.
 */
export function runPlaywright(dir: string, env: NodeJS.ProcessEnv, ...args: string[]): { status: number | null; output: string } {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(
      // PLAYWRIGHT_BROWSERS_PATH is kept: it tells Playwright where the installed browsers are.
      ([name]) =>
        name === 'PLAYWRIGHT_BROWSERS_PATH' || !/^(TEST_|PW_|PWTEST|PLAYWRIGHT_|API_|UI_|LOGIN_DEMO_|ALLOW_PRODUCTION$|FORCE_COLOR$)/.test(name),
    ),
  );
  const cli = path.join(repoRoot, 'node_modules/@playwright/test/cli.js');
  const result = spawnSync(process.execPath, [cli, 'test', '-c', 'playwright.config.ts', ...args], {
    cwd: dir,
    env: { ...inherited, ...env, NO_COLOR: '1' },
    encoding: 'utf8',
    timeout: 150_000,
  });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

/**
 * The text of every file Playwright wrote under `dir` (results, attachments, JUnit, HTML
 * report), plus the report data embedded in an HTML report's index.html, unpacked.
 */
export function writtenTexts(dir: string, skip: (file: string) => boolean = () => false): { file: string; text: string }[] {
  const texts: { file: string; text: string }[] = [];
  const walk = (target: string) => {
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      const file = path.join(target, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (!skip(file)) {
        const text = fs.readFileSync(file).toString('utf8');
        texts.push({ file, text });
        if (entry.name === 'index.html') texts.push(...embeddedReport(file, text));
      }
    }
  };
  walk(dir);
  return texts;
}

// The HTML report embeds its data as a base64 zip of JSON files.
function embeddedReport(file: string, html: string): { file: string; text: string }[] {
  const match = /data:application\/zip;base64,([A-Za-z0-9+/=]+)/.exec(html);
  if (!match) return [];
  const zip = Buffer.from(match[1], 'base64');
  const entries: { file: string; text: string }[] = [];
  for (let offset = 0; offset + 30 <= zip.length && zip.readUInt32LE(offset) === 0x04034b50; ) {
    const method = zip.readUInt16LE(offset + 8);
    const size = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const start = offset + 30 + nameLength + extraLength;
    const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const data = zip.subarray(start, start + size);
    entries.push({ file: `${file} :: ${name}`, text: (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8') });
    offset = start + size;
  }
  return entries;
}
