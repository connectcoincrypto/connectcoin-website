# ConnectCoin website

A small, static homepage for **connectcoincrypto.com**. It points visitors to
ConnectCoin Core, the whitepaper, the blockchain explorer, and the community.

Production is served as static files by Nginx on VPS 3. GitHub Actions validates
changes but does not deploy them; publication is a separate, manual step.

## Preview locally

Install Node.js 22 or newer, then run from this repository:

```sh
npm run dev
```

Open **http://127.0.0.1:4173/**. No `npm install` or build is required. The preview
server listens on loopback only; it is not a production web server.
Refresh the browser after changing the HTML or stylesheet.

If that port is occupied, set `PORT` before starting:

```sh
# Linux / macOS
PORT=4174 npm run dev
```

```powershell
# PowerShell
$env:PORT = '4174'
npm run dev
```

## Files

| File | Purpose |
| --- | --- |
| `dist/index.html` | Homepage copy, navigation, metadata, and inline icons |
| `dist/assets/site.css` | Responsive layout and visual theme |
| `dist/assets/connectcoin.png` | Original 256px ConnectCoin logo, used in the header |
| `dist/assets/connectcoin-hero.png` | Original 1024px ConnectCoin logo, used in the hero |
| `dist/whitepaper.pdf` | The actual whitepaper, served at `/whitepaper.pdf` |
| `dist/robots.txt`, `dist/sitemap.xml` | Crawler discovery metadata for the final domain |
| `scripts/serve.mjs` | Dependency-free local preview server |
| `scripts/check.mjs` | Static resource, link, and PDF integrity checks |
| `deploy/nginx.conf` | Production virtual hosts, redirects, and PDF handling |

`dist/` is the **authored, tracked website**, not a disposable build directory.
The `.openai/hosting.json` file only identifies this static directory; there is
no registered Site, deployment ID, or automatic publication configured.

## Content and links

- **Wallet:** https://github.com/connectcoincrypto/connectcoin#installation
- **Source:** https://github.com/connectcoincrypto/connectcoin
- **P2C specification:** https://github.com/connectcoincrypto/connectcoin/blob/main/doc/pay-to-connect.md
- **Community:** https://discord.gg/JYWbz5PsPp
- **Explorer:** https://explorer.connectcoincrypto.com/
- **Whitepaper:** `/whitepaper.pdf`

The wallet link intentionally opens the source installation instructions. Do
not label it a direct binary download unless a verified release is provided.
The status and notice describe the experimental testnet, not a mainnet launch.

There is no client-side JavaScript, analytics, cookies, remote font request,
wallet connection, or live network-status polling. Links work without scripts.
External resources open in a new tab with accessible descriptions and safe
`rel` attributes; the PDF opens in the current tab.

## Update the whitepaper

Replace `dist/whitepaper.pdf` with the approved PDF while keeping that filename.
The included copy is the September 2026 paper by Papaulo, matching the version
available at `https://connectcoincrypto.com/whitepaper.pdf` when this site was
prepared on September 14, 2026. The website does not fetch or regenerate it.

The two PNGs are existing ConnectCoin repository assets. They are kept unchanged;
the stylesheet crops their baked checkerboard border for presentation.

## Validate

```sh
npm run check
```

The same offline check runs in GitHub Actions. It checks local references and
expected destination URLs, not the uptime of external services. Also review the
page in desktop and mobile browsers and confirm `/whitepaper.pdf` opens.

## Production hosting

Serve the **contents of `dist/`** from the document root of the chosen static web
server. No Node.js process is required in production. Preserve `/whitepaper.pdf`
as a real PDF response (`Content-Type: application/pdf`), not a homepage rewrite.
Use HTTPS for `connectcoincrypto.com`.

`deploy/nginx.conf` is specific to the existing VPS and certificate paths. It
serves `/var/www/connectcoin-website/current`, a symlink to a release containing
only the contents of `dist/`. Do not expose the repository root, development
scripts, or `.git/` publicly. Nginx serves `/` as the homepage, preserves the PDF
response, and returns 404 for missing files instead of rewriting them to HTML.

HTTP requests, `connectcoin2.com`, and the VPS IP redirect to
`https://connectcoincrypto.com`, preserving the requested path and query. The
HTTP ACME challenge location and existing domain/IP certificates are preserved
for certificate renewal. No node or wallet process is needed to serve the site.

For each manual deployment:

1. Run `npm run check`, review the diff, and commit the approved version.
2. Fetch that exact commit on the VPS and copy only `dist/` into a new,
   root-owned `/var/www/connectcoin-website/releases/<commit>/` directory.
3. Back up the active virtual-host file and record the previous `current`
   symlink target outside the public directory. Keep the previous release.
4. Point `current` at the new release. Install the reviewed virtual-host file
   into the existing enabled site's configuration, without enabling a duplicate.
5. Run `sudo nginx -t` before `sudo systemctl reload nginx`. If validation or
   live checks fail, restore the saved configuration and previous target,
   validate again, and reload.
6. Verify HTTPS, the homepage, assets, aliases, missing-file responses, and the
   complete `/whitepaper.pdf` hash from outside the VPS.

The original PDF-only document root, `/var/www/connectcoin-whitepaper`, can stay
in place for rollback. Do not remove it or change certificate renewal as part
of a routine content update.
