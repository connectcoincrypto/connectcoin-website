# ConnectCoin website

A small, static homepage for **connectcoincrypto.com**. It points visitors to
ConnectCoin Core, the whitepaper, the blockchain explorer, and the community.
It also features the video explainer and links to ConnectCoin's social accounts.
The **ConnectCoin in Media** section collects published articles, external
project profiles, and posts about the project.
The countdown section loads the ConnectCoin widget hosted by Chainquiry.

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
| `dist/assets/connectcoin.png` | Original 256px ConnectCoin logo, retained but no longer displayed |
| `dist/assets/connectcoin-hero.png` | Original 1024px ConnectCoin logo, displayed in the hero card |
| `dist/assets/connectcoin-banner.webp` | Former 2172 × 724 ConnectCoin banner, retained but no longer displayed |
| `dist/assets/favicon-32.png` | Supplied logo resized to a 32 × 32 PNG favicon |
| `dist/assets/favicon-192.png` | Supplied logo resized to 192 × 192, used for the favicon and header logo |
| [dist/whitepaper.pdf](dist/whitepaper.pdf) | Compiled whitepaper, served at `/whitepaper.pdf` |
| [whitepaper/connectcoin-whitepaper.tex](whitepaper/connectcoin-whitepaper.tex) | Standalone LaTeX source for the whitepaper |
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
- **Chainquiry project profile:** https://chainquiry.com/projects/connectcoin/
- **Chainquiry countdown:** https://chainquiry.com/?cq_countdown_embed=28104
- **Chainquiry article:** https://chainquiry.com/what-is-connectcoin-pay-to-connect-randomx/
- **Medium article by Chainquiry:** https://medium.com/@chainquiry/what-if-an-https-connection-could-unlock-a-crypto-reward-1772ad96f068
- **Reddit post:** https://www.reddit.com/r/chainquiry/comments/1wimfpk/sponsored_what_if_an_https_connection_itself/
- **YouTube explainer:** https://youtu.be/zreQOn88MAg
- **Instagram:** https://www.instagram.com/connectcoincrypto/
- **TikTok:** https://www.tiktok.com/@connectcoin
- **X:** https://x.com/connectcoincc
- **Telegram:** https://t.me/connectcoincrypto

The YouTube card opens the explainer video directly, not a channel page. Social
links are plain links and do not load social players or embeds. Discord remains
the main community link.

The `#countdown` section between the hero and resources contains only one
lazy-loaded Chainquiry iframe, sized to 100% width (up to 760px) and 250px height.
The section has an accessible label, with no visible heading or fallback link.
The widget requests content from Chainquiry and may execute JavaScript and use
cookies under that third party's control. Chainquiry controls the displayed
countdown; the homepage does not define a countdown date or claim that it marks
a mainnet launch.

The Media navigation link points to `/#media`. Add only published, verified
destinations to that section, with a short description and the publisher's name.
Keep sponsored posts and paid listings labelled; an external link is not a claim
of independent endorsement. The Chainquiry profile appears here once, alongside
the Chainquiry and Medium articles and the Reddit post.

The wallet link intentionally opens the source installation instructions. Do
not label it a direct binary download unless a verified release is provided.
The status and notice describe the experimental testnet, not a mainnet launch.

The authored homepage remains static and dependency-free, with no scripts,
first-party analytics or cookies, remote font request, wallet connection, or
live network-status polling. Its links work without scripts. The external
countdown iframe has its own behavior as described above.
External links open in a new tab with accessible descriptions and safe
`rel` attributes; the PDF opens in the current tab.

## Update the whitepaper

The September 2026 paper by Papaulo is available as a
[compiled PDF](dist/whitepaper.pdf) and
[standalone LaTeX source](whitepaper/connectcoin-whitepaper.tex). This revision
updates the monetary ticker to `CONN`, preserving Papaulo's authorship and the
existing technical content. The source requires no external images or
bibliography file.

Edit the LaTeX source, then compile it with Tectonic from the repository root.
On Linux or macOS, use a temporary output directory so build files stay outside
the published site:

```sh
paper_build_dir="$(mktemp -d)"
tectonic --keep-logs --outdir "$paper_build_dir" whitepaper/connectcoin-whitepaper.tex &&
  cp "$paper_build_dir/connectcoin-whitepaper.pdf" dist/whitepaper.pdf
```

On Windows, create a temporary directory and pass its path to `--outdir`, then
use `Copy-Item` to copy the successfully compiled `connectcoin-whitepaper.pdf`
to `dist/whitepaper.pdf`. Tectonic is a separate LaTeX tool; no npm dependencies
are needed for compilation.

Review the compilation log and the resulting PDF, then run `npm run check`.
Keep the public filename `dist/whitepaper.pdf` so `/whitepaper.pdf` continues
to work. The website serves the checked-in PDF and does not fetch or regenerate
it automatically. Publication remains the manual process described below.

The original logo PNGs are existing ConnectCoin repository assets and remain
unchanged. The 256px logo is retained but no longer displayed. The hero card
uses the original 1024px square logo with its baked checkerboard border cropped
by the stylesheet. The header keeps its original small-logo-and-name layout,
using the supplied 192px logo beside the ConnectCoin text before the navigation.
The header brand links to the homepage. The same 192px image also serves as a
favicon. The former WebP banner remains tracked but is no longer displayed.

## Validate

```sh
npm run check
```

The same offline check runs in GitHub Actions. It checks local references,
favicon PNG signatures and dimensions, the header brand's layout and image
attributes, expected destination URLs, and the sole permitted iframe's
attributes and labelled container. It does not verify external service uptime
or the widget's displayed countdown. Also review the
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
