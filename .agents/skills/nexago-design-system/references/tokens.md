# NexaGO — Color tokens (03)

Source: product design system **03 - COLOR TOKENS**. Three families map 1:1 to Flutter `ColorScheme`.

## Brand — Orange

| Token | Hex | Usage |
|-------|-----|--------|
| Orange / Hover (400) | `#FF8A4A` | Hover, highlighted borders |
| **NexaGO Orange (500) PRIMARY** | `#FF6A1A` | Primary buttons, FAB, selected nav, links |
| Pressed (600) | `#E5560E` | Active/pressed state |

**Rule:** Orange signals action. Never use as large background fills.

## Surfaces — Dark (native)

| Token | Hex | Usage |
|-------|-----|--------|
| Canvas (BG) | `#050505` | Scaffold / app background |
| Card (Surface 0) | `#0B0B0C` | Cards, list tiles |
| Raised (Surface 1) | `#131316` | Elevated cards, inputs |
| Sheet (Surface 2) | `#1B1B1F` | Bottom sheets, modals, inactive muted bg |

## Status & semantics

Reserved for **match / booking feedback**. Live is always red for instant recognition at any brightness.

| Token | Hex | Usage |
|-------|-----|--------|
| Live red (LIVE) | `#FF3B30` | Live match, urgent live indicator |
| Win green (WIN) | `#2BD17E` | Win / confirmed positive outcome |
| Schedule (PENDING) | `#F4C543` | Scheduled / pending |
| Inactive (MUTED) | `#1B1B1F` | Disabled slots, inactive (same as Sheet) |

## Light mode (courtesy)

| Token | Hex | Usage |
|-------|-----|--------|
| Primary (dark canvas inverse) | `#FAF8F4` | Light scaffold / warm background |
| Orange | `#FF6A1A` | Unchanged from dark |

Maintain **4.5:1** minimum contrast for body text in both modes.

---

## Flutter — `AppColors` target

```dart
abstract final class AppColors {
  AppColors._();

  // Brand
  static const Color brand = Color(0xFFFF6A1A);
  static const Color brandHover = Color(0xFFFF8A4A);
  static const Color brandPressed = Color(0xFFE5560E);

  // Surfaces (dark)
  static const Color canvas = Color(0xFF050505);
  static const Color surfaceCard = Color(0xFF0B0B0C);
  static const Color surfaceRaised = Color(0xFF131316);
  static const Color surfaceSheet = Color(0xFF1B1B1F);

  // Light
  static const Color canvasLight = Color(0xFFFAF8F4);

  // Status
  static const Color live = Color(0xFFFF3B30);
  static const Color win = Color(0xFF2BD17E);
  static const Color pending = Color(0xFFF4C543);

  // Text (define onSurface / muted in theme; examples)
  static const Color onSurface = Color(0xFFF5F5F7);
  static const Color onSurfaceMuted = Color(0xFF9A9AA3);
}
```

## Flutter — `ColorScheme.dark` sketch

```dart
colorScheme: ColorScheme.dark(
  primary: AppColors.brand,
  onPrimary: Colors.white,
  surface: AppColors.surfaceCard,
  onSurface: AppColors.onSurface,
  surfaceContainerLowest: AppColors.canvas,
  surfaceContainerHigh: AppColors.surfaceRaised,
  surfaceContainerHighest: AppColors.surfaceSheet,
  onSurfaceVariant: AppColors.onSurfaceMuted,
  error: AppColors.live, // only if aligned with product; else Material error
),
scaffoldBackgroundColor: AppColors.canvas,
```

## CSS variables (web migration)

```css
:root {
  --nexago-orange-400: #ff8a4a;
  --nexago-orange-500: #ff6a1a;
  --nexago-orange-600: #e5560e;

  --nexago-canvas: #050505;
  --nexago-surface-0: #0b0b0c;
  --nexago-surface-1: #131316;
  --nexago-surface-2: #1b1b1f;

  --nexago-live: #ff3b30;
  --nexago-win: #2bd17e;
  --nexago-pending: #f4c543;

  --nexago-canvas-light: #faf8f4;
}
```

## Legacy (do not use in new UI)

| Location | Old value | Notes |
|----------|-----------|--------|
| `app_colors.dart` | `#FF385C` | Airbnb-style; replace on touch |
| `design-system/_colors.scss` | `#7c3aed` violet | Web hub; migrate when editing SCSS |
