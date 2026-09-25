# rumi-pulp blog

A single-page **bento-grid blog** for Aiman ("rumi-pulp"), a creative writer based in
Kuala Lumpur. Hand-coded HTML + Tailwind (CDN) with vanilla JavaScript — no build step.

## Features

- Responsive bento grid across desktop, laptop, tablet and mobile
- Dominant hero tile — portrait and the writing (with blinking caret) lead the page
- Light / dark theme toggle (dark by default), in the "Now" tile
- About pop-out modal — story, what I do, experience, skills (scrim, close button, Escape)
- Curved SVG scrollbar in the About modal (follows the panel's radius, no dependency)
- Playful "404, page not found." popover for the unlinked X / Instagram / LinkedIn icons
- Live Kuala Lumpur weather from Open-Meteo, with loading / ready / error states
- Live domino clock — each digit rendered as domino pips, updating every second
- "Now playing" — the real Spotify embed in a flat player frame
- Infinite logo marquee for the tool stack (respects reduced-motion)
- Hardware tile: PC, iPhone 16 Pro, Apple Watch 11, AirPods Pro 2, Fujifilm X-M5
- Honest "Selected work" empty state — no fabricated pieces
- Copy-email control with true success / failure feedback

## Tech stack

- HTML5
- [Tailwind CSS](https://tailwindcss.com/) via CDN
- Vanilla JavaScript (inline)
- No dependencies or build tooling

## Getting started

Just open `index.html` in a browser, or serve the folder locally:

```bash
python -m http.server 8000
```

Then visit http://localhost:8000.

## Project structure

```
.
├── index.html          # the whole site (markup, Tailwind config, CSS, JS)
├── assets/             # local logos, icons, and the portrait
│   ├── adobelightroom.svg
│   ├── canva.svg
│   ├── capcut-icon.svg
│   ├── github.svg
│   ├── microsoftword.svg
│   ├── openai.svg
│   ├── procreate.png
│   └── rumi.webp
├── .gitignore
└── README.md
```

## Notes & credits

- Product and brand icons are trademarks of their respective owners, used here for a personal
  blog.
- `procreate.png` and `capcut-icon.svg` sourced from Wikimedia Commons.
- Live weather data from [Open-Meteo](https://open-meteo.com/).
- Some decorative imagery is hotlinked from Framer's CDN.

## License

Personal project. Some content is still placeholder — notably the email (`hello@example.com`)
and the X / Instagram / LinkedIn profiles, which currently just show a 404 popover — and must be
replaced by the owner before launch.
