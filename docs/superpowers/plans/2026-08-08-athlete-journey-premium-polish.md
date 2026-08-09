# Polimento Premium da Jornada do Atleta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevar a percepção premium do app nexaGO polindo tokens, componentes compartilhados e as telas da jornada do atleta (home → competir → torneios → inscrição → ranking → perfil), sem mudar fluxo, rota ou regra de negócio.

**Architecture:** Fase 1 cria tokens (`core/theme/`) e componentes (`core/ui/`) que a Fase 2 aplica tela a tela. `ArenaDashboardTokens` passa a delegar aos novos tokens (retrocompat). Estados async convergem para `NexaAsyncView` sobre os `AppStatusViews` existentes.

**Tech Stack:** Flutter 3.44.7 / Dart, flutter_riverpod (AsyncValue), flutter_test. Sem dependências novas.

**Spec:** `docs/superpowers/specs/2026-08-08-athlete-journey-premium-polish-design.md`

## Global Constraints

- **Diretório de trabalho (worktree!):** TODOS os caminhos abaixo são relativos a `/Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/athlete-removal-description-947a56/nexago_app/`. NUNCA editar o checkout principal (`/Users/silviodionizio/Documents/projects/volley/nexago/nexago_app/...` sem o sufixo do worktree) — o caminho existe e o Edit passa calado. Sempre ler o arquivo INTEIRO antes de editar.
- **Zero mudança de:** rotas, fluxos de navegação, regras de negócio, backend, Firestore, strings de negócio.
- **Retrocompatibilidade:** telas fora da jornada não mudam de aparência. `ArenaDashboardTokens` mantém os mesmos valores (20/28/16/999). Builders atuais de `AppTypography` (`mono()`, `soraRegular()`, `xpReward()`) não mudam de assinatura.
- **Temas:** dark é o alvo do capricho; no light basta legibilidade correta via `context.themeColors` (nunca `AppColors.onSurface/surfaceCard/surfaceRaised/surfaceSheet/canvas/black/white` cru em widget de tela).
- **Strings de UI em português; código em inglês.**
- **Análise:** `flutter analyze lib/<paths tocados> test/<paths tocados>` limpo a cada task (não rodar na raiz do repo — o analyzer é poluído por `build/`).
- **Testes:** suíte roda com `flutter test` a partir de `nexago_app/`. Testes novos de componente seguem o padrão: pump `MaterialApp(theme: AppTheme.dark, home: Scaffold(body: ...))`.
- **Commits:** um por task, mensagem `feat(ui): ...` / `fix(ui): ...` / `refactor(ui): ...`, com `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Interfaces já existentes (consumidas pelo plano — NÃO recriar)

```dart
// core/theme/app_theme_colors.dart
context.themeColors -> AppThemeColors { canvas, surfaceCard, surfaceRaised, surfaceSheet,
  onSurface, onSurfaceMuted, outline, brand, brandHover, brandPressed, live, win, pending,
  white, black, isDark }

// core/ui/app_status_views.dart
AppLoadingView({String? message})
AppEmptyView({required IconData icon, required String title, required String subtitle,
  String? actionLabel, VoidCallback? onAction})
AppErrorView({required String title, required String message, required VoidCallback onRetry,
  String retryLabel = 'Tentar novamente'})
AppInlineErrorView({String message = 'Não foi possível carregar.', Object? error})

// core/ui/fade_slide_in.dart
FadeSlideIn({required Widget child, double offsetY, Duration? delay})
List<Widget> staggeredFadeSlide(List<Widget> children, {...})

// core/theme/app_typography.dart (builders mantidos)
AppTypography.mono({fontSize, fontWeight = w700, color, letterSpacing, height})
AppTypography.soraRegular({fontSize, fontWeight = w700, color, letterSpacing, height})
```

---

# FASE 1 — FUNDAÇÃO

### Task 1: Tokens de espaçamento, raio e movimento

**Files:**
- Create: `lib/core/theme/app_spacing.dart`
- Create: `lib/core/theme/app_radii.dart`
- Create: `lib/core/theme/app_motion.dart`
- Modify: `lib/features/arena/presentation/widgets/arena_dashboard_tokens.dart:9-12`
- Test: `test/core/theme/app_tokens_test.dart`

**Interfaces:**
- Produces: `AppSpacing.{xs=4,sm=8,md=12,lg=16,xl=20,xxl=24,xxxl=32,screenH=20,sectionGap=28}` (double), `AppRadii.{sm=8,md=12,lg=16,xl=24,pill=999}` (double) + `AppRadii.{smAll,mdAll,lgAll,xlAll,pillAll}` (BorderRadius const), `AppMotion.{fast=150ms,base=220ms,slow=420ms}` (Duration) + `AppMotion.{curve=Curves.easeOutCubic,emphasized=Curves.easeInOutCubic}`.

- [ ] **Step 1: Escrever o teste que falha**

```dart
// test/core/theme/app_tokens_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_radii.dart';
import 'package:nexago_app/core/theme/app_motion.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_dashboard_tokens.dart';

void main() {
  test('escala de espaçamento é crescente e múltipla de 4', () {
    const scale = [AppSpacing.xs, AppSpacing.sm, AppSpacing.md, AppSpacing.lg,
        AppSpacing.xl, AppSpacing.xxl, AppSpacing.xxxl];
    for (var i = 1; i < scale.length; i++) {
      expect(scale[i], greaterThan(scale[i - 1]));
      expect(scale[i] % 4, 0);
    }
    expect(AppSpacing.screenH, 20);
    expect(AppSpacing.sectionGap, 28);
  });

  test('raios colapsam nos 5 valores canônicos', () {
    expect(AppRadii.sm, 8);
    expect(AppRadii.md, 12);
    expect(AppRadii.lg, 16);
    expect(AppRadii.xl, 24);
    expect(AppRadii.pill, 999);
  });

  test('ArenaDashboardTokens delega para os tokens novos sem mudar valor', () {
    expect(ArenaDashboardTokens.horizontalPadding, AppSpacing.screenH);
    expect(ArenaDashboardTokens.sectionGap, AppSpacing.sectionGap);
    expect(ArenaDashboardTokens.cardRadius, AppRadii.lg);
    expect(ArenaDashboardTokens.chipRadius, AppRadii.pill);
  });

  test('durações de movimento', () {
    expect(AppMotion.fast.inMilliseconds, 150);
    expect(AppMotion.base.inMilliseconds, 220);
    expect(AppMotion.slow.inMilliseconds, 420);
  });
}
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd nexago_app && flutter test test/core/theme/app_tokens_test.dart`
Expected: FAIL (imports não existem).

- [ ] **Step 3: Criar os 3 arquivos de token**

```dart
// lib/core/theme/app_spacing.dart
/// Escala de espaçamento NexaGO (grid de 4pt).
abstract final class AppSpacing {
  AppSpacing._();

  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 20;
  static const double xxl = 24;
  static const double xxxl = 32;

  /// Padding horizontal padrão de tela.
  static const double screenH = 20;

  /// Respiro vertical entre seções de uma tela.
  static const double sectionGap = 28;
}
```

```dart
// lib/core/theme/app_radii.dart
import 'package:flutter/widgets.dart';

/// Raios de borda NexaGO — use SEMPRE um destes 5 valores.
abstract final class AppRadii {
  AppRadii._();

  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double pill = 999;

  static const BorderRadius smAll = BorderRadius.all(Radius.circular(sm));
  static const BorderRadius mdAll = BorderRadius.all(Radius.circular(md));
  static const BorderRadius lgAll = BorderRadius.all(Radius.circular(lg));
  static const BorderRadius xlAll = BorderRadius.all(Radius.circular(xl));
  static const BorderRadius pillAll = BorderRadius.all(Radius.circular(pill));
}
```

```dart
// lib/core/theme/app_motion.dart
import 'package:flutter/animation.dart';

/// Durações e curvas padrão de animação NexaGO.
abstract final class AppMotion {
  AppMotion._();

  static const Duration fast = Duration(milliseconds: 150);
  static const Duration base = Duration(milliseconds: 220);
  static const Duration slow = Duration(milliseconds: 420);

  static const Curve curve = Curves.easeOutCubic;
  static const Curve emphasized = Curves.easeInOutCubic;
}
```

- [ ] **Step 4: Fazer `ArenaDashboardTokens` delegar (ler o arquivo inteiro antes)**

Em `lib/features/arena/presentation/widgets/arena_dashboard_tokens.dart`, adicionar imports e trocar as linhas 9-12:

```dart
import 'package:nexago_app/core/theme/app_radii.dart';
import 'package:nexago_app/core/theme/app_spacing.dart';
// ...
  static const double horizontalPadding = AppSpacing.screenH;
  static const double sectionGap = AppSpacing.sectionGap;
  static const double cardRadius = AppRadii.lg;
  static const double chipRadius = AppRadii.pill;
```

- [ ] **Step 5: Rodar teste e analyze**

Run: `flutter test test/core/theme/app_tokens_test.dart && flutter analyze lib/core/theme lib/features/arena/presentation/widgets/arena_dashboard_tokens.dart test/core/theme`
Expected: PASS / No issues found.

- [ ] **Step 6: Commit**

```bash
git add nexago_app/lib/core/theme/app_spacing.dart nexago_app/lib/core/theme/app_radii.dart nexago_app/lib/core/theme/app_motion.dart nexago_app/lib/features/arena/presentation/widgets/arena_dashboard_tokens.dart nexago_app/test/core/theme/app_tokens_test.dart
git commit -m "feat(ui): tokens de espaçamento, raio e movimento (AppSpacing/AppRadii/AppMotion)"
```

---

### Task 2: Tokens de borda e sombra

**Files:**
- Create: `lib/core/theme/app_borders.dart`
- Create: `lib/core/theme/app_shadows.dart`
- Test: `test/core/theme/app_borders_shadows_test.dart`

**Interfaces:**
- Consumes: `AppThemeColors` (Task 0 — já existe).
- Produces:
  - `AppBorders.subtleSide(AppThemeColors) -> BorderSide` (alpha 0.08), `AppBorders.baseSide(...)` (alpha 0.12), `AppBorders.strongSide(...)` (alpha 0.22) — todos sobre `colors.onSurfaceMuted`; e `AppBorders.subtle/base/strong(AppThemeColors) -> Border`.
  - `AppShadows.card(AppThemeColors) -> List<BoxShadow>` (blur 16, offset (0,6), alpha 0.35 dark / 0.10 light), `AppShadows.floating(AppThemeColors) -> List<BoxShadow>` (blur 20, offset (0,8), alpha 0.45 dark / 0.14 light).

- [ ] **Step 1: Escrever o teste que falha**

```dart
// test/core/theme/app_borders_shadows_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_borders.dart';
import 'package:nexago_app/core/theme/app_shadows.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

void main() {
  final dark = AppThemeColors.ofBrightness(Brightness.dark);
  final light = AppThemeColors.ofBrightness(Brightness.light);

  test('bordas usam onSurfaceMuted com alphas canônicos', () {
    expect(AppBorders.subtleSide(dark).color.a, closeTo(0.08, 0.001));
    expect(AppBorders.baseSide(dark).color.a, closeTo(0.12, 0.001));
    expect(AppBorders.strongSide(dark).color.a, closeTo(0.22, 0.001));
    expect(AppBorders.base(dark).top.color.a, closeTo(0.12, 0.001));
  });

  test('sombras são mais suaves no light', () {
    expect(AppShadows.floating(dark).single.color.a,
        greaterThan(AppShadows.floating(light).single.color.a));
    expect(AppShadows.card(dark).single.blurRadius, 16);
    expect(AppShadows.floating(dark).single.blurRadius, 20);
  });
}
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `flutter test test/core/theme/app_borders_shadows_test.dart`
Expected: FAIL (imports não existem).

- [ ] **Step 3: Implementar**

```dart
// lib/core/theme/app_borders.dart
import 'package:flutter/widgets.dart';

import 'app_theme_colors.dart';

/// Bordas padrão NexaGO — normaliza os alphas usados em superfícies.
abstract final class AppBorders {
  AppBorders._();

  static const double subtleAlpha = 0.08;
  static const double baseAlpha = 0.12;
  static const double strongAlpha = 0.22;

  static BorderSide subtleSide(AppThemeColors colors) =>
      BorderSide(color: colors.onSurfaceMuted.withValues(alpha: subtleAlpha));

  static BorderSide baseSide(AppThemeColors colors) =>
      BorderSide(color: colors.onSurfaceMuted.withValues(alpha: baseAlpha));

  static BorderSide strongSide(AppThemeColors colors) =>
      BorderSide(color: colors.onSurfaceMuted.withValues(alpha: strongAlpha));

  static Border subtle(AppThemeColors colors) =>
      Border.fromBorderSide(subtleSide(colors));

  static Border base(AppThemeColors colors) =>
      Border.fromBorderSide(baseSide(colors));

  static Border strong(AppThemeColors colors) =>
      Border.fromBorderSide(strongSide(colors));
}
```

```dart
// lib/core/theme/app_shadows.dart
import 'package:flutter/widgets.dart';

import 'app_theme_colors.dart';

/// Sombras padrão NexaGO (dark precisa de sombra mais forte que light).
abstract final class AppShadows {
  AppShadows._();

  static List<BoxShadow> card(AppThemeColors colors) => [
        BoxShadow(
          color: colors.black.withValues(alpha: colors.isDark ? 0.35 : 0.10),
          blurRadius: 16,
          offset: const Offset(0, 6),
        ),
      ];

  static List<BoxShadow> floating(AppThemeColors colors) => [
        BoxShadow(
          color: colors.black.withValues(alpha: colors.isDark ? 0.45 : 0.14),
          blurRadius: 20,
          offset: const Offset(0, 8),
        ),
      ];
}
```

- [ ] **Step 4: Rodar teste e analyze**

Run: `flutter test test/core/theme/app_borders_shadows_test.dart && flutter analyze lib/core/theme test/core/theme`
Expected: PASS / No issues found.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/core/theme/app_borders.dart nexago_app/lib/core/theme/app_shadows.dart nexago_app/test/core/theme/app_borders_shadows_test.dart
git commit -m "feat(ui): tokens de borda e sombra (AppBorders/AppShadows)"
```

---

### Task 3: Escala tipográfica nomeada + TextTheme derivado

**Files:**
- Modify: `lib/core/theme/app_typography.dart` (adicionar getters; NÃO mudar builders existentes)
- Modify: `lib/core/theme/app_theme.dart:130-141` (`_textTheme`)
- Test: `test/core/theme/app_typography_test.dart`

**Interfaces:**
- Produces (getters `TextStyle`, todos SEM cor — cor vem do tema/da tela):
  - Sora: `displayL` (32/w800/ls -0.8/h 1.1), `titleL` (22/w800/ls -0.4/h 1.2), `titleM` (16/w700/ls -0.2/h 1.3), `titleS` (14/w700/h 1.35), `bodyL` (16/w400/h 1.5), `bodyM` (14/w400/h 1.45), `bodyS` (12/w400/h 1.4), `labelL` (14/w700/ls 0.1), `labelS` (11/w600/ls 0.4)
  - Mono: `monoMeta` (11/w600/ls 0.4), `monoStat` (16/w800/ls 0.2/h 1.0), `eyebrow` (10/w700/ls 1.2 — usar com `.toUpperCase()` no texto)
- **Nota de risco controlado:** os tamanhos coincidem com o Material 2021 (`titleLarge` 22, `bodyMedium` 14, etc.), então o merge no `TextTheme` muda só peso/tracking/altura — telas fora da jornada mudam de forma imperceptível, não de tamanho.

- [ ] **Step 1: Escrever o teste que falha**

```dart
// test/core/theme/app_typography_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

void main() {
  test('escala nomeada: tamanhos e famílias', () {
    expect(AppTypography.displayL.fontSize, 32);
    expect(AppTypography.titleL.fontSize, 22);
    expect(AppTypography.titleM.fontSize, 16);
    expect(AppTypography.bodyM.fontSize, 14);
    expect(AppTypography.eyebrow.fontFamily, AppTypography.monoFontFamily);
    expect(AppTypography.monoStat.fontFamily, AppTypography.monoFontFamily);
    expect(AppTypography.titleL.fontFamily, AppTypography.fontFamily);
    expect(AppTypography.titleL.color, isNull);
  });

  test('TextTheme do app deriva da escala nomeada', () {
    final theme = AppTheme.dark;
    expect(theme.textTheme.titleLarge?.fontWeight, FontWeight.w800);
    expect(theme.textTheme.titleLarge?.fontSize, 22);
    expect(theme.textTheme.titleMedium?.fontWeight, FontWeight.w700);
    expect(theme.textTheme.bodyMedium?.fontSize, 14);
    expect(theme.textTheme.titleLarge?.fontFamily, AppTypography.fontFamily);
  });
}
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `flutter test test/core/theme/app_typography_test.dart`
Expected: FAIL (`displayL` não definido).

- [ ] **Step 3: Adicionar getters em `AppTypography` (após `xpReward`, antes do fechamento da classe)**

```dart
  // ── Escala nomeada (design system 04 — Type) ────────────────────────────
  // Sem cor de propósito: cor vem do TextTheme ou de context.themeColors.

  static TextStyle get displayL => soraRegular(
      fontSize: 32, fontWeight: FontWeight.w800, letterSpacing: -0.8, height: 1.1);

  static TextStyle get titleL => soraRegular(
      fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: -0.4, height: 1.2);

  static TextStyle get titleM => soraRegular(
      fontSize: 16, fontWeight: FontWeight.w700, letterSpacing: -0.2, height: 1.3);

  static TextStyle get titleS =>
      soraRegular(fontSize: 14, fontWeight: FontWeight.w700, height: 1.35);

  static TextStyle get bodyL =>
      soraRegular(fontSize: 16, fontWeight: FontWeight.w400, height: 1.5);

  static TextStyle get bodyM =>
      soraRegular(fontSize: 14, fontWeight: FontWeight.w400, height: 1.45);

  static TextStyle get bodyS =>
      soraRegular(fontSize: 12, fontWeight: FontWeight.w400, height: 1.4);

  static TextStyle get labelL =>
      soraRegular(fontSize: 14, fontWeight: FontWeight.w700, letterSpacing: 0.1);

  static TextStyle get labelS =>
      soraRegular(fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.4);

  static TextStyle get monoMeta =>
      mono(fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.4);

  static TextStyle get monoStat =>
      mono(fontSize: 16, fontWeight: FontWeight.w800, letterSpacing: 0.2, height: 1);

  /// Rótulo "eyebrow" acima de títulos — usar com texto em CAIXA ALTA.
  static TextStyle get eyebrow =>
      mono(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1.2);
```

- [ ] **Step 4: Derivar o `TextTheme` em `app_theme.dart` (substituir `_textTheme` inteiro)**

```dart
  static TextTheme _textTheme(Brightness brightness, ColorScheme colorScheme) {
    final typography = Typography.material2021();
    final material =
        brightness == Brightness.dark ? typography.white : typography.black;

    // Merge da escala nomeada sobre a base Material: mesmos tamanhos,
    // pesos/tracking/altura da marca. display/headline seguem Material.
    final base = material.copyWith(
      titleLarge: material.titleLarge?.merge(AppTypography.titleL),
      titleMedium: material.titleMedium?.merge(AppTypography.titleM),
      titleSmall: material.titleSmall?.merge(AppTypography.titleS),
      bodyLarge: material.bodyLarge?.merge(AppTypography.bodyL),
      bodyMedium: material.bodyMedium?.merge(AppTypography.bodyM),
      bodySmall: material.bodySmall?.merge(AppTypography.bodyS),
      labelLarge: material.labelLarge?.merge(AppTypography.labelL),
      labelSmall: material.labelSmall?.merge(AppTypography.labelS),
    );

    return base.apply(
      fontFamily: AppTypography.fontFamily,
      bodyColor: colorScheme.onSurface,
      displayColor: colorScheme.onSurface,
    );
  }
```

Atenção: `merge` NÃO sobrescreve `fontFamily` para os estilos mono porque nenhum estilo mono entra no `TextTheme` — `monoMeta/monoStat/eyebrow` são usados direto via `AppTypography.*`. O `apply(fontFamily:)` roda por último e manteria Sora de qualquer forma.

- [ ] **Step 5: Rodar teste novo + suíte inteira (o TextTheme é global)**

Run: `flutter test test/core/theme/app_typography_test.dart && flutter test`
Expected: PASS nos 2 (se algum teste existente falhar por golden/tamanho de texto, investigar antes de seguir — provável overflow em layout apertado; ajustar a tela, não o token).

- [ ] **Step 6: Analyze e commit**

Run: `flutter analyze lib/core/theme test/core/theme`

```bash
git add nexago_app/lib/core/theme/app_typography.dart nexago_app/lib/core/theme/app_theme.dart nexago_app/test/core/theme/app_typography_test.dart
git commit -m "feat(ui): escala tipográfica nomeada e TextTheme derivado da marca"
```

---

### Task 4: NexaSkeleton (shimmer)

**Files:**
- Create: `lib/core/ui/nexa_skeleton.dart`
- Test: `test/core/ui/nexa_skeleton_test.dart`

**Interfaces:**
- Consumes: `AppRadii`, `AppMotion`, `context.themeColors`.
- Produces:
  - `NexaSkeleton({double? width, double height = 14, BorderRadius radius = AppRadii.smAll, EdgeInsetsGeometry? margin})` — retângulo pulsante.
  - `NexaSkeleton.circle({required double size})` — círculo pulsante.

- [ ] **Step 1: Escrever o teste que falha**

```dart
// test/core/ui/nexa_skeleton_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/ui/nexa_skeleton.dart';

void main() {
  Widget wrap(Widget child) =>
      MaterialApp(theme: AppTheme.dark, home: Scaffold(body: child));

  testWidgets('renderiza com o tamanho pedido e anima sem crashar',
      (tester) async {
    await tester.pumpWidget(wrap(const NexaSkeleton(width: 120, height: 16)));
    final box = tester.getSize(find.byType(NexaSkeleton));
    expect(box.width, 120);
    expect(box.height, 16);
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 300));
  });

  testWidgets('variante circle é quadrada', (tester) async {
    await tester.pumpWidget(wrap(const NexaSkeleton.circle(size: 40)));
    final box = tester.getSize(find.byType(NexaSkeleton));
    expect(box.width, 40);
    expect(box.height, 40);
  });
}
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `flutter test test/core/ui/nexa_skeleton_test.dart`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```dart
// lib/core/ui/nexa_skeleton.dart
import 'package:flutter/material.dart';

import '../theme/app_motion.dart';
import '../theme/app_radii.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Bloco de skeleton com pulso suave — o placeholder de loading padrão.
///
/// Use no lugar de `CircularProgressIndicator` sempre que o layout final
/// da seção for conhecido (lista, card, linha de texto).
class NexaSkeleton extends StatefulWidget {
  const NexaSkeleton({
    super.key,
    this.width,
    this.height = 14,
    this.radius = AppRadii.smAll,
    this.margin,
  }) : _circleSize = null;

  const NexaSkeleton.circle({super.key, required double size, this.margin})
      : width = size,
        height = size,
        radius = AppRadii.pillAll,
        _circleSize = size;

  final double? width;
  final double height;
  final BorderRadius radius;
  final EdgeInsetsGeometry? margin;
  // ignore: unused_field — documenta a intenção do construtor nomeado.
  final double? _circleSize;

  @override
  State<NexaSkeleton> createState() => _NexaSkeletonState();
}

class _NexaSkeletonState extends State<NexaSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: AppMotion.slow * 2,
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        final t = Curves.easeInOut.transform(_controller.value);
        return Container(
          width: widget.width,
          height: widget.height,
          margin: widget.margin,
          decoration: BoxDecoration(
            color: colors.onSurfaceMuted
                .withValues(alpha: 0.08 + 0.08 * t),
            borderRadius: widget.radius,
          ),
        );
      },
    );
  }
}
```

(Se `_circleSize` gerar warning de campo não usado mesmo com o ignore, remover o campo e deixar só o construtor nomeado.)

- [ ] **Step 4: Rodar teste e analyze**

Run: `flutter test test/core/ui/nexa_skeleton_test.dart && flutter analyze lib/core/ui test/core/ui`
Expected: PASS / No issues found.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/core/ui/nexa_skeleton.dart nexago_app/test/core/ui/nexa_skeleton_test.dart
git commit -m "feat(ui): NexaSkeleton — placeholder de loading com pulso"
```

---

### Task 5: NexaAsyncView

**Files:**
- Create: `lib/core/ui/nexa_async_view.dart`
- Test: `test/core/ui/nexa_async_view_test.dart`

**Interfaces:**
- Consumes: `AsyncValue<T>` (flutter_riverpod), `AppLoadingView`, `AppErrorView`, `AppInlineErrorView` (assinaturas na seção "Interfaces já existentes").
- Produces:

```dart
NexaAsyncView<T>({
  required AsyncValue<T> value,
  required Widget Function(T data) data,
  Widget? skeleton,                 // loading; fallback AppLoadingView
  VoidCallback? onRetry,            // com retry → AppErrorView; sem → AppInlineErrorView
  bool Function(T data)? emptyWhen,
  Widget? empty,                    // exibido quando emptyWhen(data) == true
  String? loadingMessage,
  String errorTitle = 'Algo deu errado',
  String errorMessage = 'Não foi possível carregar. Tente novamente.',
})
```

- [ ] **Step 1: Escrever o teste que falha**

```dart
// test/core/ui/nexa_async_view_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/ui/app_status_views.dart';
import 'package:nexago_app/core/ui/nexa_async_view.dart';
import 'package:nexago_app/core/ui/nexa_skeleton.dart';

void main() {
  Widget wrap(Widget child) =>
      MaterialApp(theme: AppTheme.dark, home: Scaffold(body: child));

  testWidgets('data renderiza o builder', (tester) async {
    await tester.pumpWidget(wrap(NexaAsyncView<int>(
      value: const AsyncValue.data(7),
      data: (v) => Text('valor $v'),
    )));
    expect(find.text('valor 7'), findsOneWidget);
  });

  testWidgets('loading usa o skeleton quando fornecido', (tester) async {
    await tester.pumpWidget(wrap(NexaAsyncView<int>(
      value: const AsyncValue.loading(),
      skeleton: const NexaSkeleton(height: 40),
      data: (v) => const SizedBox(),
    )));
    expect(find.byType(NexaSkeleton), findsOneWidget);
    expect(find.byType(AppLoadingView), findsNothing);
  });

  testWidgets('loading sem skeleton cai no AppLoadingView', (tester) async {
    await tester.pumpWidget(wrap(NexaAsyncView<int>(
      value: const AsyncValue.loading(),
      data: (v) => const SizedBox(),
    )));
    expect(find.byType(AppLoadingView), findsOneWidget);
  });

  testWidgets('erro com onRetry mostra AppErrorView e dispara o callback',
      (tester) async {
    var retried = false;
    await tester.pumpWidget(wrap(NexaAsyncView<int>(
      value: AsyncValue.error(Exception('x'), StackTrace.empty),
      onRetry: () => retried = true,
      data: (v) => const SizedBox(),
    )));
    expect(find.byType(AppErrorView), findsOneWidget);
    await tester.tap(find.text('Tentar novamente'));
    expect(retried, isTrue);
  });

  testWidgets('erro sem onRetry mostra AppInlineErrorView', (tester) async {
    await tester.pumpWidget(wrap(NexaAsyncView<int>(
      value: AsyncValue.error(Exception('x'), StackTrace.empty),
      data: (v) => const SizedBox(),
    )));
    expect(find.byType(AppInlineErrorView), findsOneWidget);
  });

  testWidgets('emptyWhen desvia para empty', (tester) async {
    await tester.pumpWidget(wrap(NexaAsyncView<List<int>>(
      value: const AsyncValue.data([]),
      emptyWhen: (list) => list.isEmpty,
      empty: const Text('nada aqui'),
      data: (v) => const Text('lista'),
    )));
    expect(find.text('nada aqui'), findsOneWidget);
    expect(find.text('lista'), findsNothing);
  });
}
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `flutter test test/core/ui/nexa_async_view_test.dart`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```dart
// lib/core/ui/nexa_async_view.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app_status_views.dart';

/// Renderização padrão de um [AsyncValue]: skeleton no loading, erro com
/// retry e desvio de vazio — o wrapper que substitui `.when()` manual
/// nas telas da jornada.
class NexaAsyncView<T> extends StatelessWidget {
  const NexaAsyncView({
    super.key,
    required this.value,
    required this.data,
    this.skeleton,
    this.onRetry,
    this.emptyWhen,
    this.empty,
    this.loadingMessage,
    this.errorTitle = 'Algo deu errado',
    this.errorMessage = 'Não foi possível carregar. Tente novamente.',
  });

  final AsyncValue<T> value;
  final Widget Function(T data) data;
  final Widget? skeleton;
  final VoidCallback? onRetry;
  final bool Function(T data)? emptyWhen;
  final Widget? empty;
  final String? loadingMessage;
  final String errorTitle;
  final String errorMessage;

  @override
  Widget build(BuildContext context) {
    return value.when(
      data: (d) {
        if (emptyWhen?.call(d) ?? false) {
          return empty ?? const SizedBox.shrink();
        }
        return data(d);
      },
      loading: () => skeleton ?? AppLoadingView(message: loadingMessage),
      error: (error, _) {
        final retry = onRetry;
        if (retry != null) {
          return AppErrorView(
            title: errorTitle,
            message: errorMessage,
            onRetry: retry,
          );
        }
        return AppInlineErrorView(error: error);
      },
    );
  }
}
```

- [ ] **Step 4: Rodar teste e analyze**

Run: `flutter test test/core/ui/nexa_async_view_test.dart && flutter analyze lib/core/ui test/core/ui`
Expected: PASS / No issues found.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/core/ui/nexa_async_view.dart nexago_app/test/core/ui/nexa_async_view_test.dart
git commit -m "feat(ui): NexaAsyncView — estados async padronizados com retry"
```

---

### Task 6: NexaSectionHeader

**Files:**
- Create: `lib/core/ui/nexa_section_header.dart`
- Test: `test/core/ui/nexa_section_header_test.dart`

**Interfaces:**
- Consumes: `AppTypography.{titleM,eyebrow,labelL}`, `AppSpacing`, `context.themeColors`.
- Produces: `NexaSectionHeader({required String title, String? eyebrow, String? actionLabel, VoidCallback? onAction, EdgeInsetsGeometry padding = const EdgeInsets.symmetric(horizontal: AppSpacing.screenH)})`.

- [ ] **Step 1: Escrever o teste que falha**

```dart
// test/core/ui/nexa_section_header_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/ui/nexa_section_header.dart';

void main() {
  Widget wrap(Widget child) =>
      MaterialApp(theme: AppTheme.dark, home: Scaffold(body: child));

  testWidgets('renderiza título e eyebrow em caixa alta', (tester) async {
    await tester.pumpWidget(wrap(const NexaSectionHeader(
      title: 'Meus torneios',
      eyebrow: 'competições',
    )));
    expect(find.text('Meus torneios'), findsOneWidget);
    expect(find.text('COMPETIÇÕES'), findsOneWidget);
  });

  testWidgets('ação aparece e dispara callback', (tester) async {
    var tapped = false;
    await tester.pumpWidget(wrap(NexaSectionHeader(
      title: 'Ranking',
      actionLabel: 'Ver tudo',
      onAction: () => tapped = true,
    )));
    await tester.tap(find.text('Ver tudo'));
    expect(tapped, isTrue);
  });

  testWidgets('sem ação não renderiza botão', (tester) async {
    await tester.pumpWidget(wrap(const NexaSectionHeader(title: 'Agenda')));
    expect(find.byType(TextButton), findsNothing);
  });
}
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `flutter test test/core/ui/nexa_section_header_test.dart`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```dart
// lib/core/ui/nexa_section_header.dart
import 'package:flutter/material.dart';

import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Título de seção padrão da jornada: eyebrow mono opcional + título +
/// ação "Ver tudo" opcional à direita.
class NexaSectionHeader extends StatelessWidget {
  const NexaSectionHeader({
    super.key,
    required this.title,
    this.eyebrow,
    this.actionLabel,
    this.onAction,
    this.padding =
        const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
  });

  final String title;
  final String? eyebrow;
  final String? actionLabel;
  final VoidCallback? onAction;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: padding,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (eyebrow != null) ...[
                  Text(
                    eyebrow!.toUpperCase(),
                    style: AppTypography.eyebrow.copyWith(color: colors.brand),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                ],
                Text(
                  title,
                  style:
                      AppTypography.titleM.copyWith(color: colors.onSurface),
                ),
              ],
            ),
          ),
          if (actionLabel != null && onAction != null)
            TextButton(
              onPressed: onAction,
              style: TextButton.styleFrom(
                foregroundColor: colors.brand,
                padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.sm, vertical: AppSpacing.xs),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: Text(actionLabel!, style: AppTypography.labelL),
            ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 4: Rodar teste e analyze**

Run: `flutter test test/core/ui/nexa_section_header_test.dart && flutter analyze lib/core/ui test/core/ui`
Expected: PASS / No issues found.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/core/ui/nexa_section_header.dart nexago_app/test/core/ui/nexa_section_header_test.dart
git commit -m "feat(ui): NexaSectionHeader — título de seção unificado"
```

---

### Task 7: NexaCard

**Files:**
- Create: `lib/core/ui/nexa_card.dart`
- Test: `test/core/ui/nexa_card_test.dart`

**Interfaces:**
- Consumes: `AppRadii`, `AppSpacing`, `AppBorders.baseSide`, `context.themeColors`.
- Produces: `NexaCard({required Widget child, VoidCallback? onTap, EdgeInsetsGeometry padding = const EdgeInsets.all(AppSpacing.lg), double radius = AppRadii.lg, Color? color, BorderSide? side, List<BoxShadow>? shadows})`.

- [ ] **Step 1: Escrever o teste que falha**

```dart
// test/core/ui/nexa_card_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/ui/nexa_card.dart';

void main() {
  Widget wrap(Widget child) =>
      MaterialApp(theme: AppTheme.dark, home: Scaffold(body: child));

  testWidgets('renderiza child e dispara onTap', (tester) async {
    var tapped = false;
    await tester.pumpWidget(wrap(NexaCard(
      onTap: () => tapped = true,
      child: const Text('conteúdo'),
    )));
    expect(find.text('conteúdo'), findsOneWidget);
    await tester.tap(find.byType(NexaCard));
    expect(tapped, isTrue);
  });

  testWidgets('sem onTap não tem InkWell', (tester) async {
    await tester.pumpWidget(wrap(const NexaCard(child: Text('x'))));
    expect(find.byType(InkWell), findsNothing);
  });
}
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `flutter test test/core/ui/nexa_card_test.dart`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```dart
// lib/core/ui/nexa_card.dart
import 'package:flutter/material.dart';

import '../theme/app_borders.dart';
import '../theme/app_radii.dart';
import '../theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Superfície de card padrão: fundo `surfaceCard`, borda sutil, raio `lg`,
/// ink de toque quando [onTap] é fornecido. Dark/light-safe.
class NexaCard extends StatelessWidget {
  const NexaCard({
    super.key,
    required this.child,
    this.onTap,
    this.padding = const EdgeInsets.all(AppSpacing.lg),
    this.radius = AppRadii.lg,
    this.color,
    this.side,
    this.shadows,
  });

  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry padding;
  final double radius;
  final Color? color;
  final BorderSide? side;
  final List<BoxShadow>? shadows;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(radius),
      side: side ?? AppBorders.baseSide(colors),
    );

    final Widget content = Padding(padding: padding, child: child);

    final card = Material(
      color: color ?? colors.surfaceCard,
      shape: shape,
      clipBehavior: Clip.antiAlias,
      child: onTap == null
          ? content
          : InkWell(onTap: onTap, child: content),
    );

    final boxShadows = shadows;
    if (boxShadows == null) return card;
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        boxShadow: boxShadows,
      ),
      child: card,
    );
  }
}
```

- [ ] **Step 4: Rodar teste e analyze**

Run: `flutter test test/core/ui/nexa_card_test.dart && flutter analyze lib/core/ui test/core/ui`
Expected: PASS / No issues found.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/core/ui/nexa_card.dart nexago_app/test/core/ui/nexa_card_test.dart
git commit -m "feat(ui): NexaCard — superfície de card padrão dark/light-safe"
```

---

### Task 8: NexaStatusChip e NexaMetaChip

**Files:**
- Create: `lib/core/ui/nexa_chips.dart`
- Test: `test/core/ui/nexa_chips_test.dart`

**Interfaces:**
- Consumes: `AppRadii`, `AppSpacing`, `AppTypography.{labelS,bodyS}`, `context.themeColors`.
- Produces:
  - `NexaStatusChip({required String label, Color? color, bool showDot = true})` — pílula com fundo `color.withValues(alpha: 0.14)`, texto e ponto na cor (`color` default = `colors.brand`).
  - `NexaMetaChip({required IconData icon, required String label})` — ícone 14 + texto muted, fundo `surfaceRaised`, raio `md`.

- [ ] **Step 1: Escrever o teste que falha**

```dart
// test/core/ui/nexa_chips_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/ui/nexa_chips.dart';

void main() {
  Widget wrap(Widget child) =>
      MaterialApp(theme: AppTheme.dark, home: Scaffold(body: child));

  testWidgets('NexaStatusChip mostra label na cor pedida', (tester) async {
    await tester.pumpWidget(wrap(const NexaStatusChip(
      label: 'Inscrições abertas',
      color: AppColors.win,
    )));
    final text = tester.widget<Text>(find.text('Inscrições abertas'));
    expect(text.style?.color, AppColors.win);
  });

  testWidgets('NexaMetaChip mostra ícone e label', (tester) async {
    await tester.pumpWidget(wrap(const NexaMetaChip(
      icon: Icons.calendar_today_rounded,
      label: '24/10',
    )));
    expect(find.byIcon(Icons.calendar_today_rounded), findsOneWidget);
    expect(find.text('24/10'), findsOneWidget);
  });
}
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `flutter test test/core/ui/nexa_chips_test.dart`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```dart
// lib/core/ui/nexa_chips.dart
import 'package:flutter/material.dart';

import '../theme/app_radii.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Pílula de status (ex.: "Inscrições abertas", "Ao vivo", "Encerrado").
class NexaStatusChip extends StatelessWidget {
  const NexaStatusChip({
    super.key,
    required this.label,
    this.color,
    this.showDot = true,
  });

  final String label;
  final Color? color;
  final bool showDot;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final accent = color ?? colors.brand;
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md, vertical: AppSpacing.xs + 2),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.14),
        borderRadius: AppRadii.pillAll,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (showDot) ...[
            Container(
              width: 6,
              height: 6,
              decoration:
                  BoxDecoration(color: accent, shape: BoxShape.circle),
            ),
            const SizedBox(width: AppSpacing.xs + 2),
          ],
          Text(label, style: AppTypography.labelS.copyWith(color: accent)),
        ],
      ),
    );
  }
}

/// Chip de metadado (data, local, vagas) — ícone + texto muted.
class NexaMetaChip extends StatelessWidget {
  const NexaMetaChip({super.key, required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.sm + 2, vertical: AppSpacing.xs + 2),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: AppRadii.mdAll,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: colors.onSurfaceMuted),
          const SizedBox(width: AppSpacing.xs + 2),
          Text(label,
              style:
                  AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted)),
        ],
      ),
    );
  }
}
```

- [ ] **Step 4: Rodar teste e analyze**

Run: `flutter test test/core/ui/nexa_chips_test.dart && flutter analyze lib/core/ui test/core/ui`
Expected: PASS / No issues found.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/core/ui/nexa_chips.dart nexago_app/test/core/ui/nexa_chips_test.dart
git commit -m "feat(ui): NexaStatusChip e NexaMetaChip"
```

---

### Task 9: NexaSegmentedControl

**Files:**
- Create: `lib/core/ui/nexa_segmented_control.dart`
- Test: `test/core/ui/nexa_segmented_control_test.dart`

**Interfaces:**
- Consumes: `AppRadii`, `AppSpacing`, `AppMotion`, `AppTypography.labelL`, `context.themeColors`.
- Produces:

```dart
class NexaSegment<T> { const NexaSegment({required this.value, required this.label}); final T value; final String label; }
NexaSegmentedControl<T>({required List<NexaSegment<T>> segments, required T selected, required ValueChanged<T> onChanged})
```

Visual: trilho `surfaceRaised` raio `AppRadii.xl` com padding interno 4; segmento selecionado `brand` raio `AppRadii.xl - 4` (20) com texto preto; não-selecionado texto `onSurfaceMuted`; transição `AnimatedContainer` `AppMotion.base`.

- [ ] **Step 1: Escrever o teste que falha**

```dart
// test/core/ui/nexa_segmented_control_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/ui/nexa_segmented_control.dart';

void main() {
  Widget wrap(Widget child) =>
      MaterialApp(theme: AppTheme.dark, home: Scaffold(body: child));

  testWidgets('mostra segmentos e troca seleção no tap', (tester) async {
    String selected = 'a';
    await tester.pumpWidget(wrap(StatefulBuilder(
      builder: (context, setState) => NexaSegmentedControl<String>(
        segments: const [
          NexaSegment(value: 'a', label: 'Minha parte'),
          NexaSegment(value: 'b', label: 'Pagar a dupla'),
        ],
        selected: selected,
        onChanged: (v) => setState(() => selected = v),
      ),
    )));
    expect(find.text('Minha parte'), findsOneWidget);
    await tester.tap(find.text('Pagar a dupla'));
    await tester.pumpAndSettle();
    expect(selected, 'b');
  });
}
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `flutter test test/core/ui/nexa_segmented_control_test.dart`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```dart
// lib/core/ui/nexa_segmented_control.dart
import 'package:flutter/material.dart';

import '../theme/app_motion.dart';
import '../theme/app_radii.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

class NexaSegment<T> {
  const NexaSegment({required this.value, required this.label});

  final T value;
  final String label;
}

/// Segmented control padrão NexaGO — substitui as variantes locais de
/// descoberta, ranking e inscrição.
class NexaSegmentedControl<T> extends StatelessWidget {
  const NexaSegmentedControl({
    super.key,
    required this.segments,
    required this.selected,
    required this.onChanged,
  });

  final List<NexaSegment<T>> segments;
  final T selected;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.xs),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: AppRadii.xlAll,
      ),
      child: Row(
        children: [
          for (final segment in segments)
            Expanded(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () {
                  if (segment.value != selected) onChanged(segment.value);
                },
                child: AnimatedContainer(
                  duration: AppMotion.base,
                  curve: AppMotion.curve,
                  padding:
                      const EdgeInsets.symmetric(vertical: AppSpacing.sm + 2),
                  decoration: BoxDecoration(
                    color: segment.value == selected
                        ? colors.brand
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(AppRadii.xl - 4),
                  ),
                  child: Text(
                    segment.label,
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.labelL.copyWith(
                      color: segment.value == selected
                          ? colors.black
                          : colors.onSurfaceMuted,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 4: Rodar teste e analyze**

Run: `flutter test test/core/ui/nexa_segmented_control_test.dart && flutter analyze lib/core/ui test/core/ui`
Expected: PASS / No issues found.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/core/ui/nexa_segmented_control.dart nexago_app/test/core/ui/nexa_segmented_control_test.dart
git commit -m "feat(ui): NexaSegmentedControl — segmented único do design system"
```

---

### Task 10: NexaBottomActionBar e NexaIconSquareButton

**Files:**
- Create: `lib/core/ui/nexa_bottom_action_bar.dart`
- Create: `lib/core/ui/nexa_icon_square_button.dart`
- Test: `test/core/ui/nexa_action_widgets_test.dart`

**Interfaces:**
- Consumes: `AppSpacing`, `AppRadii`, `AppBorders`, `context.themeColors`.
- Produces:
  - `NexaBottomActionBar({Widget? leading, required Widget action, String? hint})` — container `canvas` com borda superior sutil, `SafeArea(top: false)`, padding `fromLTRB(screenH, md, screenH, md)`; `leading` (ex.: coluna de preço) à esquerda com gap `lg`, `action` em `Expanded`; `hint` (texto bodyS muted, centralizado) acima da row quando fornecido.
  - `NexaIconSquareButton({required IconData icon, required VoidCallback onTap, double size = 40, String? tooltip, Color? iconColor})` — quadrado `surfaceRaised`, raio `md`, borda sutil, ícone 20.

- [ ] **Step 1: Escrever o teste que falha**

```dart
// test/core/ui/nexa_action_widgets_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/ui/nexa_bottom_action_bar.dart';
import 'package:nexago_app/core/ui/nexa_icon_square_button.dart';

void main() {
  Widget wrap(Widget child) =>
      MaterialApp(theme: AppTheme.dark, home: Scaffold(body: child));

  testWidgets('NexaBottomActionBar renderiza leading, action e hint',
      (tester) async {
    await tester.pumpWidget(wrap(Column(children: [
      const Spacer(),
      NexaBottomActionBar(
        leading: const Text('R\$ 90,00'),
        hint: 'Pagamento seguro via PIX',
        action: FilledButton(onPressed: () {}, child: const Text('Inscrever')),
      ),
    ])));
    expect(find.text('R\$ 90,00'), findsOneWidget);
    expect(find.text('Inscrever'), findsOneWidget);
    expect(find.text('Pagamento seguro via PIX'), findsOneWidget);
  });

  testWidgets('NexaIconSquareButton tem o tamanho pedido e dispara onTap',
      (tester) async {
    var tapped = false;
    await tester.pumpWidget(wrap(NexaIconSquareButton(
      icon: Icons.close_rounded,
      onTap: () => tapped = true,
    )));
    final size = tester.getSize(find.byType(NexaIconSquareButton));
    expect(size.width, 40);
    expect(size.height, 40);
    await tester.tap(find.byType(NexaIconSquareButton));
    expect(tapped, isTrue);
  });
}
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `flutter test test/core/ui/nexa_action_widgets_test.dart`
Expected: FAIL.

- [ ] **Step 3: Implementar os dois widgets**

```dart
// lib/core/ui/nexa_bottom_action_bar.dart
import 'package:flutter/material.dart';

import '../theme/app_borders.dart';
import '../theme/app_spacing.dart';
import '../theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Barra inferior fixa de ação (preço + CTA) — unifica as barras de
/// detalhe, inscrição e PIX.
class NexaBottomActionBar extends StatelessWidget {
  const NexaBottomActionBar({
    super.key,
    this.leading,
    required this.action,
    this.hint,
  });

  final Widget? leading;
  final Widget action;
  final String? hint;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      decoration: BoxDecoration(
        color: colors.canvas,
        border: Border(top: AppBorders.subtleSide(colors)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenH, AppSpacing.md, AppSpacing.screenH,
              AppSpacing.md),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (hint != null) ...[
                Text(
                  hint!,
                  textAlign: TextAlign.center,
                  style: AppTypography.bodyS
                      .copyWith(color: colors.onSurfaceMuted),
                ),
                const SizedBox(height: AppSpacing.sm),
              ],
              Row(
                children: [
                  if (leading != null) ...[
                    leading!,
                    const SizedBox(width: AppSpacing.lg),
                  ],
                  Expanded(child: action),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
```

```dart
// lib/core/ui/nexa_icon_square_button.dart
import 'package:flutter/material.dart';

import '../theme/app_borders.dart';
import '../theme/app_radii.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Botão quadrado de ícone (voltar, fechar, compartilhar, calendário).
class NexaIconSquareButton extends StatelessWidget {
  const NexaIconSquareButton({
    super.key,
    required this.icon,
    required this.onTap,
    this.size = 40,
    this.tooltip,
    this.iconColor,
  });

  final IconData icon;
  final VoidCallback onTap;
  final double size;
  final String? tooltip;
  final Color? iconColor;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final button = Material(
      color: colors.surfaceRaised,
      shape: RoundedRectangleBorder(
        borderRadius: AppRadii.mdAll,
        side: AppBorders.subtleSide(colors),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: SizedBox(
          width: size,
          height: size,
          child: Icon(icon, size: 20, color: iconColor ?? colors.onSurface),
        ),
      ),
    );
    if (tooltip == null) return button;
    return Tooltip(message: tooltip!, child: button);
  }
}
```

- [ ] **Step 4: Rodar teste e analyze**

Run: `flutter test test/core/ui/nexa_action_widgets_test.dart && flutter analyze lib/core/ui test/core/ui`
Expected: PASS / No issues found.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/core/ui/nexa_bottom_action_bar.dart nexago_app/lib/core/ui/nexa_icon_square_button.dart nexago_app/test/core/ui/nexa_action_widgets_test.dart
git commit -m "feat(ui): NexaBottomActionBar e NexaIconSquareButton"
```

---

# FASE 2 — TELAS

**Regras comuns a TODAS as tasks de tela (repetidas por serem obrigatórias):**
1. Ler o arquivo INTEIRO antes de editar (worktree!).
2. Trocar `SizedBox`/`EdgeInsets`/`BorderRadius.circular` mágicos pelos tokens (`AppSpacing`, `AppRadii`); entre seções usar `AppSpacing.sectionGap`, dentro de seção `AppSpacing.md`/`lg`.
3. Loading: `NexaAsyncView` com `skeleton:` desenhando a silhueta da seção com `NexaSkeleton` (nunca spinner cru). Erro de tela: `onRetry: () => ref.invalidate(<provider>)`. Erro de seção secundária: sem `onRetry` (cai no `AppInlineErrorView`).
4. Vazio: `AppEmptyView` com ícone e mensagem específica (nunca `Text` solto).
5. Cores: qualquer `AppColors.{onSurface,onSurfaceMuted,surfaceCard,surfaceRaised,surfaceSheet,canvas,black,white}` em widget de tela vira `context.themeColors.*`. `AppColors.brand/live/win/pending` cru é aceitável (são iguais nos 2 temas), mas preferir `themeColors`.
6. Título de seção: `NexaSectionHeader`.
7. Não mudar nenhuma string de negócio, rota, provider ou callable.
8. Fechar com: `flutter analyze <paths tocados>` + `flutter test` + commit.

### Task 11: Home do atleta

**Files:**
- Modify: `lib/features/athlete/presentation/athlete_home_page.dart`
- Modify (se necessário, seguindo o padrão dos widgets locais): `lib/features/athlete/presentation/widgets/athlete_home_*.dart`, `lib/features/tournaments/presentation/widgets/my_tournaments_home_section.dart`

**Interfaces:**
- Consumes: `NexaAsyncView`, `NexaSkeleton`, `NexaSectionHeader`, `AppSpacing`, `AppRadii`.

- [ ] **Step 1: Ritmo vertical.** Substituir os 5 `SizedBox(height: 8)` entre seções (linhas ~104-181) por `SizedBox(height: AppSpacing.sectionGap)` entre seções DISTINTAS e `SizedBox(height: AppSpacing.md)` entre header e conteúdo da mesma seção. O padding horizontal repetido 6× (`athleteHomeHorizontalPadding`) permanece funcionando — ele já vale 20; trocar as referências por `AppSpacing.screenH` onde for trivial.
- [ ] **Step 2: Estados.** Trocar o bloco de loading (linhas ~47-51, `CircularProgressIndicator`) por `NexaAsyncView` com skeleton que espelha a home:

```dart
skeleton: Padding(
  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
  child: Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: const [
      SizedBox(height: AppSpacing.lg),
      NexaSkeleton(width: 160, height: 20),
      SizedBox(height: AppSpacing.lg),
      NexaSkeleton(height: 148, radius: AppRadii.lgAll),
      SizedBox(height: AppSpacing.sectionGap),
      NexaSkeleton(width: 200, height: 16),
      SizedBox(height: AppSpacing.md),
      NexaSkeleton(height: 96, radius: AppRadii.lgAll),
    ],
  ),
),
```

e o `_ErrorState` local (linhas ~221-238) por `onRetry: () => ref.invalidate(<provider da home — verificar o nome exato no arquivo>)` — apagar a classe `_ErrorState`.
- [ ] **Step 3: Código morto.** Apagar os blocos comentados (~linhas 132-157, 161-165, 194-204). Antes de apagar, conferir que são comentários `//` e não código ativo. (Memória do projeto: `unused_*` é código estacionado — blocos COMENTADOS podem sair; declarações `unused_` ativas ficam.)
- [ ] **Step 4: Section headers.** Onde a home usa header de seção local (`AthleteHomeSectionHeader`, `MyTournamentsSectionHeader`), fazer o widget local delegar internamente para `NexaSectionHeader` (mantendo a API local para não tocar os call sites de outras telas) OU trocar o call site direto se só a home usa.
- [ ] **Step 5: Verificar e commitar**

Run: `flutter analyze lib/features/athlete/presentation lib/features/tournaments/presentation/widgets && flutter test`
Expected: sem issues novos; suíte verde.

```bash
git add -A nexago_app/lib/features
git commit -m "feat(ui): home do atleta com ritmo de seções, skeleton e retry"
```

---

### Task 12: Competir (hub de descoberta)

**Files:**
- Modify: `lib/features/tournaments/presentation/tournament_discovery_page.dart`
- Modify: `lib/features/tournaments/presentation/widgets/compete_hub_teams_section.dart`
- Modify (leitura + ajuste pontual): `compete_hub_tournaments_section.dart`, `compete_hub_athletes_section.dart`

**Interfaces:**
- Consumes: `NexaSkeleton`, `NexaSectionHeader`, `AppSpacing`.

- [ ] **Step 1: Unificar skeletons.** Em `compete_hub_teams_section.dart:76`, trocar o `CircularProgressIndicator` por uma linha de skeletons na mesma silhueta dos cards da seção (ex.: `Row` de 2 `NexaSkeleton(width: 150, height: 96, radius: AppRadii.lgAll)` com gap `AppSpacing.md`). Nas outras 2 seções, substituir os `_Skeleton` locais por `NexaSkeleton` mantendo as mesmas dimensões (apagar os widgets privados que ficarem órfãos).
- [ ] **Step 2: Ritmo e padding.** Em `tournament_discovery_page.dart`, trocar os `SizedBox(height: 8)` entre seções (linhas ~116-125) por `AppSpacing.sectionGap`; documentar o contrato de padding num comentário curto no topo da lista: pai aplica `AppSpacing.screenH` em seções de largura fixa, carrosséis full-bleed aplicam o próprio padding interno.
- [ ] **Step 3: Código morto.** Apagar blocos comentados (linhas ~110-114, 117-122).
- [ ] **Step 4: Section headers.** `CompeteHubSectionHeader` passa a delegar para `NexaSectionHeader` (mesma técnica da Task 11 Step 4).
- [ ] **Step 5: Verificar e commitar**

Run: `flutter analyze lib/features/tournaments/presentation && flutter test`

```bash
git add -A nexago_app/lib/features/tournaments
git commit -m "feat(ui): hub competir com skeletons unificados e ritmo de seções"
```

---

### Task 13: Lista de torneios — light mode + tokens

**Files:**
- Modify: `lib/features/tournaments/presentation/tournament_discovery_list_page.dart` (945 linhas — ler INTEIRO)

- [ ] **Step 1: Light mode.** Trocar TODOS os ~39 usos crus de `AppColors.onSurface`, `AppColors.onSurfaceMuted`, `AppColors.surfaceRaised`, `AppColors.surfaceCard` por `context.themeColors.*` (linhas mapeadas: 438, 536, 570, 578, 595, 601, 603, 640, 648, 711, 783, 799, 814, 865, 866, 907 e demais — usar busca no arquivo, não confiar só na lista). Onde o widget não tem `BuildContext` à mão, passar `AppThemeColors` por parâmetro.
- [ ] **Step 2: Raios.** Colapsar os raios da tela nos tokens: search field e icon square → `AppRadii.md`; chips → `AppRadii.pillAll`; segmented → substituído na Task 14; cards → `AppRadii.lg`; checkbox → `AppRadii.sm`.
- [ ] **Step 3: Verificar visualmente nos DOIS temas** (a tela é a razão da regra do light): rodar `flutter analyze lib/features/tournaments/presentation && flutter test`, e deixar a conferência visual para a Task 19.
- [ ] **Step 4: Commit**

```bash
git add nexago_app/lib/features/tournaments/presentation/tournament_discovery_list_page.dart
git commit -m "fix(ui): lista de torneios legível no modo claro (themeColors) e raios tokenizados"
```

---

### Task 14: Lista de torneios — componentes e estados

**Files:**
- Modify: `lib/features/tournaments/presentation/tournament_discovery_list_page.dart`
- Create: `lib/features/tournaments/presentation/widgets/discovery_list/` (extrair para cá os 7 componentes públicos: `discovery_list_header.dart`, `discovery_list_stats_row.dart`, `discovery_list_stat_tile.dart`, `discovery_list_filter_chips.dart`, `discovery_list_icon_square.dart` → substituir por `NexaIconSquareButton`, `discovery_list_section_title.dart` → substituir por `NexaSectionHeader`, `discovery_list_segmented.dart` → substituir por `NexaSegmentedControl`)
- Modify: `lib/features/tournaments/presentation/widgets/tournament_discovery_card.dart:380-398`

**Interfaces:**
- Consumes: `NexaAsyncView`, `NexaSkeleton`, `NexaSegmentedControl`, `NexaIconSquareButton`, `NexaSectionHeader`, `AppEmptyView`.

- [ ] **Step 1: Extrair componentes.** Mover `DiscoveryListHeader`, `DiscoveryListStatsRow`, `DiscoveryListStatTile`, `DiscoveryListFilterChips` para arquivos próprios em `widgets/discovery_list/` (mesmo código, imports ajustados). `DiscoveryListStatTile` passa a renderizar sua superfície com `NexaCard` (padding compacto, raio `md`) em vez de `Container` decorado à mão. `DiscoveryListSectionTitle` → usar `NexaSectionHeader`; `DiscoveryListIconSquare` → `NexaIconSquareButton`; `DiscoveryListSegmented` → `NexaSegmentedControl` (manter os mesmos valores/labels de segmento).
- [ ] **Step 2: Estados.** Desfazer o `.when()` aninhado (linhas ~176-202): combinar os 2 providers ANTES da árvore (`final combined = (tournamentsAsync, leaguesAsync)` com um único branch de loading via `NexaAsyncView` sobre o principal e `AppInlineErrorView` para o secundário) — 1 skeleton de lista (3× card skeleton `NexaSkeleton(height: 210, radius: AppRadii.lgAll)` com gaps), erro com `onRetry: () { ref.invalidate(<provider de torneios>); ref.invalidate(<provider de ligas>); }`, vazio com `AppEmptyView(icon: Icons.emoji_events_outlined, title: 'Nenhum torneio encontrado', subtitle: <mensagem já existente da tela>)`. Paginação mantém o indicador pequeno no rodapé (é progresso incremental, não loading de tela).
- [ ] **Step 3: CTA do card.** Em `tournament_discovery_card.dart:380-398`, dar ao container-CTA aparência de botão do sistema: raio `AppRadii.md`→ manter cor `brand`, texto `AppTypography.labelL` preto, e como o card inteiro já é `InkWell`, NÃO adicionar outro gesture — apenas alinhar o visual (raio/altura/texto) ao `FilledButton` do tema.
- [ ] **Step 4: Verificar e commitar**

Run: `flutter analyze lib/features/tournaments/presentation && flutter test`

```bash
git add -A nexago_app/lib/features/tournaments
git commit -m "refactor(ui): lista de torneios — componentes extraídos, estados NexaAsyncView"
```

---

### Task 15: Detalhe do torneio

**Files:**
- Modify: `lib/features/tournaments/presentation/tournament_detail_page.dart`
- Modify: `lib/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_hero.dart`
- Modify: `lib/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_bottom_bar.dart`

**Interfaces:**
- Consumes: `NexaAsyncView`, `NexaSkeleton`, `NexaIconSquareButton`, `NexaBottomActionBar`, `NexaStatusChip`, `AppRadii`, `AppShadows`.

- [ ] **Step 1: Estados.** Loading (linhas ~48-53) → `NexaAsyncView` com skeleton do hero (`NexaSkeleton(height: 220, radius: AppRadii.lgAll)` + 2 cards `NexaSkeleton(height: 84)`); `_ErrorBody` local (linha ~300) → `AppErrorView` com `onRetry: () => ref.invalidate(<provider do torneio>)` (apagar `_ErrorBody`).
- [ ] **Step 2: Raios do hero.** Unificar: badges → `NexaStatusChip` (`AppRadii.pill`); `_PrizeFeeCard` e `_SpotsCard` → `AppRadii.lg`; barra de progresso → `AppRadii.sm`; nota → `AppRadii.md`.
- [ ] **Step 3: Toolbar sobre capa.** Nos ícones da `_TournamentDetailToolbar` (linha ~262): usar `NexaIconSquareButton` com fundo semitransparente escuro quando há capa (`color: Colors.black.withValues(alpha: 0.35)`, `iconColor: Colors.white`) — legível sobre capa clara E escura; sem capa, o default do componente. Adicionar um scrim de gradiente no topo da capa (`Colors.black.withValues(alpha: 0.45)` → transparent, 96px).
- [ ] **Step 4: Bottom bar.** `TournamentDetailBottomBar` passa a construir sobre `NexaBottomActionBar` (leading = preço/infos atuais, action = CTA atual sem re-declarar `backgroundColor`).
- [ ] **Step 5: Verificar e commitar**

Run: `flutter analyze lib/features/tournaments/presentation && flutter test`

```bash
git add -A nexago_app/lib/features/tournaments
git commit -m "feat(ui): detalhe do torneio — hero coerente, toolbar legível, estados com retry"
```

---

### Task 16: Fluxo de inscrição (passos + PIX + sucesso)

**Files:**
- Modify: `lib/features/tournaments/presentation/tournament_registration_page.dart` (2009 linhas — ler INTEIRO antes)
- Modify: `lib/features/tournaments/presentation/tournament_registration_pix_page.dart`
- Modify: `lib/features/tournaments/presentation/tournament_registration_success_page.dart`

**Interfaces:**
- Consumes: `NexaSegmentedControl`, `NexaSectionHeader`, `NexaSkeleton`, `NexaAsyncView`, `NexaIconSquareButton`, `NexaBottomActionBar`, `AppEmptyView`, `AppSpacing`, `AppRadii`.

- [ ] **Step 1 (passos): Segmented.** Trocar o `SegmentedButton<String>` Material (linhas ~1702-1715) por `NexaSegmentedControl<String>` com os MESMOS values/labels ("Minha parte"/"Pagar a dupla" — conferir strings exatas no arquivo).
- [ ] **Step 2 (passos): Títulos.** Títulos de passo inline (ex.: linha ~1640 'Escolha a categoria') → `NexaSectionHeader(title: ..., padding: EdgeInsets.zero)` dentro do padding local existente.
- [ ] **Step 3 (passos): Vazios.** As strings soltas de fallback (linhas ~1412, 1418, 1735, 1749, 1771, 1824, 1828) → `AppEmptyView` compacto ou `Text` com `AppTypography.bodyM` + `themeColors.onSurfaceMuted` centralizado com padding `AppSpacing.xxl` (escolher `AppEmptyView` quando o vazio ocupa a tela; texto estilizado quando é um trecho de card). Loading (linha ~1399) → skeleton do passo atual; erro (linha ~1406) → `AppErrorView` com retry do provider.
- [ ] **Step 4 (passos): Padding.** `ListView` (linha ~1533) passa a usar `padding: EdgeInsets.symmetric(horizontal: AppSpacing.screenH)` e os filhos deixam de reaplicar `horizontal: 20` (remover os `Padding` duplicados das linhas ~1542/1565).
- [ ] **Step 5 (PIX): consistência.** Unificar paddings do container repetido (linhas ~269 e ~293) em `fromLTRB(AppSpacing.screenH, AppSpacing.lg, AppSpacing.screenH, AppSpacing.xxl)`; em `_PixErrorCard` (linha ~395) remover `backgroundColor`/`foregroundColor` re-declarados no `FilledButton` (o tema já define) e raio → `AppRadii.lg`.
- [ ] **Step 6 (sucesso): toolbar e skeleton.** Trocar a AppBar feita à mão (linhas ~175-225) pelo MESMO padrão de AppBar real usado no PIX (conforme o spec): `BookingPixAppBar` se a API servir, senão `AppBar` padrão do tema com `NexaIconSquareButton` como leading — o visual final deve ser idêntico entre PIX e sucesso. Enquanto `receipt/tournament/enrollment` carregam (`.valueOrNull == null`), mostrar skeleton do card de share (`NexaSkeleton(height: 420, radius: AppRadii.xlAll)`) em vez de renderizar `'—'`. `_CalendarIconButton` (54×54 raio 14, linhas ~396-427) → `NexaIconSquareButton(size: 54)` (raio `md` unificado) ao lado do `FilledButton` altura 54; remover `backgroundColor` re-declarado do FilledButton (linha ~262).
- [ ] **Step 7: Verificar e commitar**

Run: `flutter analyze lib/features/tournaments/presentation && flutter test`

```bash
git add -A nexago_app/lib/features/tournaments
git commit -m "feat(ui): fluxo de inscrição consistente — segmented, vazios, skeleton no sucesso"
```

---

### Task 17: Ranking

**Files:**
- Modify: `lib/features/ranking/presentation/athlete_ranking_page.dart`
- Modify: `lib/features/ranking/presentation/widgets/ranking_mode_segment.dart` (delegar para `NexaSegmentedControl`)

**Interfaces:**
- Consumes: `NexaSkeleton`, `NexaSegmentedControl`, `AppShadows`, `AppRadii`, `AppEmptyView`, `AppErrorView`.

- [ ] **Step 1: Skeleton real.** `_RankingLoadingSection` (linha ~387): substituir o spinner de 180px + retângulos estáticos por skeleton na silhueta da tela: pódio (`Row` com 3 `NexaSkeleton.circle(size: 56/72/56)` + linhas) e 4 linhas de lista (`NexaSkeleton(height: 64, radius: AppRadii.lgAll)`).
- [ ] **Step 2: Vazio e erro.** Vazio (linhas ~257-266) → `AppEmptyView(icon: Icons.leaderboard_outlined, title: ..., subtitle: <as 3 mensagens condicionais existentes>)`. Erro (linhas ~175-180) → `AppErrorView` com `onRetry: () => ref.invalidate(<provider do ranking>)`.
- [ ] **Step 3: Sombra e raios.** Card flutuante do usuário: sombra inline (linhas ~292-297) → `AppShadows.floating(context.themeColors)`; raios 14 duplicados (linhas ~291/301) → `AppRadii.lg`. `TextStyle` cru (linhas ~178, 263) → `AppTypography` + `themeColors`.
- [ ] **Step 4: Segmented.** `RankingModeSegment` delega para `NexaSegmentedControl` mantendo API local.
- [ ] **Step 5: Preservar** a regra de negócio de busca (busca preserva rank e esconde pódio — memória do projeto): NÃO tocar na lógica de filtro/busca.
- [ ] **Step 6: Verificar e commitar**

Run: `flutter analyze lib/features/ranking && flutter test`

```bash
git add -A nexago_app/lib/features/ranking
git commit -m "feat(ui): ranking com skeleton fiel, vazio ilustrado e sombra tokenizada"
```

---

### Task 18: Perfil do atleta

**Files:**
- Modify: `lib/features/athlete/presentation/athlete_profile_page.dart`
- Modify: `lib/features/athlete/presentation/widgets/athlete_profile_main_view.dart` (~1700 linhas — ler INTEIRO)

**Interfaces:**
- Consumes: `NexaAsyncView`, `NexaSkeleton`, `NexaSectionHeader`, `AppSpacing`.

- [ ] **Step 1: Estados dedupe.** Em `athlete_profile_page.dart`, os 4 blocos duplicados de erro/loading (linhas ~96-127) viram UM `NexaAsyncView` por provider (skeleton do perfil: `NexaSkeleton.circle(size: 84)` + linhas + grid 2×2 de `NexaSkeleton(height: 72)`; erro com `onRetry` invalidando o provider). Apagar os blocos copiados.
- [ ] **Step 2: Section header.** Em `athlete_profile_main_view.dart`, apagar o `_SectionHeader` privado (linha ~1449) e usar `AthleteProfileSectionHeader` público OU `NexaSectionHeader` em todos os pontos (escolher UM — preferir `NexaSectionHeader` com a API que a tela precisa).
- [ ] **Step 3: Ritmo.** Normalizar os `SizedBox(height: 14/16/20/10/8)` (linhas ~167-227): entre seções `AppSpacing.sectionGap`, dentro de seção `AppSpacing.md` ou `AppSpacing.lg` — decidir pelo agrupamento visual, não mecanicamente.
- [ ] **Step 4: Verificar e commitar**

Run: `flutter analyze lib/features/athlete/presentation && flutter test`

```bash
git add -A nexago_app/lib/features/athlete
git commit -m "feat(ui): perfil do atleta — estados únicos, headers e ritmo tokenizados"
```

---

### Task 19: Bug de tema na home de quadras + QA final

**Files:**
- Modify: `lib/features/home/home_page.dart:138`
- QA: simulador iOS

- [ ] **Step 1: Fix pontual.** `home_page.dart:138`: `color: AppColors.black` → `color: context.themeColors.onSurface`.
- [ ] **Step 2: Suíte completa + analyze final.**

Run: `flutter analyze lib/core lib/features/athlete lib/features/tournaments lib/features/ranking lib/features/home && flutter test`
Expected: 0 issues novos, suíte verde (208+ testes).

- [ ] **Step 3: QA visual no simulador iOS.** Build + launch no simulador (attach do painel primeiro). Navegar e capturar screenshot de cada tela polida em DARK: home, competir, lista de torneios, detalhe, inscrição (passo categoria), ranking, perfil. Trocar para LIGHT (Configurações do app → tema, ou `resolvedThemeModeProvider`) e capturar: lista de torneios (a tela do fix) + home + ranking. Conferir: nenhum texto invisível, nenhum overflow, skeletons aparecem antes do conteúdo.
- [ ] **Step 4: Commit final**

```bash
git add nexago_app/lib/features/home/home_page.dart
git commit -m "fix(ui): título da home de quadras legível no dark mode"
```

- [ ] **Step 5: Registrar débitos que ficaram de fora** (não implementar): consolidação das 3 telas de sucesso; `NexaSearchField`/`NexaStatTile` se não tiverem sido extraídos naturalmente; sheets do shell. Anotar no PR.

---

## Ordem de execução e dependências

```
Task 1 ──► Task 2 ──► Task 3   (tokens; 3 depende de 1 apenas conceitualmente)
Task 1..3 ──► Task 4..10       (componentes; 5 depende de 4; 10 depende de 2)
Task 4..10 ──► Task 11..18     (telas, em ordem de numeração)
Task 19 por último (QA final)
```

Tasks 6–10 são independentes entre si (podem ser paralelizadas por subagentes APÓS a 4 e a 5). Tasks de tela são sequenciais (todas mexem em `features/tournaments` — evitar conflito).

## Verificação de aceitação (mapeia o spec)

- [ ] Tokens: `AppSpacing/AppRadii/AppBorders/AppShadows/AppMotion` + escala tipográfica existem e têm teste (Tasks 1-3)
- [ ] `ArenaDashboardTokens` delega sem mudar valor (Task 1)
- [ ] 7 componentes `core/ui` novos com widget tests (Tasks 4-10)
- [ ] 8 telas da jornada sem spinner cru, sem `Text` de erro sem retry, sem string solta de vazio (Tasks 11-18)
- [ ] Lista de torneios legível no light (Task 13) e bug `home_page.dart:138` corrigido (Task 19)
- [ ] 3 segmented → 1; CTA do card alinhado ao design system (Tasks 14, 16, 17)
- [ ] Zero mudança de rota/fluxo/regra; suíte verde; screenshots dark+light capturados (Task 19)
