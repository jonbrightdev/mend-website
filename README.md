# Mend website

Static marketing site for **Mend** — a free, open-source Chrome extension that audits the page you're viewing against WCAG and shows what's wrong, where it lives, and how to fix it.

No build step, no dependencies. Plain HTML and CSS, designed to pass its own accessibility audit (WCAG 2.1 AA).

## Pages

| File | Purpose |
|------|---------|
| `index.html` | Home — hero, differentiators, how it works |
| `privacy.html` | Privacy policy |
| `support.html` | Support FAQ and GitHub Issues link |
| `index-print.html` | Print-optimized version of the home page (A4) |
| `styles.css` | Shared stylesheet ("Paper & Rust" design system) |

## Local preview

Open any HTML file directly in a browser, or serve the folder with a static server:

```bash
# Python
python3 -m http.server 8080

# Node (npx, no install required)
npx serve .
```

Then visit `http://localhost:8080`.

## Placeholders

Before publishing, replace these tokens across the HTML files:

| Token | Used for |
|-------|----------|
| `GITHUB_URL` | Link to the extension source repo |
| `GITHUB_ISSUES_URL` | Link to GitHub Issues (support page) |
| `CHROME_STORE_URL` | Chrome Web Store listing |
| `CONTACT_EMAIL` | Support / privacy contact email |
| `[DATE]` | Privacy policy effective date (`privacy.html`) |

Search the repo for each token to find every occurrence:

```bash
rg 'GITHUB_URL|CHROME_STORE_URL|GITHUB_ISSUES_URL|CONTACT_EMAIL|\[DATE\]'
```

## Deployment

Deploy the directory as static files. Any host works — GitHub Pages, Netlify, Cloudflare Pages, S3, etc.

**GitHub Pages example:** push to a `gh-pages` branch or enable Pages from `main` with the site root set to `/`.

Ensure `index.html` is served at the site root and that relative links (`styles.css`, `privacy.html`, etc.) resolve correctly.

## Design

- **Aesthetic:** warm parchment surfaces, rust accent (`#c4502c`), serif display type
- **Accessibility:** skip link, semantic landmarks, visible focus, sufficient contrast, `aria` labels on interactive SVGs
- **Print:** `index-print.html` includes `@media print` rules for a clean A4 export

## License

Content and code in this repository are released under the [MIT License](https://opensource.org/licenses/MIT), consistent with the Mend extension.
