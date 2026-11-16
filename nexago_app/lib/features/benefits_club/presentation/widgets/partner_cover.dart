import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../domain/partner.dart';
import 'partner_visuals.dart';

/// Tag do `Hero` da logo entre a lista e a tela do parceiro.
String partnerLogoHeroTag(String partnerId) => 'benefits-logo-$partnerId';

/// Foto de capa do parceiro (`coverUrl`) ou, sem foto, um degradê na cor da
/// marca. [muted] = parceiro bloqueado (cinza).
class PartnerCover extends StatelessWidget {
  const PartnerCover({
    super.key,
    required this.partner,
    this.muted = false,
    this.cacheWidth,
  });

  final Partner partner;
  final bool muted;

  /// Largura em px para decodificar (a lista não precisa da foto inteira).
  final int? cacheWidth;

  @override
  Widget build(BuildContext context) {
    final fallback = _CoverFallback(partner: partner, muted: muted);
    final url = partner.coverUrl;
    if (url == null) return fallback;
    final image = CachedNetworkImage(
      imageUrl: url,
      fit: BoxFit.cover,
      memCacheWidth: cacheWidth,
      placeholder: (_, __) => fallback,
      errorWidget: (_, __, ___) => fallback,
    );
    if (!muted) return image;
    return ColorFiltered(
      colorFilter: const ColorFilter.matrix(_grayscale),
      child: image,
    );
  }
}

const List<double> _grayscale = [
  0.2126, 0.7152, 0.0722, 0, 0, //
  0.2126, 0.7152, 0.0722, 0, 0, //
  0.2126, 0.7152, 0.0722, 0, 0, //
  0, 0, 0, 1, 0,
];

class _CoverFallback extends StatelessWidget {
  const _CoverFallback({required this.partner, required this.muted});

  final Partner partner;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final base = muted ? colors.surfaceRaised : partnerBrandColor(partner);
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color.alphaBlend(base.withValues(alpha: 0.55), colors.surfaceCard),
            Color.alphaBlend(base.withValues(alpha: 0.18), colors.surfaceCard),
          ],
        ),
      ),
    );
  }
}

/// Selo pequeno por cima da capa ("Novo", "Termina em 3 dias", "Destaque").
enum CoverTagTone { brand, warning }

class CoverTag extends StatelessWidget {
  const CoverTag({
    super.key,
    required this.label,
    this.tone = CoverTagTone.brand,
    this.icon,
    this.height = 24,
  });

  final String label;
  final CoverTagTone tone;
  final IconData? icon;
  final double height;

  @override
  Widget build(BuildContext context) {
    // Fica sempre por cima da foto (fundo escuro): o âmbar não muda de tema.
    const warning = AppColors.pending;
    final isBrand = tone == CoverTagTone.brand;
    final ink = isBrand ? AppColors.canvas : warning;
    final icon = this.icon;
    return Container(
      height: height,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        color: isBrand
            ? AppColors.brand
            : AppColors.black.withValues(alpha: 0.7),
        borderRadius: AppRadii.smAll,
        border: isBrand
            ? null
            : Border.all(color: warning.withValues(alpha: 0.6)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: ink),
            const SizedBox(width: 4),
          ],
          BenefitsEyebrow(label, color: ink),
        ],
      ),
    );
  }
}
