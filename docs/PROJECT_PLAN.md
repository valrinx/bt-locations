# BT Locations Project Plan

## Current Priority

Mobile map performance is the active blocker. The app has about 1,600+ location points, so the map must never make the phone animate every individual DOM marker during pinch zoom.

The active handoff/status file is `WORKLOG_HANDOFF.md`. Use it first if this conversation context is missing or compacted.

Current device-specific blocker: Android Chrome lags while iOS stays smooth. Treat Android as a stricter performance tier, not just generic mobile.

## Large File Strategy

The current app is intentionally being split gradually. Avoid one large rewrite because `app.js` and `index.html` still share many globals and inline event handlers.

- Keep each refactor small, shippable, and reversible.
- Reduce startup work before moving code: lazy-load large data, avoid repeated DOM rebuilds, and gate mobile-only handlers.
- Split pure helpers first because they have the lowest dependency risk.
- Split CSS and UI panels after mobile behavior is stable.
- Keep `locations.js` as a fallback snapshot, but do not load it on every startup.
- Keep `all_locations.json` as the source snapshot.

### Completed Refactor Safety Steps

- Added map-only update path for pan/zoom.
- Prevented duplicate long-press handlers on mobile.
- Optimized sidebar counts to avoid repeated full-array filters.
- Lazy-load `locations.js` only when no local location data exists.
- Batched map-only pan/zoom updates with `requestAnimationFrame`.
- Documented the current mobile/GPS work and next steps in `WORKLOG_HANDOFF.md`.
- Added a mobile drawer GPS status strip and explicit stop GPS action for field testing.
- Bumped app/service-worker versioning and forced service-worker update checks to bypass stale mobile code more reliably.
- Added mobile reload-app control and live GPS status quality/age updates for easier field troubleshooting.
- Added GPS status lines to Map Debug so field testers can inspect map and GPS health together.
- Expanded debug export with app version, map stats, and GPS health snapshot.
- Added Android-specific performance mode with lower marker caps, deferred tile updates during zoom, reduced labels, and lighter CSS effects during gestures.
- Added Android lite mode toggle with stricter caps and longer cluster mode for laggy Android devices.
- Increased Android post-zoom settle delay before marker rebuilds to reduce frame contention after pinch gestures.

## Phase 1: Mobile Map Stability

- Keep district clusters at broad zoom levels.
- Remove individual marker layers during mobile zoom gestures.
- Re-render markers only after zoom settles.
- Limit mobile individual markers to the nearest visible points per zoom level.
- Keep marker labels and tooltips off on mobile unless the user intentionally opens a place.
- Add a debug metric for visible markers, render time, and current zoom.

## Phase 2: Marker Engine

- Move marker-specific logic from `app.js` into a dedicated marker module once the build path supports modules.
- Cache district clusters by filter signature.
- Replace full marker rebuilds with layer diffs everywhere.
- Batch marker insertion with `requestAnimationFrame` if visible marker limits need to increase.
- Add a fallback canvas marker layer for dense point views.

## Phase 3: Data And Sync Safety

- Keep `all_locations.json` as the source data snapshot.
- Add schema versioning for imported/exported data.
- Validate duplicate and out-of-bounds locations before import.
- Keep Supabase writes targeted to single-row inserts, updates, and deletes.
- Add a recovery screen for sync/load failures.

## Phase 4: UX Workflow

- Make search, filter, district selection, route planning, and editing reachable in two taps on mobile.
- Keep map controls compact and predictable.
- Show density first, details after intent.
- Add clearer empty states for filtered results.
- Make favorite, route, edit, and share actions consistent across place cards and sheets.

## Phase 5: Architecture

- Split the app gradually instead of rewriting it.
- Start with pure helpers: filters, distance, marker color, validation.
- Then split map layers, route features, data sync, and UI panels.
- Keep legacy globals during migration, then remove them after each module is stable.

## Phase 6: Quality Gates

- Run `node --check docs/app.js` for JavaScript syntax.
- Run the existing Python tests from the repo root.
- Smoke test `docs/index.html` locally on desktop and mobile viewport.
- Test mobile pinch zoom on a real phone before deploy.
- Track performance regressions in `window.btDebug`.
