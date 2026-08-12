# KonaView

A modern, focused browsing experience for high-resolution anime wallpapers from Konachan.

## What it includes

- Responsive masonry browsing
- Latest, popular, and random feeds
- Tag search and aspect-ratio filters
- Keyboard-friendly immersive viewer
- Device-local favorites
- Automatic device-local seen history
- A constrained Cloudflare Worker API proxy
- Automatic GitHub Pages deployment

## Local development

```bash
npm install
npm run dev
```

The production frontend is deployed to GitHub Pages. The Worker source lives in `worker/worker.js` and only exposes normalized, Safe-rated public post metadata.
