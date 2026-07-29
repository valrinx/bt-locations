---
name: BT Locations
description: A precision cockpit for trusted location operations in the field.
colors:
  carbon-night: "oklch(8% 0.008 255)"
  instrument-graphite: "oklch(11% 0.009 255)"
  machined-graphite: "oklch(14% 0.011 255)"
  hairline-alloy: "oklch(97% 0.004 255 / 0.14)"
  strong-alloy: "oklch(97% 0.004 255 / 0.32)"
  instrument-white: "oklch(96% 0.005 255)"
  secondary-readout: "oklch(79% 0.008 255)"
  muted-readout: "oklch(61% 0.012 255)"
  cold-alloy: "oklch(88% 0.025 245)"
  signal-mint: "oklch(76% 0.16 150)"
  signal-amber: "oklch(79% 0.15 78)"
  signal-red: "oklch(69% 0.19 25)"
typography:
  display:
    fontFamily: "Saira Condensed, Noto Sans Thai, Arial, sans-serif"
    fontSize: "40px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.08em"
  title:
    fontFamily: "Saira Condensed, Noto Sans Thai, Arial, sans-serif"
    fontSize: "24px"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "0.08em"
  body:
    fontFamily: "Noto Sans Thai, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "JetBrains Mono, Noto Sans Thai, ui-monospace, monospace"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.09em"
  editorial:
    fontFamily: "Cormorant Garamond, Noto Sans Thai, serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
rounded:
  square: "0"
  control-sm: "7px"
  control-md: "8px"
  sheet: "14px"
  pill: "999px"
  circle: "50%"
spacing:
  hairline: "2px"
  xs: "4px"
  sm: "6px"
  control: "8px"
  md: "10px"
  lg: "12px"
  panel: "16px"
  section: "20px"
  screen: "24px"
components:
  button-command:
    backgroundColor: "transparent"
    textColor: "{colors.instrument-white}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
    height: "40px"
  button-command-hover:
    backgroundColor: "{colors.instrument-white}"
    textColor: "{colors.carbon-night}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
    height: "40px"
  button-operational:
    backgroundColor: "{colors.machined-graphite}"
    textColor: "{colors.secondary-readout}"
    typography: "{typography.label}"
    rounded: "{rounded.control-sm}"
    padding: "7px 10px"
    height: "34px"
  input-command:
    backgroundColor: "transparent"
    textColor: "{colors.instrument-white}"
    typography: "{typography.body}"
    rounded: "{rounded.square}"
    padding: "8px 0"
    height: "40px"
  chip-filter:
    backgroundColor: "transparent"
    textColor: "{colors.secondary-readout}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "7px 10px"
    height: "36px"
  panel-command:
    backgroundColor: "{colors.instrument-graphite}"
    textColor: "{colors.instrument-white}"
    rounded: "{rounded.square}"
    padding: "16px"
  row-operational:
    backgroundColor: "{colors.machined-graphite}"
    textColor: "{colors.instrument-white}"
    rounded: "{rounded.control-md}"
    padding: "10px 11px"
---

# Design System: BT Locations

## Overview

**Creative North Star: "The Precision Cockpit"**

BT Locations behaves like an automotive instrument panel built for field operations. A field operator glances at a mounted phone inside a vehicle under mixed daylight and dashboard shadow, so the interface uses near-black full-bleed surfaces, crisp readouts, and stable hairline boundaries. The map remains the visual canvas while surrounding controls stay quiet and predictable.

The system is operational, compact, and trustworthy. Density is intentional, motion confirms state, and semantic color appears only when it carries information. It explicitly rejects marketing-page styling, decorative dashboard patterns, playful security flows, hidden permission states, and interactions that rely on hover or color alone.

**Key Characteristics:**

- Full-bleed Carbon Night surfaces with restrained tonal separation.
- Automotive display type paired with utilitarian body and mono readouts.
- Hairline boundaries, precise outlines, and compact touch-safe controls.
- Flat surfaces at rest with rare elevation for overlays and tool sheets.
- Semantic signals remain readable through text, shape, and state labels.
- Responsive structure that preserves the map as the primary canvas.

## Colors

The palette is monochrome automotive instrumentation with a cold metallic voice and sparse operational signals.

### Primary

- **Cold Alloy:** Marks the current selection, primary focus, and active command. Its rarity communicates priority.

### Secondary

- **Signal Mint:** Communicates available, live, successful, and map-focus states. It never acts as decoration.
- **Signal Amber:** Communicates attention, pending work, and recoverable warnings.
- **Signal Red:** Communicates destructive actions, errors, and irreversible risk.

### Neutral

- **Carbon Night:** The full-bleed application and map-chrome canvas.
- **Instrument Graphite:** Toolbars, sidebars, dialogs, drawers, and persistent control planes.
- **Machined Graphite:** Raised operational rows and compact interactive surfaces.
- **Instrument White:** Primary labels, titles, and selected controls.
- **Secondary Readout:** Supporting text and available inactive controls.
- **Muted Readout:** Metadata, timestamps, hints, and tertiary navigation.
- **Hairline Alloy:** Default dividers and quiet component boundaries.
- **Strong Alloy:** Focused boundaries and controls that need stronger affordance.

**The One Signal Rule.** Cold Alloy occupies no more than ten percent of a screen. Signal colors are reserved for operational meaning.

**The Tinted Neutral Rule.** Pure black and pure white are forbidden. Every neutral carries the cool instrument hue.

## Typography

**Display Font:** Saira Condensed with Noto Sans Thai and Arial fallbacks

**Body Font:** Noto Sans Thai with the system sans stack

**Label/Mono Font:** JetBrains Mono with Noto Sans Thai and system monospace fallbacks

**Editorial Font:** Cormorant Garamond with Noto Sans Thai and serif fallbacks

**Character:** Saira Condensed gives headings the posture of an automotive gauge. Noto Sans Thai keeps dense operational text legible, JetBrains Mono makes commands and coordinates scan quickly, and Cormorant Garamond appears only in human notes where a softer voice is useful.

### Hierarchy

- **Display:** Used for place names, modal headings, and major numerical readouts. Keep lines short and never use it for controls.
- **Title:** Used for panel titles and compact section ownership.
- **Body:** Used for instructions, values, and readable operational copy. Prose is capped at 70 characters per line.
- **Label:** Used for tabs, command buttons, statuses, metadata keys, coordinates, and version readouts. Uppercase is allowed only for short Latin command labels.
- **Editorial:** Used only for place notes or contextual narrative, never for navigation or data entry.

**The Readout Rule.** Coordinates, timestamps, status codes, and compact commands always use the mono role.

**The Thai Clarity Rule.** Never force uppercase or excessive letter spacing onto Thai text.

## Elevation

The system is flat by default. Depth comes from tonal layering, one-pixel boundaries, and full-bleed panel placement. Shadows are structural exceptions for a field-operations sheet, a temporary overlay, or a floating element that must separate from the map. Decorative ambient shadows are forbidden.

### Shadow Vocabulary

- **Tool Sheet Lift:** A broad, low-contrast lateral shadow separates a desktop operations sheet from the map.
- **Overlay Lift:** A deep, diffuse shadow may support a temporary dialog when a boundary alone is insufficient.
- **Focus Ring:** A restrained three-pixel translucent ring communicates keyboard or input focus without simulating physical elevation.

**The Flat-at-Rest Rule.** Persistent navigation, cards, map controls, lists, and statistics have no shadow.

**The Boundary Before Shadow Rule.** Add a hairline boundary first. Use a shadow only when two temporary surfaces still merge visually.

## Components

Components feel precise and restrained. Every control has a visible boundary, a clear active state, and a touch target suitable for field use.

### Buttons

- **Shape:** Command buttons use a full pill. Operational actions inside dense data tools use gently curved controls.
- **Primary:** The command variant starts transparent with an Instrument White outline and inverts on hover or active state.
- **Hover / Focus:** State changes complete within 160 to 220 milliseconds. Focus is visible through a strong boundary or restrained ring.
- **Secondary / Ghost:** Ghost controls remain transparent with Secondary Readout text. Disabled controls keep their shape and reduce opacity.
- **Destructive:** Signal Red appears in text and boundary, never as a large decorative fill.

### Chips

- **Style:** Filter chips are compact outlined pills with mono labels.
- **State:** The selected state gains Instrument White text plus a subtle neutral fill. Status chips include readable text and never rely on color alone.

### Cards / Containers

- **Corner Style:** Persistent panels and data cards are square. Compact operational rows may use the small control radius. Mobile tool sheets curve only their exposed top corners.
- **Background:** Persistent planes use Instrument Graphite. Data rows use transparent or Machined Graphite surfaces.
- **Shadow Strategy:** Flat at rest. Only temporary overlays and field-operation sheets may lift.
- **Border:** One-pixel Hairline Alloy by default, Strong Alloy for selected or focused states.
- **Internal Padding:** Dense rows use the medium and large spacing steps. Panels use the panel spacing step.

### Inputs / Fields

- **Style:** Primary forms use transparent fields with a bottom hairline. Dense operational tools may use outlined Machined Graphite fields.
- **Focus:** Shift the boundary to Instrument White or Cold Alloy and add the restrained focus ring where necessary.
- **Error / Disabled:** Errors pair Signal Red with explicit text. Disabled controls preserve labels and lower opacity.

### Navigation

Navigation uses quiet mono labels, flat surfaces, and a single selected indicator. Desktop side navigation and mobile bottom navigation share the same active vocabulary. Horizontal tab sets scroll on narrow screens instead of compressing labels.

### Map Canvas

The map is the dominant visual surface. Toolbars, launchers, markers, location cards, and overlays stay compact so they do not compete with geographic context. A “view location” action closes the current tool, moves the map, and reveals the location detail state.

### Field Operations Sheet

The operations sheet is the signature management surface. Search and filters remain sticky while its independent body scrolls. Rows expose map viewing separately from edit, merge, restore, and bulk actions so inspection never implies mutation.

## Do's and Don'ts

### Do:

- **Do** preserve Carbon Night as the full-bleed canvas and Instrument Graphite for control planes.
- **Do** keep the map primary and surrounding chrome quiet.
- **Do** use one-pixel Hairline Alloy boundaries before introducing elevation.
- **Do** keep operational motion between 160 and 220 milliseconds with ease-out-quart or ease-out-expo curves.
- **Do** provide keyboard focus, touch-safe targets, reduced-motion behavior, and text labels for every status.
- **Do** keep authorization visible before destructive actions and preserve recoverable workflows.
- **Do** use Signal Mint, Signal Amber, and Signal Red only for operational meaning.

### Don't:

- **Don't** use marketing-page styling.
- **Don't** introduce decorative dashboard patterns.
- **Don't** make security flows playful.
- **Don't** hide permission states.
- **Don't** create interactions that rely on hover or visual color alone.
- **Don't** use pure black, pure white, neon accents, gradient text, or decorative gradients.
- **Don't** use glassmorphism as a default surface treatment.
- **Don't** add a colored side-stripe border to cards, rows, callouts, or alerts.
- **Don't** use identical decorative card grids or hero-metric templates.
- **Don't** add ambient shadows to persistent navigation, cards, lists, statistics, or map controls.
- **Don't** use display or editorial type for form labels, buttons, coordinates, or status readouts.
