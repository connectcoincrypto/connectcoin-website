import assert from 'node:assert/strict';
import { readFile, stat, readdir } from 'node:fs/promises';
import { dirname, resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = resolve(root, 'dist');
const html = await readFile(resolve(publicRoot, 'index.html'), 'utf8');
const css = await readFile(resolve(publicRoot, 'assets/site.css'), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const hosting = JSON.parse(await readFile(resolve(root, '.openai/hosting.json'), 'utf8'));

assert.equal(hosting.static.directory, 'dist');
assert.equal(ids.length, new Set(ids).size, 'IDs must be unique');
assert.match(html, /<html lang="en">/);
assert.match(html, /<meta name="viewport"/);
assert.match(html, /<meta name="description" content="[^"]+"/);
assert.match(html, /<link rel="canonical" href="https:\/\/connectcoincrypto\.com\/">/);
assert.match(html, /<link rel="icon"/);
assert.equal((html.match(/<h1\b/g) || []).length, 1, 'Use one main heading');
assert.match(html, /Test coins do not become mainnet coins/);
assert.match(css, /:focus-visible/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /@media \(max-width: 640px\)/);
assert.doesNotMatch(html, /<script\b/i, 'The landing page must work without JavaScript');

for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
  const ref = match[1];
  if (ref.startsWith('data:')) continue;
  if (ref.startsWith('#')) {
    assert.ok(ids.includes(ref.slice(1)), `Missing anchor or SVG symbol: ${ref}`);
  } else if (ref.startsWith('/')) {
    assert.ok(!ref.startsWith('//'), 'Use explicit HTTPS for external links');
    const path = resolve(publicRoot, `.${ref === '/' ? '/index.html' : ref}`);
    assert.ok(path.startsWith(publicRoot + sep));
    assert.ok((await stat(path)).isFile(), `Missing public asset: ${ref}`);
  } else {
    assert.equal(new URL(ref).protocol, 'https:', `Expected HTTPS link: ${ref}`);
  }
}
for (const match of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
  assert.match(match[0], /rel="noopener noreferrer"/, 'New tabs need safe rel attributes');
}
for (const match of html.matchAll(/<img\b[^>]*>/g)) {
  assert.match(match[0], /\balt="[^"]*"/, 'Images need alternative text or an empty alt');
  assert.match(match[0], /\bwidth="\d+"/);
  assert.match(match[0], /\bheight="\d+"/);
}
for (const expected of [
  'https://discord.gg/JYWbz5PsPp',
  'https://explorer.connectcoincrypto.com/',
  'https://github.com/connectcoincrypto/connectcoin',
  'https://github.com/connectcoincrypto/connectcoin#installation',
  '/whitepaper.pdf',
]) assert.ok(html.includes(`href="${expected}"`), `Missing destination: ${expected}`);

const projectListings = [...html.matchAll(/<a\b([^>]*href="https:\/\/chainquiry\.com\/projects\/connectcoin\/"[^>]*)>([\s\S]*?)<\/a>/g)];
assert.equal(projectListings.length, 1, 'Include the exact Chainquiry project link once');
assert.match(projectListings[0][1], /target="_blank"/);
assert.match(projectListings[0][1], /rel="noopener noreferrer"/);
assert.match(projectListings[0][2], /<h3>ConnectCoin on Chainquiry<\/h3>/);
assert.match(projectListings[0][2], /new tab/, 'Announce that Chainquiry opens in a new tab');

const socialSection = html.match(/<section class="socials" aria-labelledby="socials-title">([\s\S]*?)<\/section>/)?.[1];
assert.ok(socialSection, 'Social links need a labelled section');
assert.match(socialSection, /<h2 id="socials-title">/);
const socialLinks = [...socialSection.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
const expectedSocialLinks = new Map([
  ['https://youtu.be/zreQOn88MAg', 'YouTube'],
  ['https://www.instagram.com/connectcoincrypto/', 'Instagram'],
  ['https://www.tiktok.com/@connectcoin', 'TikTok'],
  ['https://x.com/connectcoincc', 'X'],
  ['https://t.me/connectcoincrypto', 'Telegram'],
]);
assert.equal(socialLinks.length, expectedSocialLinks.size, 'Keep all five requested social destinations');
for (const [destination, label] of expectedSocialLinks) {
  const matches = socialLinks.filter(link => link[1].includes(`href="${destination}"`));
  assert.equal(matches.length, 1, `Social destination must appear exactly once in the section: ${destination}`);
  assert.match(matches[0][1], /target="_blank"/);
  assert.match(matches[0][1], /rel="noopener noreferrer"/);
  assert.ok(matches[0][2].replace(/<[^>]+>/g, ' ').split(/\s+/).includes(label), `Missing visible platform label: ${label}`);
  assert.match(matches[0][2], /new tab/, `Missing new-tab announcement: ${label}`);
}
assert.doesNotMatch(html, /<iframe\b/i, 'Use direct social links without loading third-party embeds');

const pdf = await readFile(resolve(publicRoot, 'whitepaper.pdf'));
assert.equal(pdf.subarray(0, 5).toString(), '%PDF-', 'Whitepaper must be a PDF, not an HTML error');
assert.ok(pdf.subarray(-1024).toString().includes('%%EOF'), 'Whitepaper must be complete');
assert.ok(pdf.length > 10000, 'Whitepaper looks unexpectedly small');

let publicBytes = 0;
async function checkPublicFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    assert.ok(!entry.isSymbolicLink(), 'Do not publish symbolic links');
    if (entry.isDirectory()) await checkPublicFiles(path);
    else {
      assert.ok(['.html', '.css', '.png', '.pdf', '.txt', '.xml'].includes(extname(entry.name)), `Unexpected public file: ${entry.name}`);
      publicBytes += (await stat(path)).size;
    }
  }
}
await checkPublicFiles(publicRoot);
assert.ok(publicBytes < 1_100_000, 'Keep the entire site, including PDF, below 1.1 MB');
for (const script of ['serve.mjs', 'check.mjs']) {
  execFileSync(process.execPath, ['--check', resolve(root, 'scripts', script)], { stdio: 'pipe' });
}
console.log(`OK: page metadata, local assets, link targets, accessibility hooks, script syntax, PDF integrity (${pdf.length} bytes).`);
console.log(`Public directory: ${(publicBytes / 1024).toFixed(1)} KiB. No client-side JavaScript or runtime dependencies.`);
