# Product

## Register

product

## Users

Field teams who use BT Locations while checking, planning, and updating physical locations on a map. They need to scan many points quickly, understand which areas are dense, open the right location with confidence, and move between map, list, route, and filters without fighting the interface.

## Product Purpose

BT Locations is a location operations tool for managing mapped points, groups, districts, routes, and field context. Success means the marker system stays understandable at every zoom level, performs well with many points, and makes the next field action obvious without crowding the map.

## Brand Personality

Focused, technical, energetic. The UI can keep a neon-adjacent dark field aesthetic, but the product should feel disciplined and operational rather than decorative.

## Anti-references

Avoid cluttered marker layers, emoji-based map symbols, noisy popups, inconsistent cluster behavior, and dashboard decoration that competes with the map. Do not make marker states rely only on color.

## Design Principles

1. Keep the map readable first: marker visuals must reduce ambiguity, not add ornament.
2. Reveal detail progressively: show area density when zoomed out, precise points when zoomed in, and location detail only after intent.
3. Make field actions fast: tapping a marker should lead directly to inspect, route, edit, or filter decisions.
4. Treat performance as UX: marker rendering should avoid unnecessary rebuilds, layout thrash, and large DOM payloads.
5. Use neon with restraint: bright color should indicate state, priority, or category, not become background noise.

## Accessibility & Inclusion

Target practical WCAG AA behavior where possible. Marker states should combine shape, size, labels, and contrast rather than relying only on hue. Motion should be short and state-driven, with reduced-motion users still receiving clear feedback.
