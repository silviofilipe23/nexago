---
name: nexago-design-system
description: >-
  Implements the NexaGO product design system (orange brand, dark-first surfaces,
  semantic status colors) in Flutter and web. Use when building or redesigning UI
  in nexago_app, updating theme/tokens, ColorScheme, premium screens, arena or
  athlete flows, or when the user mentions design system, brand colors, or visual
  consistency.
---

# NexaGO Design System

Official visual language for **nexago_app** (Flutter) and aligned web surfaces. **Dark mode is native**; light mode is secondary (outdoor / strong sun). **Orange is the action signal** — never a large background. Black and gray carry layout weight.

## Before coding UI

1. Read token values in [references/tokens.md](references/tokens.md).
2. Prefer `Theme.of(context).colorScheme` and shared tokens in `nexago_app/lib/core/theme/` over hardcoded hex in widgets.
3. Reuse existing motion/layout primitives: `FadeSlideIn`, `AppScaffold`, section spacing from nearby screens in the same feature.
4. Do **not** mix legacy palette (Airbnb coral `#FF385C`, web violet `#7c3aed`) with NexaGO orange unless explicitly migrating that file.

## Core rules

| Rule | Detail |
|------|--------|
| **Brand orange** | Primary actions, selected nav, links, focus rings. Use hover/pressed steps for interaction states. |
| **Surfaces** | Stack canvas → card → raised → sheet. Avoid flat white cards on dark canvas. |
| **Status colors** | Live = red, Win = green, Pending = yellow. Do not repurpose for generic success/error outside match/booking context. |
| **Contrast** | Minimum **4.5:1** for body text; orange on dark only for labels/buttons sized appropriately. |
| **Light mode** | Surfaces invert to warm light (`#FAF8F4`); orange unchanged. |

## Flutter implementation

**Source of truth (target):** extend `AppColors` + `AppTheme` in:

- `nexago_app/lib/core/theme/app_colors.dart`
- `nexago_app/lib/core/theme/app_theme.dart`

**Map tokens 1:1 to `ColorScheme` (Material 3):**

| Token | Dark `ColorScheme` role (typical) |
|-------|----------------------------------|
| Canvas `#050505` | `scaffoldBackgroundColor` / `surfaceContainerLowest` |
| Card `#0B0B0C` | `surface` |
| Raised `#131316` | `surfaceContainerHigh` |
| Sheet `#1B1B1F` | `surfaceContainerHighest` |
| Orange `#FF6A1A` | `primary` |
| Muted text | `onSurfaceVariant` (define in theme, not random grays) |

Add **dark** `ThemeData` as default in `MaterialApp`. Keep light theme as `AppTheme.light` using warm canvas.

**Widget patterns (arena dashboard / bookings reference):**

- Page intro: `bodyLarge`, `fontWeight: w500`, muted `onSurfaceVariant`, `height: 1.5`.
- Section titles: `titleMedium`, `fontWeight: w800`, `letterSpacing: -0.3`.
- Content width cap ~640–720px on tablet, centered.
- Horizontal padding **20–28**; vertical section gaps **18–36**.
- Cards: subtle border or elevation on `surface` / raised — no heavy shadows on dark.

**Status chips / badges:**

```dart
// Use semantic tokens, not ColorScheme.primary, for:
// live → AppColors.live
// win  → AppColors.win
// pending schedule → AppColors.pending
// inactive → surface sheet / onSurfaceVariant
```

## Web (Angular / SCSS)

Legacy tokens live in `frontend/projects/site/src/design-system/_colors.scss` (violet gradient). **New work** should migrate toward NexaGO orange tokens in `references/tokens.md`. When touching athlete/site SCSS, update CSS variables rather than introducing a third palette.

## Migration checklist

When updating a screen from old styling:

- [ ] Replace `AppColors.brand` / `#FF385C` with NexaGO orange scale
- [ ] Replace pure white scaffold with canvas/card surfaces in dark mode
- [ ] Wire semantic status colors for live/win/pending
- [ ] Verify contrast on real device (simulator + light mode if supported)
- [ ] No orange full-screen backgrounds or hero fills

## Additional resources

- Full hex table, Flutter constants snippet, CSS variables: [references/tokens.md](references/tokens.md)
