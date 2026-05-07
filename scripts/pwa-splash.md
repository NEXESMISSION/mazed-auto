# Generating proper iOS PWA startup images

iOS standalone PWA uses `apple-touch-startup-image` as the launch screen
between user tap and our HTML's first paint. The manifest's
`background_color` is **only honored on Android** — iOS ignores it and
falls back to white if no startup image is provided.

`app/layout.tsx` currently sets a single fallback image
(`startupImage: ["/loading.png"]`) so the launch isn't pure white, but
it stretches on most devices because there's no media-query targeting.

## To generate proper per-device assets

1. Install the generator (one-shot, dev-only):
   ```bash
   pnpm dlx pwa-asset-generator public/loading.png public/splash \
     --background "#0a0a0a" \
     --splash-only \
     --portrait-only \
     --index src/app/layout.tsx
   ```

2. The generator emits ~12 PNGs into `public/splash/` and writes a list
   of `{ url, media }` link entries.

3. Replace the single string in `app/layout.tsx` with the array form:
   ```tsx
   appleWebApp: {
     // ...
     startupImage: [
       {
         url: "/splash/apple-splash-1290-2796.png",
         media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
       },
       // ...11 more from the generator output
     ],
   }
   ```

## Source asset requirements

`public/loading.png` is currently a 1440×3040 portrait phone canvas with
the logo centered. That's a good source — square logo on dark background,
no edge content. The generator will resize and pad to each target
resolution while preserving the centered logo.

## Verification

Install the PWA on iOS Safari ("Add to Home Screen"), close it, then
reopen from the home screen. There should be no white flash between tap
and the splash painting. If the launch image is stretched or letter-boxed
incorrectly, it means the matching media-query isn't firing — check the
device's reported pixel-ratio with `window.devicePixelRatio` in Safari
DevTools and verify the corresponding link is in the head.
