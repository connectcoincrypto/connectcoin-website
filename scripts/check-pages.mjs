import assert from 'node:assert/strict';
import { readFile, readdir, lstat, open } from 'node:fs/promises';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Dependency-free checks for the site's explicitly authored static HTML subset.
// --live reads public GitHub release metadata only; it never requests binaries.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = resolve(root, 'dist');
const origin = 'https://connectcoincrypto.com';
const routes = ['/', '/trading.html', '/node.html', '/wallet.html', '/claimer.html'];
const tabLabels = ['Overview', 'Trading', 'Node', 'Wallet', 'Claimer'];
const expectedProducts = new Map([
  ['/node.html', ['connectcoincrypto/connectcoin', 'pinned']],
  ['/wallet.html', ['connectcoincrypto/connectcoin-connect-wallet', 'latest-stable-at-check']],
  ['/wallet.html#mobile', ['connectcoincrypto/connectcoin-connect-wallet', 'pinned']],
  ['/claimer.html', ['connectcoincrypto/connectcoin-claimer', 'latest-stable-at-check']],
]);
const isMobile = product => product.version?.startsWith('mobile-');
const productKey = product => `${product.page}${isMobile(product) ? '#mobile' : ''}`;
const displayVersion = product => product.version.replace(/^mobile-/, '');
const mobilePackage = {
  version: 'mobile-v1.0.1',
  filename: 'ConnectWallet-Mobile-v1.0.1-Android.apk',
  bytes: 11953395,
};
const args = new Set(process.argv.slice(2));
assert.ok([...args].every(arg => ['--live', '--help'].includes(arg)), 'Usage: node scripts/check-pages.mjs [--live]');
if (args.has('--help')) {
  console.log('Usage: node scripts/check-pages.mjs [--live]\nOffline by default. --live also compares public GitHub release metadata, without downloading packages.');
  process.exit(0);
}

const decode = value => value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, key) => {
  if (key.startsWith('#')) return String.fromCodePoint(Number.parseInt(key.slice(/^#x/i.test(key) ? 2 : 1), /^#x/i.test(key) ? 16 : 10));
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[key.toLowerCase()] ?? entity;
});
const normalize = value => value.replace(/\s+/g, ' ').trim();
const text = node => normalize(node.children.map(child => typeof child === 'string' ? child : text(child)).join(' '));
const hasClass = (node, name) => (node.attrs.class ?? '').split(/\s+/).includes(name);
const descendants = node => node.children.filter(child => typeof child !== 'string').flatMap(child => [child, ...descendants(child)]);
const one = (nodes, message) => { assert.equal(nodes.length, 1, message); return nodes[0]; };
const isPackage = name => /\.(?:exe|msi|dmg|deb|rpm|appimage|apk|ipa|zip|tar\.gz)$/i.test(name);
const isApplication = name => isPackage(name) && !/(?:^|[-_.])(?:sources?|debug|symbols|reports?)(?:[-_.]|$)/i.test(name);

function parse(html, route) {
  assert.match(html, /^\s*<!doctype html>/i, `${route}: HTML5 doctype`);
  const document = { tag: '#document', attrs: {}, children: [] };
  const stack = [document];
  const nodes = [];
  const voids = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
  const tokens = /<!--[\s\S]*?-->|<![^>]*>|<\/?([a-z][\w:-]*)\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>|([^<]+)/gi;
  let end = 0;
  for (const match of html.matchAll(tokens)) {
    assert.equal(match.index, end, `${route}: malformed markup near character ${end}`);
    end = match.index + match[0].length;
    if (match[0].startsWith('<!')) continue;
    if (match[3] !== undefined) { stack.at(-1).children.push(decode(match[3])); continue; }
    const tag = match[1].toLowerCase();
    if (match[0].startsWith('</')) {
      assert.equal(stack.at(-1).tag, tag, `${route}: unmatched closing </${tag}>`);
      stack.pop();
      continue;
    }
    const attrs = {};
    const attributeText = match[2].replace(/\/\s*$/, '');
    const attributes = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let attributeEnd = 0;
    for (const attr of attributeText.matchAll(attributes)) {
      assert.equal(attributeText.slice(attributeEnd, attr.index).trim(), '', `${route}: malformed <${tag}> attributes`);
      attributeEnd = attr.index + attr[0].length;
      const name = attr[1].toLowerCase();
      assert.ok(!Object.hasOwn(attrs, name), `${route}: duplicate ${name} attribute`);
      attrs[name] = decode(attr[2] ?? attr[3] ?? attr[4] ?? '');
    }
    assert.equal(attributeText.slice(attributeEnd).trim(), '', `${route}: malformed <${tag}> attributes`);
    const node = { tag, attrs, children: [], parent: stack.at(-1) };
    node.parent.children.push(node);
    nodes.push(node);
    if (!voids.has(tag) && !/\/\s*>$/.test(match[0])) stack.push(node);
  }
  assert.equal(end, html.length, `${route}: unparsed markup`);
  assert.equal(stack.length, 1, `${route}: unclosed <${stack.at(-1).tag}>`);
  return { html, document, nodes, ids: new Map(nodes.filter(node => Object.hasOwn(node.attrs, 'id')).map(node => [node.attrs.id, node])) };
}

function publicPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  assert.ok(!decoded.includes('\\') && !decoded.includes('\0'), `Invalid local path: ${pathname}`);
  const path = resolve(publicRoot, `.${decoded === '/' ? '/index.html' : decoded}`);
  assert.ok(path.startsWith(publicRoot + sep), `Local path outside dist: ${pathname}`);
  return path;
}

const pages = new Map(await Promise.all(routes.map(async route => [route, parse(await readFile(publicPath(route), 'utf8'), route)])));
const manifest = JSON.parse(await readFile(resolve(root, 'scripts/releases.json'), 'utf8'));
assert.match(manifest.checked_on, /^\d{4}-\d{2}-\d{2}$/, 'Manifest requires an ISO check date');
assert.equal(new Date(manifest.checked_on).toISOString().slice(0, 10), manifest.checked_on, 'Manifest check date must be valid');
assert.equal(manifest.products.length, expectedProducts.size, 'Manifest must cover Core, desktop Wallet, Mobile Wallet and Claimer');
assert.deepEqual(new Set(manifest.products.map(productKey)), new Set(expectedProducts.keys()), 'Manifest products must distinguish desktop and mobile on the Wallet page');
const allAssets = manifest.products.flatMap(product => product.assets);
assert.equal(new Set(allAssets.map(asset => asset.url)).size, allAssets.length, 'Manifest download URLs must be unique');
assert.equal(new Set(allAssets.map(asset => asset.filename)).size, allAssets.length, 'Manifest filenames must be unique');

for (const product of manifest.products) {
  assert.deepEqual([product.repo, product.selection], expectedProducts.get(productKey(product)), `${productKey(product)}: repository and release policy`);
  assert.match(product.version, isMobile(product) ? /^mobile-v\d+\.\d+\.\d+$/ : /^v\d+\.\d+\.\d+$/, `${productKey(product)}: stable version tag`);
  if (product.page === '/node.html') assert.equal(product.version, 'v1.0.3', 'Core is intentionally pinned to v1.0.3');
  if (isMobile(product)) {
    assert.equal(product.version, mobilePackage.version, 'Mobile Wallet is intentionally pinned to mobile-v1.0.1');
    assert.equal(product.assets.length, 1, 'The mobile release contains one Android APK');
    assert.equal(product.assets[0].filename, mobilePackage.filename, 'Use the exact production Android APK');
    assert.equal(product.assets[0].bytes, mobilePackage.bytes, 'Preserve the verified mobile APK byte size');
    assert.equal(product.assets[0].format, 'APK · arm64 / x86_64', 'Identify both supported Android architectures');
  }
  assert.ok(product.assets.length > 0, `${product.page}: require application packages`);
  for (const asset of product.assets) {
    assert.ok(isApplication(asset.filename), `${product.page}: application package only: ${asset.filename}`);
    assert.ok(!/[\\/]/.test(asset.filename), 'Manifest filename must be a basename');
    assert.equal(asset.url, `https://github.com/${product.repo}/releases/download/${product.version}/${asset.filename}`, `${asset.filename}: exact versioned GitHub URL`);
    assert.ok(Number.isSafeInteger(asset.bytes) && asset.bytes > 0, `${asset.filename}: valid byte size`);
    assert.ok((isMobile(product) ? ['Android'] : ['Windows', 'macOS', 'Linux']).includes(asset.platform), `${asset.filename}: platform matches its desktop or mobile release`);
    assert.equal(/\.apk$/i.test(asset.filename), Boolean(isMobile(product)), `${asset.filename}: Android packages belong only to the mobile release`);
    assert.ok(asset.label?.trim() && asset.format?.trim(), `${asset.filename}: label and package format`);
  }
}

const titles = new Set();
let navigationSignature;
for (const [route, page] of pages) {
  const { nodes, ids } = page;
  const select = tag => nodes.filter(node => node.tag === tag);
  const html = one(select('html'), `${route}: one HTML document`);
  assert.equal(html.attrs.lang, 'en', `${route}: document language`);
  one(select('head'), `${route}: one head`);
  one(select('body'), `${route}: one body`);
  one(select('header'), `${route}: one header`);
  one(select('footer'), `${route}: one footer`);
  const main = one(select('main'), `${route}: one main landmark`);
  const heading = one(select('h1'), `${route}: one H1`);
  assert.ok(descendants(main).includes(heading) && text(heading), `${route}: nonempty H1 inside main`);
  assert.equal(ids.size, nodes.filter(node => Object.hasOwn(node.attrs, 'id')).length, `${route}: unique IDs`);
  assert.ok([...ids.keys()].every(id => id && !/\s/.test(id)), `${route}: valid IDs`);
  const title = text(one(select('title'), `${route}: one title`));
  assert.ok(title && !titles.has(title), `${route}: distinct nonempty title`);
  titles.add(title);
  const metadata = (attr, value) => one(select('meta').filter(node => node.attrs[attr] === value), `${route}: ${value} metadata`).attrs.content;
  assert.equal(one(select('meta').filter(node => Object.hasOwn(node.attrs, 'charset')), `${route}: charset`).attrs.charset.toLowerCase(), 'utf-8');
  assert.match(metadata('name', 'viewport'), /width=device-width/);
  assert.ok(metadata('name', 'description')?.trim(), `${route}: description`);
  assert.ok(metadata('property', 'og:description')?.trim(), `${route}: social description`);
  assert.equal(metadata('property', 'og:title'), title, `${route}: social title matches title`);
  assert.equal(metadata('property', 'og:type'), 'website');
  assert.equal(metadata('property', 'og:url'), `${origin}${route}`, `${route}: social URL`);
  assert.equal(one(select('link').filter(node => node.attrs.rel === 'canonical'), `${route}: canonical link`).attrs.href, `${origin}${route}`);
  assert.ok(select('link').some(node => node.attrs.rel === 'stylesheet' && node.attrs.href === '/assets/site.css'), `${route}: shared stylesheet`);
  assert.ok(select('a').some(node => hasClass(node, 'skip-link') && node.attrs.href === `#${main.attrs.id}`), `${route}: skip link reaches main`);

  const tabs = one(select('nav').filter(node => hasClass(node, 'site-tabs')), `${route}: one tab navigation`);
  assert.ok(tabs.attrs['aria-label'], `${route}: labelled tab navigation`);
  const tabLinks = descendants(tabs).filter(node => node.tag === 'a');
  assert.deepEqual(tabLinks.map(node => node.attrs.href), routes, `${route}: all five real tabs, in consistent order`);
  assert.deepEqual(tabLinks.map(text), tabLabels, `${route}: consistent tab labels`);
  const current = one(nodes.filter(node => Object.hasOwn(node.attrs, 'aria-current')), `${route}: exactly one current page`);
  assert.ok(tabLinks.includes(current), `${route}: current page belongs to tab navigation`);
  assert.equal(current.attrs['aria-current'], 'page');
  assert.equal(current.attrs.href, route, `${route}: correct current tab`);
  const navigation = one(select('nav').filter(node => hasClass(node, 'navigation')), `${route}: main navigation`);
  const signature = descendants(navigation).filter(node => node.tag === 'a').map(node => [new URL(node.attrs.href, `${origin}${route}`).href, text(node)]);
  if (navigationSignature) assert.deepEqual(signature, navigationSignature, `${route}: consistent header navigation`);
  else navigationSignature = signature;
  assert.ok(signature.some(([href]) => href === `${origin}/#media`), `${route}: media link reaches the home section`);

  for (const node of nodes) {
    assert.ok(!['script', 'iframe', 'embed', 'object', 'base'].includes(node.tag), `${route}: no scripts, embeds, or base overrides`);
    assert.ok(!Object.keys(node.attrs).some(name => /^on/i.test(name) || name === 'srcdoc'), `${route}: no executable event attributes`);
    for (const name of ['aria-labelledby', 'aria-describedby']) {
      if (node.attrs[name]) for (const id of node.attrs[name].split(/\s+/)) assert.ok(ids.has(id), `${route}: ${name} references missing ID ${id}`);
    }
    if (node.tag === 'img') {
      assert.ok(Object.hasOwn(node.attrs, 'alt'), `${route}: image alternative text`);
      for (const dimension of ['width', 'height']) assert.match(node.attrs[dimension] ?? '', /^[1-9]\d*$/, `${route}: image ${dimension}`);
    }
    if (node.tag === 'nav') assert.ok(node.attrs['aria-label'] || node.attrs['aria-labelledby'], `${route}: labelled navigation`);
    if (node.tag === 'a') {
      assert.ok(node.attrs.href && (text(node) || node.attrs['aria-label']), `${route}: named link with a destination`);
      assert.ok(!descendants(node).some(child => ['a', 'button', 'input', 'select', 'textarea'].includes(child.tag)), `${route}: no nested interactive elements in links`);
      if (node.attrs.target === '_blank') {
        const rel = new Set((node.attrs.rel ?? '').split(/\s+/));
        assert.ok(rel.has('noopener') && rel.has('noreferrer'), `${route}: safe new-tab rel for ${node.attrs.href}`);
      }
    }
    for (const attribute of ['href', 'src', 'poster', 'xlink:href']) {
      if (!Object.hasOwn(node.attrs, attribute)) continue;
      const ref = node.attrs[attribute];
      assert.ok(ref && !ref.startsWith('//'), `${route}: explicit nonempty reference`);
      const url = new URL(ref, `${origin}${route}`);
      assert.equal(url.protocol, 'https:', `${route}: HTTPS or local reference required: ${ref}`);
      if (url.origin !== origin) continue;
      const targetRoute = url.pathname === '/index.html' ? '/' : url.pathname;
      assert.ok((await lstat(publicPath(url.pathname))).isFile(), `${route}: missing local file ${ref}`);
      if (url.hash) {
        const target = pages.get(targetRoute);
        assert.ok(target, `${route}: anchor target must be a checked page: ${ref}`);
        assert.ok(target.ids.has(decodeURIComponent(url.hash.slice(1))), `${route}: missing anchor/SVG symbol ${ref}`);
      }
    }
  }

  const products = manifest.products.filter(item => item.page === route);
  const downloads = nodes.filter(node => Object.hasOwn(node.attrs, 'data-download'));
  const assets = products.flatMap(product => product.assets);
  const releases = nodes.filter(node => Object.hasOwn(node.attrs, 'data-release'));
  assert.equal(downloads.length, assets.length, `${route}: exact manifest download count`);
  assert.equal(new Set(downloads.map(node => node.attrs['data-download'])).size, downloads.length, `${route}: no duplicate download buttons`);
  assert.equal(releases.length, products.length, `${route}: one separate section for each declared release`);
  assert.equal(new Set(releases.map(node => node.attrs['data-release'])).size, releases.length, `${route}: unique release sections`);
  for (const asset of assets) {
    const product = products.find(item => item.assets.includes(asset));
    const release = one(releases.filter(node => node.attrs['data-release'] === product.version), `${route}: ${product.version} release section`);
    const link = one(downloads.filter(node => node.attrs['data-download'] === asset.filename), `${route}: ${asset.filename} appears once`);
    assert.ok(descendants(release).includes(link), `${asset.filename}: download belongs to its own release section`);
    assert.equal(link.tag, 'a', `${asset.filename}: download is a link`);
    assert.equal(link.attrs.href, asset.url, `${asset.filename}: exact download destination`);
    assert.ok(text(link).includes(asset.label) && text(link).includes(asset.format), `${asset.filename}: visible label and format`);
    assert.ok(text(link).includes(`${(asset.bytes / 1e6).toFixed(1)} MB`), `${asset.filename}: displayed decimal MB agrees with bytes`);
    assert.ok(link.attrs['aria-label']?.includes(displayVersion(product)), `${asset.filename}: accessible version`);
    let card = link.parent;
    while (card && !hasClass(card, 'download-card')) card = card.parent;
    assert.ok(card, `${asset.filename}: platform download card`);
    assert.equal(text(one(descendants(card).filter(node => node.tag === 'h2'), `${asset.filename}: platform heading`)), asset.platform, `${asset.filename}: correct platform grouping`);
  }
  for (const link of select('a')) {
    const url = new URL(link.attrs.href, `${origin}${route}`);
    if (isPackage(url.pathname)) assert.ok(downloads.includes(link), `${route}: package link missing from manifest: ${link.attrs.href}`);
  }
  for (const product of products) {
    const release = one(releases.filter(node => node.attrs['data-release'] === product.version), `${route}: ${product.version} release section`);
    assert.ok(text(release).includes(displayVersion(product)), `${route}: visible release version`);
    assert.ok(descendants(release).some(node => node.tag === 'a' && node.attrs.href === `https://github.com/${product.repo}/releases/tag/${product.version}`), `${route}: release notes inside the matching release section`);
  }
}

// Files are checked recursively so a binary cannot be hosted just by omitting its link.
let fileCount = 0;
async function checkPublicFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    assert.ok(!entry.isSymbolicLink(), `No public symlinks: ${relative(publicRoot, path)}`);
    if (entry.isDirectory()) { await checkPublicFiles(path); continue; }
    assert.ok(entry.isFile(), `Unexpected public file type: ${path}`);
    fileCount++;
    assert.ok(!isPackage(entry.name) && !/\.(?:dll|so|dylib|com|bat|cmd|ps1|sh)$/i.test(entry.name), `Do not host executable packages: ${relative(publicRoot, path)}`);
    if (/\.html$/i.test(entry.name)) assert.ok(routes.some(route => publicPath(route) === path), `Unverified HTML page: ${path}`);
    const handle = await open(path, 'r');
    try {
      const magic = Buffer.alloc(4);
      const { bytesRead } = await handle.read(magic, 0, 4, 0);
      const signature = magic.subarray(0, bytesRead).toString('hex');
      assert.ok(!signature.startsWith('4d5a') && !['7f454c46', 'feedface', 'feedfacf', 'cefaedfe', 'cffaedfe', 'cafebabe', 'bebafeca'].includes(signature), `Do not host native executables: ${relative(publicRoot, path)}`);
    } finally { await handle.close(); }
  }
}
await checkPublicFiles(publicRoot);
console.log(`PASS offline: ${pages.size} pages, ${allAssets.length} exact downloads, ${fileCount} public files; navigation, anchors, metadata, semantics and static-only checks.`);

if (args.has('--live')) {
  const results = await Promise.allSettled(manifest.products.map(async product => {
    const endpoint = product.selection === 'pinned' ? `tags/${encodeURIComponent(product.version)}` : 'latest';
    const api = `https://api.github.com/repos/${product.repo}/releases/${endpoint}`;
    const response = await fetch(api, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ConnectCoin-website-release-check', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
    assert.ok(response.ok, `${product.name}: GitHub API ${response.status}; retry later if rate-limited`);
    const release = await response.json();
    assert.equal(release.tag_name, product.version, `${product.name}: release snapshot is stale; review the manifest and page together`);
    assert.equal(release.draft, false, `${product.name}: published release required`);
    assert.equal(release.prerelease, false, `${product.name}: stable release required`);
    assert.equal(release.html_url, `https://github.com/${product.repo}/releases/tag/${product.version}`);
    const packages = release.assets.filter(asset => isApplication(asset.name));
    assert.deepEqual(packages.map(asset => asset.name).sort(), product.assets.map(asset => asset.filename).sort(), `${product.name}: manifest must include exactly the published application packages`);
    for (const asset of product.assets) {
      const live = one(packages.filter(item => item.name === asset.filename), `${asset.filename}: unique published asset`);
      assert.equal(live.browser_download_url, asset.url, `${asset.filename}: published download URL`);
      assert.equal(live.size, asset.bytes, `${asset.filename}: published size`);
      assert.equal(live.state, 'uploaded', `${asset.filename}: complete upload`);
    }
    return `${product.name} ${product.version}: ${packages.length} packages`;
  }));
  for (const result of results) {
    if (result.status === 'fulfilled') console.log(`PASS live: ${result.value}`);
    else { console.error(`FAIL live: ${result.reason.message}`); process.exitCode = 1; }
  }
}
