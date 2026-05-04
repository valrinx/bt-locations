# BT Locations Project Plan

## Current Priority

Mobile map performance is the active blocker. The app has about 1,600+ location points, so the map must never make the phone animate every individual DOM marker during pinch zoom.

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
