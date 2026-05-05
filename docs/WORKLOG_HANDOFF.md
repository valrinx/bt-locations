# BT Locations Worklog Handoff

Updated: 2026-05-06 02:45 Asia/Bangkok

## Current Focus

Mobile-first stability, smoother map interaction, and Google Maps-style GPS tracking.

Latest known commit before this handoff:

- `b1cbe87 Expose GPS mode diagnostics`

## What Is Done

- Reduced mobile map flicker by batching map-only updates and avoiding full UI rebuilds during pan/zoom.
- Prevented mobile tile blanking during zoom with mobile-specific Leaflet tile behavior.
- Added Map Debug access in the mobile menu and kept the debug overlay above Leaflet panes.
- Lazy-loaded `locations.js` only when local stored data is missing.
- Added import validation and safer data refresh paths.
- Fixed stale search pin cleanup when the searched/deleted point changes.
- Added detailed changelog/audit cards and copy/action button feedback.
- Added animated statistics counters and chart entrance motion.
- Added Google-style GPS puck with clearer user location visuals.
- Removed the large GPS accuracy circle because it made the location harder to read.
- Added smoothed GPS position updates, heading smoothing, and compass/device-orientation fallback.
- Added GPS follow mode cycling: `follow -> compass -> free -> follow`.
- Added GPS diagnostics at `window.btDebug.gps`.
- Added GPS track recording controls and export flow.

## Mobile QA Checklist

Use this when testing on a real phone or mobile viewport:

1. Hard refresh the app after deploy. If old behavior remains, clear the service worker/browser cache.
2. Open `http://127.0.0.1:4173/index.html` locally or the deployed URL.
3. Open Menu, enable Map Debug, then zoom and pan repeatedly.
4. Confirm the map does not flash to gray or shrink to a small tile island while zooming.
5. Tap the GPS button once. It should enter follow mode and move smoothly.
6. Tap GPS again. It should cycle mode rather than feeling unresponsive.
7. Drag the map while GPS is active. The GPS button should switch to free mode.
8. Check `window.btDebug.gps` in the console for mode, heading, accuracy, and marker state.
9. Delete a location that was searched/selected and confirm the search pin disappears immediately.
10. Open the Stat tab and confirm counters/charts animate once, then settle.

## Known Caveats

- Leaflet does not rotate the whole map heading-up like Google Maps by default; current work rotates/aims the GPS puck and supports compass mode.
- Compass heading depends on browser support and permission. iOS may require motion/orientation permission after user interaction.
- Route/navigation mode is separate from GPS tracking and can still be polished into a more Google Maps-like flow.
- `app.js` and `index.html` are still large and globally coupled, so refactors should remain small and shippable.

## Large File Strategy

Do not split everything at once. The safest order is:

1. Move pure helpers first: distance, formatting, location validation, district normalization.
2. Move marker rendering next, after mobile map behavior stays stable.
3. Move GPS tracking into a dedicated module after the mode cycling and debug fields are verified on device.
4. Move stat/changelog panel rendering after UI behavior is stable.
5. Move CSS out of `index.html` only after screenshots confirm no mobile regression.

Each split should be its own commit with a quick syntax check and mobile smoke test.

## Next Recommended Work

1. Add a tiny in-app GPS debug row showing mode, heading, and last update time for testers.
2. Add a clear GPS stop/disable control in the mobile menu.
3. Polish route/navigation so GPS tracking and route guidance feel like one workflow.
4. Start helper extraction from `app.js` with no behavior changes.
5. Add a small deploy checklist that reminds testers to clear old service worker cache.

## Useful Commands

```powershell
node --check app.js
git status --short
git log --oneline -8
```

Local server command that has worked in this workspace:

```powershell
Start-Process -FilePath python -ArgumentList '-m','http.server','4173','--bind','127.0.0.1' -WorkingDirectory 'C:\Users\T\Documents\GitHub\bt-locations\docs' -WindowStyle Hidden
```

