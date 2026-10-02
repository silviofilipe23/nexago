import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';

/// URL → imagem com cache; vazio → `null` (cai no fallback).
ImageProvider? organizerNetworkImage(String? url) {
  final value = url?.trim() ?? '';
  if (value.isEmpty) return null;
  return CachedNetworkImageProvider(value);
}

/// Cabeçalho do perfil: capa (ou gradiente), logo quadrado (ou iniciais), nome, selo, local e
/// "Organizador desde". Recebe valores soltos para servir também à prévia do editor, que mostra
/// imagens ainda não enviadas.
class OrganizerProfileHero extends StatelessWidget {
  const OrganizerProfileHero({
    super.key,
    required this.name,
    required this.initials,
    this.verified = false,
    this.locationLine,
    this.sinceLabel,
    this.logo,
    this.cover,
  });

  /// Capa larga: no telefone, 3:1 (o painel web recorta 4:1, então quase nada se perde).
  static const double coverAspectRatio = 3;
  static const double logoSize = 84;

  /// Quanto o logo sobe sobre a capa.
  static const double logoOverlap = 40;

  final String name;
  final String initials;
  final bool verified;
  final String? locationLine;
  final String? sinceLabel;
  final ImageProvider? logo;
  final ImageProvider? cover;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final metaParts = [
      if (locationLine != null) locationLine!,
      if (sinceLabel != null) sinceLabel!,
    ];

    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth.isFinite
            ? constraints.maxWidth
            : MediaQuery.sizeOf(context).width;
        final coverHeight = width / coverAspectRatio;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              height: coverHeight + logoSize - logoOverlap,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  Positioned(
                    left: 0,
                    right: 0,
                    top: 0,
                    height: coverHeight,
                    child: _Cover(image: cover),
                  ),
                  Positioned(
                    left: 20,
                    top: coverHeight - logoOverlap,
                    child: _Logo(image: logo, initials: initials),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.soraRegular(
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                            color: colors.onSurface,
                            height: 1.15,
                          ),
                        ),
                      ),
                      if (verified) ...[
                        const SizedBox(width: 6),
                        const Tooltip(
                          message: 'Organizador verificado',
                          child: Icon(
                            Icons.verified_rounded,
                            size: 20,
                            color: AppColors.brand,
                            semanticLabel: 'Organizador verificado',
                          ),
                        ),
                      ],
                    ],
                  ),
                  if (metaParts.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (locationLine != null) ...[
                          Padding(
                            padding: const EdgeInsets.only(top: 1),
                            child: Icon(
                              Icons.place_outlined,
                              size: 15,
                              color: colors.onSurfaceMuted,
                            ),
                          ),
                          const SizedBox(width: 4),
                        ],
                        Expanded(
                          child: Text(
                            metaParts.join('  ·  '),
                            style: AppTypography.soraRegular(
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                              color: colors.onSurfaceMuted,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

class _Cover extends StatelessWidget {
  const _Cover({required this.image});

  final ImageProvider? image;

  @override
  Widget build(BuildContext context) {
    final fallback = _CoverFallback(colors: context.themeColors);
    final provider = image;
    if (provider == null) return fallback;
    return Image(
      image: provider,
      fit: BoxFit.cover,
      errorBuilder: (context, error, stackTrace) => fallback,
    );
  }
}

/// Sem capa: gradiente da marca sobre o canvas, com listras discretas (o "1600×400" do mock).
class _CoverFallback extends StatelessWidget {
  const _CoverFallback({required this.colors});

  final AppThemeColors colors;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppColors.brand.withValues(alpha: 0.55),
            colors.surfaceRaised,
            colors.canvas,
          ],
          stops: const [0, 0.6, 1],
        ),
      ),
      child: CustomPaint(
        painter: _StripesPainter(
          color: colors.onSurface.withValues(alpha: 0.04),
        ),
      ),
    );
  }
}

class _StripesPainter extends CustomPainter {
  const _StripesPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 10;
    for (var x = -size.height; x < size.width; x += 28) {
      canvas.drawLine(
        Offset(x, size.height),
        Offset(x + size.height, 0),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _StripesPainter oldDelegate) =>
      oldDelegate.color != color;
}

class _Logo extends StatelessWidget {
  const _Logo({required this.image, required this.initials});

  final ImageProvider? image;
  final String initials;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final initialsTile = ColoredBox(
      color: AppColors.brand,
      child: Center(
        child: Text(
          initials,
          style: AppTypography.soraRegular(
            fontSize: 26,
            fontWeight: FontWeight.w900,
            color: AppColors.black,
            letterSpacing: -0.5,
          ),
        ),
      ),
    );
    final provider = image;

    return Container(
      width: OrganizerProfileHero.logoSize,
      height: OrganizerProfileHero.logoSize,
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: colors.canvas,
        borderRadius: BorderRadius.circular(22),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(19),
        child: provider == null
            ? initialsTile
            : Image(
                image: provider,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) => initialsTile,
              ),
      ),
    );
  }
}
