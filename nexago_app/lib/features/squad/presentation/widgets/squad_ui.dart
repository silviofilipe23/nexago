import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/layout/nexa_page_header.dart';
import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/squad_models.dart';
import '../../domain/squad_rules.dart';

/// Tons do desenho do Squad derivados do tema (claro e escuro): secundário
/// 62%, terciário 40%, superfície suave 6%, linha 8%.
abstract final class SquadStyle {
  SquadStyle._();

  /// Texto/ícone sobre o laranja da marca.
  static const Color onBrand = Color(0xFF0A0A0A);

  static Color mute(AppThemeColors c) => c.onSurface.withValues(alpha: 0.62);
  static Color dim(AppThemeColors c) => c.onSurface.withValues(alpha: 0.40);
  static Color soft(AppThemeColors c) => c.onSurface.withValues(alpha: 0.06);
  static Color line(AppThemeColors c) => c.onSurface.withValues(alpha: 0.08);
  static Color line2(AppThemeColors c) => c.onSurface.withValues(alpha: 0.12);
  static Color tint() => AppColors.brand.withValues(alpha: 0.12);

  static Color tierColor(SquadTier t, AppThemeColors c) => switch (t) {
    SquadTier.ath => c.onSurface.withValues(alpha: 0.62),
    SquadTier.amb => AppColors.brandHover,
    SquadTier.pro => AppColors.brand,
    SquadTier.cap => AppColors.pending,
  };

  static Color toneColor(SquadStatusTone tone, AppThemeColors c) =>
      switch (tone) {
        SquadStatusTone.pending => AppColors.pending,
        SquadStatusTone.win => AppColors.win,
        SquadStatusTone.muted => c.onSurface.withValues(alpha: 0.55),
        SquadStatusTone.danger => AppColors.live,
      };

  static TextStyle display(double size, {Color? color, FontWeight? weight}) =>
      AppTypography.soraRegular(
        fontSize: size,
        fontWeight: weight ?? FontWeight.w800,
        letterSpacing: -size * 0.03,
        height: 1.1,
        color: color,
      );

  static TextStyle mono(double size, {Color? color, FontWeight? weight}) =>
      AppTypography.mono(
        fontSize: size,
        fontWeight: weight ?? FontWeight.w700,
        color: color,
      );
}

/// Tela interna do Squad: header fixo (voltar + título) e o corpo rolável.
/// Sem tab bar — as rotas do Squad ficam fora do shell.
class SquadScaffold extends StatelessWidget {
  const SquadScaffold({
    super.key,
    required this.title,
    required this.body,
    this.subtitle,
    this.trailing,
    this.bottomBar,
  });

  final String title;
  final String? subtitle;
  final Widget? trailing;
  final Widget body;
  final Widget? bottomBar;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Scaffold(
      backgroundColor: colors.canvas,
      body: NexaPageHeader(
        topGap: 10,
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
        header: Row(
          children: [
            SquadRoundButton(
              icon: Icons.arrow_back_rounded,
              semanticLabel: 'Voltar',
              onTap: () => squadBack(context),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: SquadStyle.display(24, color: colors.onSurface),
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      subtitle!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 12.5,
                        color: SquadStyle.dim(colors),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (trailing != null) ...[const SizedBox(width: 12), trailing!],
          ],
        ),
        child: bottomBar == null
            ? body
            : Stack(
                children: [
                  Positioned.fill(child: body),
                  Positioned(left: 0, right: 0, bottom: 0, child: bottomBar!),
                ],
              ),
      ),
    );
  }
}

/// Voltar das telas do Squad. Aberta por push (`router.go`, sem pilha), a
/// tela não tem para onde voltar: cai na home.
void squadBack(BuildContext context) {
  if (GoRouter.maybeOf(context) == null) {
    Navigator.of(context).maybePop();
    return;
  }
  popOrGo(context, AppRoutes.home);
}

/// Botão redondo de 44px (voltar, fechar, copiar).
class SquadRoundButton extends StatelessWidget {
  const SquadRoundButton({
    super.key,
    required this.icon,
    required this.onTap,
    required this.semanticLabel,
    this.size = 44,
    this.filled = false,
    this.background,
  });

  final IconData icon;
  final VoidCallback? onTap;
  final String semanticLabel;
  final double size;
  final bool filled;
  final Color? background;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final bg =
        background ?? (filled ? AppColors.brand : SquadStyle.soft(colors));
    return Semantics(
      button: true,
      label: semanticLabel,
      child: Material(
        color: bg,
        shape: const CircleBorder(),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: SizedBox.square(
            dimension: size,
            child: Icon(
              icon,
              size: size * 0.42,
              color: filled ? SquadStyle.onBrand : colors.onSurface,
            ),
          ),
        ),
      ),
    );
  }
}

/// Faixa de ações fixa no rodapé, com o degradê do desenho.
class SquadBottomBar extends StatelessWidget {
  const SquadBottomBar({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final canvas = context.themeColors.canvas;
    final bottom = MediaQuery.paddingOf(context).bottom;
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [canvas.withValues(alpha: 0), canvas],
          stops: const [0, 0.26],
        ),
      ),
      child: Padding(
        padding: EdgeInsets.fromLTRB(20, 16, 20, bottom > 0 ? bottom : 20),
        child: Row(children: children),
      ),
    );
  }
}

/// Botão principal laranja (58px) do rodapé.
class SquadPrimaryButton extends StatelessWidget {
  const SquadPrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.loading = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 58,
      child: FilledButton(
        onPressed: loading ? null : onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.brand,
          foregroundColor: SquadStyle.onBrand,
          // Opaco: o botão fica sobre a lista e o conteúdo não pode vazar.
          disabledBackgroundColor: Color.alphaBlend(
            AppColors.brand.withValues(alpha: 0.4),
            context.themeColors.canvas,
          ),
          disabledForegroundColor: SquadStyle.onBrand.withValues(alpha: 0.7),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
          textStyle: AppTypography.labelL.copyWith(fontSize: 15),
        ),
        child: loading
            ? const SizedBox.square(
                dimension: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2.4,
                  color: SquadStyle.onBrand,
                ),
              )
            : Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (icon != null) ...[
                    Icon(icon, size: 18),
                    const SizedBox(width: 8),
                  ],
                  Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
                ],
              ),
      ),
    );
  }
}

/// Card do desenho: raio 22, borda fina; [hot] = borda laranja.
class SquadCard extends StatelessWidget {
  const SquadCard({
    super.key,
    required this.child,
    this.hot = false,
    this.padding = const EdgeInsets.all(18),
  });

  final Widget child;
  final bool hot;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(
          color: hot
              ? AppColors.brand.withValues(alpha: 0.25)
              : SquadStyle.line(colors),
        ),
      ),
      child: child,
    );
  }
}

/// Rótulo em caixa alta (mono, 10px).
class SquadLabel extends StatelessWidget {
  const SquadLabel(this.text, {super.key, this.color});

  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: AppTypography.eyebrow.copyWith(
        color: color ?? SquadStyle.dim(context.themeColors),
      ),
    );
  }
}

/// Título de seção com ação opcional à direita ("Ver tudo").
class SquadSection extends StatelessWidget {
  const SquadSection(this.title, {super.key, this.action, this.onAction});

  final String title;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.only(top: 24, bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Text(
              title,
              style: SquadStyle.display(
                17,
                color: colors.onSurface,
                weight: FontWeight.w700,
              ),
            ),
          ),
          if (action != null)
            GestureDetector(
              onTap: onAction,
              behavior: HitTestBehavior.opaque,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Text(
                  action!,
                  style: AppTypography.labelL.copyWith(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.brand,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Selo do nível ("AMBASSADOR"): contorno com ponto colorido ou cheio.
class SquadTierBadge extends StatelessWidget {
  const SquadTierBadge(
    this.tier, {
    super.key,
    this.small = false,
    this.solid = false,
  });

  final SquadTier tier;
  final bool small;
  final bool solid;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final c = SquadStyle.tierColor(tier, colors);
    return Container(
      height: small ? 20 : 24,
      padding: EdgeInsets.symmetric(horizontal: small ? 8 : 10),
      decoration: BoxDecoration(
        color: solid ? c : colors.onSurface.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(99),
        border: Border.all(
          color: solid ? c : colors.onSurface.withValues(alpha: 0.10),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (!solid) ...[
            Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(color: c, shape: BoxShape.circle),
            ),
            const SizedBox(width: 6),
          ],
          Text(
            tier.label.toUpperCase(),
            style: SquadStyle.mono(
              small ? 9 : 10,
              color: solid ? SquadStyle.onBrand : colors.onSurface,
            ).copyWith(letterSpacing: 0.8),
          ),
        ],
      ),
    );
  }
}

/// Avatar com foto ou iniciais sobre um tom derivado de [hue].
class SquadAvatar extends StatelessWidget {
  const SquadAvatar({
    super.key,
    required this.name,
    this.photoUrl,
    this.size = 36,
    this.hue = 20,
    this.ring = false,
  });

  final String name;
  final String? photoUrl;
  final double size;
  final double hue;
  final bool ring;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final bg = HSLColor.fromAHSL(1, hue % 360, 0.22, 0.26).toColor();
    final initials = Center(
      child: Text(
        squadInitials(name),
        style: SquadStyle.display(
          size * 0.36,
          color: Colors.white,
          weight: FontWeight.w700,
        ),
      ),
    );
    final url = photoUrl;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: bg,
        shape: BoxShape.circle,
        border: Border.all(
          color: ring ? AppColors.brand : SquadStyle.line2(colors),
          width: ring ? 2 : 1,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: url == null || url.isEmpty
          ? initials
          : CachedNetworkImage(
              imageUrl: url,
              fit: BoxFit.cover,
              placeholder: (_, __) => initials,
              errorWidget: (_, __, ___) => initials,
            ),
    );
  }
}

/// Tom estável por nome, para avatares sem foto não mudarem de cor.
double squadHueFor(String name) {
  var h = 0;
  for (final unit in name.codeUnits) {
    h = (h * 31 + unit) & 0x7fffffff;
  }
  return (h % 360).toDouble();
}

/// Barra de progresso arredondada.
class SquadProgressBar extends StatelessWidget {
  const SquadProgressBar({super.key, required this.fraction, this.height = 6});

  final double fraction;
  final double height;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(99),
      child: SizedBox(
        height: height,
        child: Stack(
          children: [
            Positioned.fill(
              child: ColoredBox(
                color: context.themeColors.onSurface.withValues(alpha: 0.07),
              ),
            ),
            FractionallySizedBox(
              widthFactor: fraction.clamp(0, 1),
              heightFactor: 1,
              child: const DecoratedBox(
                decoration: BoxDecoration(
                  color: AppColors.brand,
                  borderRadius: BorderRadius.all(Radius.circular(99)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Quadrado de 38px com ícone (lista de benefícios, extrato).
class SquadIconTile extends StatelessWidget {
  const SquadIconTile(this.icon, {super.key, this.accent = true});

  final IconData icon;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      width: 38,
      height: 38,
      decoration: BoxDecoration(
        color: accent ? SquadStyle.tint() : SquadStyle.soft(colors),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Icon(
        icon,
        size: 17,
        color: accent ? AppColors.brand : SquadStyle.mute(colors),
      ),
    );
  }
}

IconData squadBenefitIcon(SquadBenefitKind kind) => switch (kind) {
  SquadBenefitKind.commission => Icons.trending_up_rounded,
  SquadBenefitKind.registrations => Icons.sell_outlined,
  SquadBenefitKind.kit => Icons.shopping_bag_outlined,
  SquadBenefitKind.events => Icons.event_outlined,
  SquadBenefitKind.partner => Icons.group_outlined,
  SquadBenefitKind.campaign => Icons.campaign_outlined,
  SquadBenefitKind.bonus => Icons.emoji_events_outlined,
};

/// Nota cinza de rodapé (regras, #publi).
class SquadNote extends StatelessWidget {
  const SquadNote({super.key, required this.child, this.icon});

  final Widget child;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: SquadStyle.soft(colors),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 16, color: SquadStyle.mute(colors)),
            const SizedBox(width: 10),
          ],
          Expanded(
            child: DefaultTextStyle.merge(
              style: AppTypography.bodyS.copyWith(
                color: SquadStyle.dim(colors),
                height: 1.5,
              ),
              child: child,
            ),
          ),
        ],
      ),
    );
  }
}

/// Estado vazio/erro centralizado das telas do Squad.
class SquadMessage extends StatelessWidget {
  const SquadMessage({
    super.key,
    required this.title,
    required this.message,
    this.actionLabel,
    this.onAction,
    this.icon = Icons.groups_outlined,
  });

  final String title;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: SquadStyle.tint(),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: AppColors.brand, size: 28),
            ),
            const SizedBox(height: 16),
            Text(
              title,
              textAlign: TextAlign.center,
              style: SquadStyle.display(
                19,
                color: colors.onSurface,
                weight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: AppTypography.bodyM.copyWith(
                color: SquadStyle.mute(colors),
              ),
            ),
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: 18),
              OutlinedButton(onPressed: onAction, child: Text(actionLabel!)),
            ],
          ],
        ),
      ),
    );
  }
}

/// "nexaGO SQUAD" — a assinatura dos cards e do convite.
class SquadWordmark extends StatelessWidget {
  const SquadWordmark({super.key, this.size = 13, this.color});

  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final fg = color ?? context.themeColors.onSurface;
    return Text.rich(
      TextSpan(
        text: 'nexa',
        children: [
          const TextSpan(
            text: 'GO',
            style: TextStyle(color: AppColors.brand),
          ),
          TextSpan(
            text: '  SQUAD',
            style: SquadStyle.mono(
              size * 0.65,
              color: fg.withValues(alpha: 0.62),
            ).copyWith(letterSpacing: size * 0.1),
          ),
        ],
      ),
      style: SquadStyle.display(size, color: fg),
    );
  }
}

/// Código digitado: maiúsculo, sem acento e só A–Z/0–9 ("joão 10" → "JOAO10").
///
/// Normaliza ANTES de filtrar — um filtro `[A-Za-z0-9]` na frente apagava a
/// letra acentuada ("joão10" virava "JOO10").
class SquadCodeInputFormatter extends TextInputFormatter {
  const SquadCodeInputFormatter({required this.maxLength});

  final int maxLength;

  static final RegExp _invalid = RegExp('[^A-Z0-9]');

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    var text = normalizeSquadCode(newValue.text).replaceAll(_invalid, '');
    if (text.length > maxLength) text = text.substring(0, maxLength);
    if (text == newValue.text) return newValue;
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}
