# BT Locations Worklog Handoff

Updated: 2026-05-07 00:00 Asia/Bangkok

## Current Focus

Mobile-first stability, smoother map interaction, and Google Maps-style GPS tracking.

Latest known commit before this handoff:

- `b1cbe87 Expose GPS mode diagnostics`
- `ed57786 Add project handoff worklog`

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
- Added a mobile drawer GPS status strip with mode, accuracy, heading, and last update age.
- Added an explicit mobile menu action to stop GPS and compass tracking.
- Bumped app/service-worker version to `v6.9.8` and registered the service worker with `updateViaCache: 'none'` to reduce stale mobile code after deploy.
- Bumped app/service-worker version to `v6.9.9`, added a mobile "reload app" action that clears app caches, and made the GPS status strip refresh its age/quality while GPS is active.
- Added GPS mode, quality, accuracy, heading, and fix age to the Map Debug overlay for real-device testing without opening the console.
- Expanded `window.btDebug.gps` and `window.btDebug.exportDebug()` so bug reports include GPS quality, fix age, map stats, and app version.
- Added Android performance mode in `v7.0.1`: lower Android marker limits, Android-specific tile update behavior, reduced marker labels, and lighter map CSS during gestures.
- Added Android "lite" mode in `v7.0.2`: user-facing menu toggle that keeps clusters longer, lowers marker caps further, and disables labels for laggy Android devices.
- Delayed post-zoom marker rebuilds longer on Android in `v7.0.3` so Chrome can finish tile compositing before the app re-renders markers.
- Added Map Debug long-task monitoring so Android tests can see when JavaScript blocks the main thread.
- Strengthened Android lite mode in `v7.0.5`: it now hides individual marker layers during pan/zoom and redraws them after the gesture settles.

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
11. Open Menu while GPS is active and confirm the GPS status strip changes between FOLLOW, COMPASS, FREE, and OFF.
12. Use Menu -> Reload App after deploy if a phone still shows older behavior; it should reload with a cache-busting query string.
13. Enable Map Debug while GPS is active and confirm the overlay shows gps, acc/head, and fix age.
14. Test on Android Chrome with Map Debug open. The overlay should show `android perf`, marker limit should be lower than iOS, and pinch zoom should feel steadier.
15. If Android still lags, open Menu -> โหมดลื่นพิเศษ. Map Debug should show `android lite` and marker limits should drop again.
16. Watch Map Debug `longtask`; repeated values above 80ms mean main-thread JavaScript is still blocking Android frames.
17. In lite mode, pinch or drag the map. Map Debug should briefly show `android lite-hide`, then return to `android lite` after markers redraw.

## Known Caveats

- Leaflet does not rotate the whole map heading-up like Google Maps by default; current work rotates/aims the GPS puck and supports compass mode.
- Compass heading depends on browser support and permission. iOS may require motion/orientation permission after user interaction.
- Route/navigation mode is separate from GPS tracking and can still be polished into a more Google Maps-like flow.
- `app.js` and `index.html` are still large and globally coupled, so refactors should remain small and shippable.
- Android Chrome is more sensitive to DOM markers, backdrop blur, drop shadows, and tile repaint during pinch gestures than iOS Safari.

## Large File Strategy

Do not split everything at once. The safest order is:

1. Move pure helpers first: distance, formatting, location validation, district normalization.
2. Move marker rendering next, after mobile map behavior stays stable.
3. Move GPS tracking into a dedicated module after the mode cycling and debug fields are verified on device.
4. Move stat/changelog panel rendering after UI behavior is stable.
5. Move CSS out of `index.html` only after screenshots confirm no mobile regression.

Each split should be its own commit with a quick syntax check and mobile smoke test.

## Next Recommended Work

1. Measure Android after `v7.0.1` with Map Debug: render ms, marker count, gesture smoothness, and whether tiles blank during zoom.
2. If Android still lags in strengthened lite mode, the next fix should be replacing DOM point markers with a canvas renderer at dense zooms.
3. Polish route/navigation so GPS tracking and route guidance feel like one workflow.
4. Start helper extraction from `app.js` with no behavior changes.
5. Add screenshot-based mobile QA once browser automation is available in the current session.
6. Consider a small settings panel for GPS behavior: auto-follow, compass mode, and map tile preference.

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
