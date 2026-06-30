# newt — brand assets (Curl mark, concept 1a)

The "newt" mascot for a new-tab page. The body curls into a ring with the tail
tucked to centre — a solid, identifiable silhouette down to 16px.

## What's here
- favicon.svg ............... modern scalable favicon (Aqua) — use this first
- svg/newt-mark-aqua.svg ... bare mark, transparent (primary brand colour)
- svg/newt-mark-ember.svg .. bare mark, Ember colourway (pops in busy tab bars)
- svg/newt-mark-mono.svg ... white mark for one-colour / dark surfaces
- svg/newt-icon-tile.svg ... mark on the dark gradient app tile (rounded)
- svg/newt-mark-aqua-1024.png  large transparent PNG for decks / marketing
- favicon/favicon-16|32|48|64.png ... raster favicons (Aqua, transparent)
- favicon/favicon-ember-32.png, favicon-mono-32.png ... alternates
- app-icons/apple-touch-icon-180.png ... iOS home-screen
- app-icons/icon-192.png, icon-512.png ... PWA / Android (rounded tile)
- app-icons/icon-512-maskable.png ... full-bleed for Android adaptive masks

## HTML
```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/app-icons/apple-touch-icon-180.png">
```

## manifest.webmanifest
```json
{
  "icons": [
    { "src": "/app-icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/app-icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/app-icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

## Colours
- Aqua gradient: #9B8CFF -> #5BC8E6 -> #36D6A6
- Ember gradient: #FFC24B -> #FF7A3C -> #FF4D7E
- Mono: #ECEEF6
- App-tile bg: #1C2030 -> #12141C

Need a true multi-resolution favicon.ico? Run any of the favicon PNGs through
an .ico packer (e.g. a 16+32+48 bundle).
