import 'dart:math' as math;
import 'dart:ui' show ImageFilter;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../home_banners/presentation/home_banner_navigation.dart';
import '../../domain/app_news.dart';

/// Peças comuns da lista, do detalhe e dos stories de Novidades (Home v4:
/// fundo escuro, laranja, Sora).

const appNewsOnBrand = Color(0xFF0A0A0A);

IconData appNewsIcon(AppNewsFeature feature) => switch (feature.icon) {
  AppNewsIcon.map => Icons.map_outlined,
  AppNewsIcon.invite => Icons.person_add_alt_1_outlined,
  AppNewsIcon.cancel => Icons.event_busy_outlined,
  AppNewsIcon.story => Icons.photo_camera_outlined,
  AppNewsIcon.handshake => Icons.handshake_outlined,
  AppNewsIcon.focus => Icons.center_focus_strong_outlined,
  AppNewsIcon.chat => Icons.chat_bubble_outline_rounded,
  AppNewsIcon.star => Icons.star_outline_rounded,
  AppNewsIcon.rain => Icons.umbrella_outlined,
  null =>
    feature.destination == null
        ? Icons.auto_awesome_outlined
        : homeBannerIcon(feature.destination!),
};

TextStyle appNewsKickerStyle(Color color) => AppTypography.mono(
  fontSize: 10,
  fontWeight: FontWeight.w700,
  letterSpacing: 1.4,
  color: color,
);

/// Rótulo em caixa alta, mono (ex.: "VERSÃO 1.0.15 · 27 OUT 2026").
class AppNewsKicker extends StatelessWidget {
  const AppNewsKicker(this.text, {super.key, this.color});

  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) => Text(
    text.toUpperCase(),
    style: appNewsKickerStyle(color ?? context.themeColors.onSurfaceMuted),
  );
}

/// Selo "NOVO" / "JÁ USOU" / "3 NOVAS".
class AppNewsBadge extends StatelessWidget {
  const AppNewsBadge(this.label, {super.key});

  final String label;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
    decoration: BoxDecoration(
      color: AppColors.brand.withValues(alpha: 0.14),
      borderRadius: AppRadii.pillAll,
    ),
    child: Text(
      label,
      maxLines: 1,
      style: AppTypography.soraRegular(
        fontSize: 10.5,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.42,
        color: context.themeColors.brandText,
      ),
    ),
  );
}

/// Botão laranja com seta: abre a funcionalidade.
class AppNewsPrimaryButton extends StatelessWidget {
  const AppNewsPrimaryButton({
    super.key,
    required this.label,
    required this.onTap,
  });

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    const radius = BorderRadius.all(Radius.circular(16));
    return Material(
      color: AppColors.brand,
      borderRadius: radius,
      child: InkWell(
        onTap: onTap,
        borderRadius: radius,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 52),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.soraRegular(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: appNewsOnBrand,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                const Icon(
                  Icons.arrow_forward_rounded,
                  size: 17,
                  color: appNewsOnBrand,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Botão de contorno ("Como funciona", "Próxima").
class AppNewsOutlinedButton extends StatelessWidget {
  const AppNewsOutlinedButton({
    super.key,
    required this.label,
    required this.onTap,
  });

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    const radius = BorderRadius.all(Radius.circular(16));
    return Material(
      color: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: radius,
        side: BorderSide(color: colors.onSurface.withValues(alpha: 0.14)),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: radius,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 52),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
            child: Center(
              widthFactor: 1,
              heightFactor: 1,
              child: Text(
                label,
                maxLines: 1,
                style: AppTypography.soraRegular(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: colors.onSurface,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Botão redondo translúcido sobre a imagem (voltar, fechar).
class AppNewsGlassButton extends StatelessWidget {
  const AppNewsGlassButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    const radius = BorderRadius.all(Radius.circular(14));
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: ClipRRect(
        borderRadius: radius,
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
          child: Material(
            color: AppColors.canvas.withValues(alpha: 0.55),
            child: InkWell(
              onTap: onTap,
              child: SizedBox(
                width: 42,
                height: 42,
                child: Icon(icon, size: 20, color: AppColors.onSurface),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Imagem da funcionalidade. Sem captura (ou enquanto carrega): listras da
/// marca com o ícone, o espaço reservado do design.
class AppNewsArt extends StatelessWidget {
  const AppNewsArt({
    super.key,
    required this.feature,
    required this.height,
    this.radius = 26,
    this.bordered = true,
  });

  final AppNewsFeature feature;
  final double height;
  final double radius;

  /// Borda laranja fina do espaço reservado (o detalhe usa só a de baixo).
  final bool bordered;

  @override
  Widget build(BuildContext context) {
    final borderRadius = BorderRadius.circular(radius);
    final placeholder = _Placeholder(
      icon: appNewsIcon(feature),
      borderRadius: borderRadius,
      bordered: bordered,
    );
    final imageUrl = feature.imageUrl;
    return SizedBox(
      height: height,
      width: double.infinity,
      child: ClipRRect(
        borderRadius: borderRadius,
        child: imageUrl == null
            ? placeholder
            : CachedNetworkImage(
                imageUrl: imageUrl,
                fit: BoxFit.cover,
                placeholder: (_, _) => placeholder,
                errorWidget: (_, _, _) => placeholder,
              ),
      ),
    );
  }
}

class _Placeholder extends StatelessWidget {
  const _Placeholder({
    required this.icon,
    required this.borderRadius,
    required this.bordered,
  });

  final IconData icon;
  final BorderRadius borderRadius;
  final bool bordered;

  @override
  Widget build(BuildContext context) {
    final side = BorderSide(color: AppColors.brand.withValues(alpha: 0.18));
    return DecoratedBox(
      position: DecorationPosition.foreground,
      decoration: BoxDecoration(
        borderRadius: bordered ? borderRadius : null,
        border: bordered ? Border.fromBorderSide(side) : Border(bottom: side),
      ),
      child: CustomPaint(
        painter: const _StripesPainter(),
        child: Center(
          child: Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: AppColors.brand.withValues(alpha: 0.14),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 34, color: context.themeColors.brandText),
          ),
        ),
      ),
    );
  }
}

/// Listras a 135°: 8 px forte, 8 px fraca.
class _StripesPainter extends CustomPainter {
  const _StripesPainter();

  static const _period = 16.0;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    canvas.drawRect(
      rect,
      Paint()..color = AppColors.brand.withValues(alpha: 0.03),
    );
    canvas.save();
    canvas.clipRect(rect);
    final stripe = Paint()
      ..color = AppColors.brand.withValues(alpha: 0.10)
      ..strokeWidth = _period / 2;
    // Período medido na perpendicular: na horizontal ele vale ×√2.
    final step = _period * math.sqrt2;
    for (var x = -size.height; x < size.width + step; x += step) {
      canvas.drawLine(
        Offset(x, size.height),
        Offset(x + size.height, 0),
        stripe,
      );
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(_StripesPainter oldDelegate) => false;
}

/// Uma funcionalidade em lista: ícone, título (com "Já usou" quando [used]),
/// resumo e chevron. Usada nas Novidades e na Central de ajuda.
class AppNewsFeatureRow extends StatelessWidget {
  const AppNewsFeatureRow({
    super.key,
    required this.feature,
    this.used = false,
    required this.onTap,
  });

  final AppNewsFeature feature;
  final bool used;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    const radius = BorderRadius.all(Radius.circular(22));
    return Material(
      color: colors.surfaceRaised,
      borderRadius: radius,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        key: Key('feature-row-${feature.id}'),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: used
                      ? colors.onSurface.withValues(alpha: 0.045)
                      : AppColors.brand.withValues(alpha: 0.14),
                  borderRadius: const BorderRadius.all(Radius.circular(15)),
                ),
                child: Icon(
                  appNewsIcon(feature),
                  size: 22,
                  color: used ? colors.onSurfaceMuted : colors.brandText,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 8,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(
                          feature.title,
                          style: AppTypography.soraRegular(
                            fontSize: 15.5,
                            fontWeight: FontWeight.w700,
                            letterSpacing: -0.23,
                            color: colors.onSurface,
                          ),
                        ),
                        if (used)
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.check_rounded,
                                size: 13,
                                color: colors.onSurfaceMuted,
                              ),
                              const SizedBox(width: 3),
                              Text(
                                'Já usou',
                                style: AppTypography.soraRegular(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: colors.onSurfaceMuted,
                                ),
                              ),
                            ],
                          ),
                      ],
                    ),
                    if (feature.summary.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        feature.summary,
                        style: AppTypography.soraRegular(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w400,
                          height: 1.4,
                          color: colors.onSurfaceMuted,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(
                Icons.chevron_right_rounded,
                size: 20,
                color: colors.onSurface.withValues(alpha: 0.32),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
