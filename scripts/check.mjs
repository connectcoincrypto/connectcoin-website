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
const faviconLinks = [...html.matchAll(/<link\b[^>]*\brel="icon"[^>]*>/g)].map(match => match[0]);
assert.equal(faviconLinks.length, 2, 'Provide the supplied logo as 32px and 192px PNG favicons');
assert.doesNotMatch(faviconLinks.join('\n'), /href="data:image\/svg\+xml/i, 'Replace the old inline SVG favicon');
for (const size of [32, 192]) {
  const path = `/assets/favicon-${size}.png`;
  const links = faviconLinks.filter(link => link.includes(`href="${path}"`));
  assert.equal(links.length, 1, `Include the favicon once: ${path}`);
  assert.match(links[0], /\btype="image\/png"/);
  assert.ok(links[0].includes(`sizes="${size}x${size}"`), `Declare the favicon dimensions: ${path}`);
  const png = await readFile(resolve(publicRoot, `.${path}`));
  assert.ok(png.length >= 33, `Favicon PNG header is incomplete: ${path}`);
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `Favicon must be a PNG: ${path}`);
  assert.equal(png.readUInt32BE(8), 13, `Favicon must have a valid IHDR chunk: ${path}`);
  assert.equal(png.subarray(12, 16).toString(), 'IHDR', `Favicon must begin with IHDR: ${path}`);
  assert.equal(png.readUInt32BE(16), size, `Unexpected favicon width: ${path}`);
  assert.equal(png.readUInt32BE(20), size, `Unexpected favicon height: ${path}`);
}
assert.equal((html.match(/<h1\b/g) || []).length, 1, 'Use one main heading');
assert.match(html, /Test coins do not become mainnet coins/);
assert.match(css, /:focus-visible/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /@media \(max-width: 640px\)/);
assert.doesNotMatch(html, /<script\b/i, 'The authored homepage must not contain scripts');

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
assert.match(html, /<div class="page-shell">\s*<header class="header">/, 'Keep the header first inside the page shell');
assert.doesNotMatch(html, /\bclass="site-banner"/, 'Do not restore the standalone banner');
assert.doesNotMatch(html, /\bsrc="\/assets\/connectcoin-banner\.webp"/, 'Keep the former banner asset retained but unused');
const header = html.match(/<header class="header">([\s\S]*?)<\/header>/)?.[1];
assert.ok(header, 'Keep the main header');
const brands = [...header.matchAll(/<a class="brand"([^>]*)>([\s\S]*?)<\/a>/g)];
assert.equal(brands.length, 1, 'Show one brand link inside the header');
assert.ok(brands[0].index < header.indexOf('<nav class="navigation"'), 'Place the brand logo and name before the navigation');
assert.match(brands[0][1], /\bhref="\/"/);
assert.match(brands[0][1], /\baria-label="ConnectCoin home"/);
assert.match(brands[0][2], /^\s*<span class="brand-mark"><img\b[^>]*><\/span>\s*<span>ConnectCoin<\/span>\s*$/, 'Keep the original header layout with a small logo and ConnectCoin text');
const brandImages = [...brands[0][2].matchAll(/<img\b[^>]*>/g)];
assert.equal(brandImages.length, 1, 'Show one supplied logo in the header brand link');
assert.match(brandImages[0][0], /\bsrc="\/assets\/favicon-192\.png"/);
assert.match(brandImages[0][0], /\bwidth="192"/);
assert.match(brandImages[0][0], /\bheight="192"/);
assert.match(brandImages[0][0], /\balt=""/);
assert.equal((html.match(/\bfetchpriority="high"/g) || []).length, 1, 'Give only the hero logo high fetch priority');
assert.doesNotMatch(html, /\bsrc="\/assets\/connectcoin\.png"/, 'Keep the old 256px logo retained but unused');
const heroIdentity = html.match(/<a class="hero-identity"[^>]*>([\s\S]*?)<\/a>/)?.[1];
assert.ok(heroIdentity, 'Keep the original hero logo card');
const heroImages = [...heroIdentity.matchAll(/<img\b[^>]*>/g)];
assert.equal(heroImages.length, 1, 'Show the original square logo in the hero card');
assert.match(heroImages[0][0], /\bsrc="\/assets\/connectcoin-hero\.png"/);
assert.match(heroImages[0][0], /\bwidth="1024"/);
assert.match(heroImages[0][0], /\bheight="1024"/);
assert.match(heroImages[0][0], /\balt=""/);
assert.match(heroImages[0][0], /\bfetchpriority="high"/);
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

const countdownUrl = 'https://chainquiry.com/?cq_countdown_embed=28104';
const countdownSection = html.match(/<section class="countdown" id="countdown" aria-label="ConnectCoin countdown">([\s\S]*?)<\/section>/)?.[1];
assert.ok(countdownSection, 'The countdown needs a labelled section with a stable anchor');
assert.ok(html.indexOf('<section class="hero"') < html.indexOf('<section class="countdown"') && html.indexOf('<section class="countdown"') < html.indexOf('<section class="resources"'), 'Place the countdown between the hero and resources');
const countdownFrames = [...html.matchAll(/<iframe\b[^>]*>/gi)];
assert.equal(countdownFrames.length, 1, 'Allow only the requested Chainquiry countdown iframe');
assert.ok(countdownSection.includes(countdownFrames[0][0]), 'Keep the iframe inside the countdown section');
assert.equal((countdownSection.match(/<\/iframe\s*>/gi) || []).length, 1, 'Close the countdown iframe');
const countdownAttributes = new Map([
  ['src', countdownUrl],
  ['title', 'ConnectCoin countdown by Chainquiry'],
  ['loading', 'lazy'],
  ['width', '100%'],
  ['height', '250'],
  ['style', 'width:100%;max-width:760px;height:250px;border:0;border-radius:22px;overflow:hidden;background:transparent'],
  ['referrerpolicy', 'strict-origin-when-cross-origin'],
]);
const frameAttributes = [...countdownFrames[0][0].matchAll(/\s([a-z][a-z0-9-]*)="([^"]*)"/gi)];
assert.equal(frameAttributes.length, countdownAttributes.size, 'Keep exactly the requested iframe attributes');
assert.equal(new Set(frameAttributes.map(attribute => attribute[1])).size, frameAttributes.length, 'Do not repeat iframe attributes');
for (const [, name, value] of frameAttributes) assert.equal(value, countdownAttributes.get(name), `Unexpected countdown iframe attribute: ${name}`);
assert.match(countdownFrames[0][0].replace(/\s([a-z][a-z0-9-]*)="([^"]*)"/gi, ''), /^<iframe\s*>$/i, 'Do not add iframe attributes outside the approved configuration');
assert.equal(countdownSection.trim(), `${countdownFrames[0][0]}</iframe>`, 'Keep only the iframe in the countdown section, without a visible heading or fallback link');

const mediaSection = html.match(/<section class="media" id="media" aria-labelledby="media-title">([\s\S]*?)<\/section>/)?.[1];
assert.ok(mediaSection, 'Media links need a labelled section with a stable anchor');
assert.match(mediaSection, /<h2 id="media-title">ConnectCoin in Media\.<\/h2>/);
assert.match(html, /<nav\b[^>]*>[\s\S]*?<a href="#media">Media<\/a>[\s\S]*?<\/nav>/, 'Make the media section reachable from the main navigation');
const mediaLinks = [...mediaSection.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
const bifinanceAnnouncement = 'https://bifinance.zendesk.com/hc/en-001/articles/17753109448975-BiFinance-Will-List-CONN-Soon';
const expectedMediaLinks = new Map([
  [bifinanceAnnouncement, { publisher: 'BiFinance', sponsored: true }],
  ['https://chainquiry.com/insights/what-is-connectcoin/', { publisher: 'Chainquiry', sponsored: false }],
  ['https://medium.com/@chainquiry/what-if-an-https-connection-could-unlock-a-crypto-reward-1772ad96f068', { publisher: 'Medium', sponsored: false }],
  ['https://www.reddit.com/r/chainquiry/comments/1wimfpk/sponsored_what_if_an_https_connection_itself/', { publisher: 'Reddit', sponsored: true }],
  ['https://chainquiry.com/projects/connectcoin/', { publisher: 'Chainquiry', sponsored: true }],
]);
assert.equal(mediaLinks.length, expectedMediaLinks.size, 'Include only the verified published media destinations');
for (const [destination, { publisher, sponsored }] of expectedMediaLinks) {
  const matches = mediaLinks.filter(link => link[1].includes(`href="${destination}"`));
  assert.equal(matches.length, 1, `Media destination must appear once in its section: ${destination}`);
  assert.match(matches[0][1], /target="_blank"/);
  assert.match(matches[0][1], /rel="noopener noreferrer"/);
  assert.ok(matches[0][2].includes(publisher), `Identify the publisher: ${destination}`);
  assert.match(matches[0][2], /<h3>[^<]+<\/h3>/, 'Media links need meaningful headings');
  assert.match(matches[0][2], /new tab/, 'Announce new tabs for media links');
  if (sponsored) assert.match(matches[0][2], /<span class="media-badge">(?:Sponsored(?: listing)?|Paid listing)<\/span>/, 'Keep known paid placements visibly labelled');
  if (destination === bifinanceAnnouncement) {
    assert.match(matches[0][2], /<h3>BiFinance Will List CONN Soon<\/h3>/, 'Use the published announcement title');
    assert.match(matches[0][2], /<p>BiFinance announces an upcoming listing of ConnectCoin \(CONN\)\.<\/p>/, 'An upcoming listing announcement must not imply trading is already live');
  }
}

const socialSection = html.match(/<section class="socials" aria-labelledby="socials-title">([\s\S]*?)<\/section>/)?.[1];
assert.ok(socialSection, 'Social links need a labelled section');
assert.match(socialSection, /<h2 id="socials-title">/);
assert.ok(html.indexOf('<section class="socials"') < html.indexOf('<section class="media"'), 'Stay connected must appear before ConnectCoin in Media');
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
assert.doesNotMatch(socialSection, /<(?:iframe|embed|object|script)\b/i, 'Use direct social links without loading third-party social embeds');

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
      assert.ok(['.html', '.css', '.png', '.webp', '.pdf', '.txt', '.xml'].includes(extname(entry.name)), `Unexpected public file: ${entry.name}`);
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
console.log(`Public directory: ${(publicBytes / 1024).toFixed(1)} KiB. Static homepage without authored scripts or runtime dependencies; one external Chainquiry countdown iframe.`);
