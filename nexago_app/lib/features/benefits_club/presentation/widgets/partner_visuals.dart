import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/benefits_club_logic.dart';
import '../../domain/partner.dart';
import '../../domain/partner_brand_color.dart';

/// Menor texto do clube (acessibilidade: nada abaixo de 11 px).
const double benefitsMinFontSize = 11;

/// Cor da marca do parceiro; ilegível = laranja da NexaGO.
Color partnerBrandColor(Partner partner) {
  final argb = parseBrandColorArgb(partner.brandColor);
  return argb == null ? AppColors.brand : Color(argb);
}

/// Texto e ícone por cima da cor da marca: branco ou quase preto, o que mais
/// contrasta.
Color onPartnerBrand(Color brand) => Color(
  pickForeground(
    brand.toARGB32(),
    light: AppColors.white.toARGB32(),
    dark: AppColors.canvas.toARGB32(),
  ),
);

/// Cor da marca sobre fundo branco (iniciais na logo, botão do banner): a
/// própria marca quando ela é escura o bastante, senão quase preto.
Color partnerInkOnWhite(Color brand) =>
    onPartnerBrand(brand) == AppColors.white ? brand : AppColors.canvas;

/// Cor da marca como texto sobre [surface] (claro ou escuro): a própria marca
/// quando contrasta o bastante (4.5:1), senão o texto padrão do tema.
Color partnerInkOnSurface(Color brand, Color surface) {
  const minContrast = 4.5;
  if (contrastRatio(brand.toARGB32(), surface.toARGB32()) >= minContrast) {
    return brand;
  }
  return Color(
    pickForeground(
      surface.toARGB32(),
      light: AppColors.white.toARGB32(),
      dark: AppColors.canvas.toARGB32(),
    ),
  );
}

/// Rótulo em caixa alta e monoespaçado ("SEU CUPOM", "COMO USAR").
class BenefitsEyebrow extends StatelessWidget {
  const BenefitsEyebrow(this.text, {super.key, this.color});

  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) => Text(
    text.toUpperCase(),
    style: AppTypography.mono(
      fontSize: benefitsMinFontSize,
      fontWeight: FontWeight.w700,
      letterSpacing: 1.4,
      color: color ?? context.themeColors.onSurfaceMuted,
    ),
  );
}

/// Logo do parceiro: a imagem num quadro branco ou, sem imagem, as iniciais.
///
/// [onBrandSurface] = a logo está em cima da cor da marca (banner, hero):
/// quadro sempre branco e iniciais na cor da marca. Fora dele, as iniciais
/// ficam num quadro da cor da marca. [borderRadius] `null` = círculo.
class PartnerLogo extends StatelessWidget {
  const PartnerLogo({
    super.key,
    required this.partner,
    required this.size,
    this.borderRadius,
    this.onBrandSurface = false,
    this.ring,
  });

  final Partner partner;
  final double size;
  final BorderRadius? borderRadius;
  final bool onBrandSurface;

  /// Contorno (as logos sobrepostas do card do Hub).
  final BorderSide? ring;

  @override
  Widget build(BuildContext context) {
    final brand = partnerBrandColor(partner);
    final logoUrl = partner.logoUrl;
    final ring = this.ring;
    final whiteTile = onBrandSurface || logoUrl != null;
    final initials = _Initials(
      text: partnerInitials(partner.name),
      size: size,
      color: whiteTile ? partnerInkOnWhite(brand) : onPartnerBrand(brand),
    );

    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: whiteTile ? AppColors.white : brand,
          shape: borderRadius == null ? BoxShape.circle : BoxShape.rectangle,
          borderRadius: borderRadius,
          border: ring == null ? null : Border.fromBorderSide(ring),
        ),
        alignment: Alignment.center,
        child: logoUrl == null
            ? initials
            : Padding(
                padding: EdgeInsets.all(size * 0.14),
                child: CachedNetworkImage(
                  imageUrl: logoUrl,
                  fit: BoxFit.contain,
                  memCacheWidth: (size * 3).round(),
                  placeholder: (_, __) => initials,
                  errorWidget: (_, __, ___) => initials,
                ),
              ),
      ),
    );
  }
}

class _Initials extends StatelessWidget {
  const _Initials({
    required this.text,
    required this.size,
    required this.color,
  });

  final String text;
  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) => Text(
    text,
    maxLines: 1,
    overflow: TextOverflow.clip,
    style: AppTypography.soraRegular(
      fontSize: math.max(benefitsMinFontSize, size * 0.3),
      fontWeight: FontWeight.w800,
      color: color,
      height: 1,
    ),
  );
}

/// Selo verde do benefício ("10% OFF"); [muted] = parceiro bloqueado.
class BenefitHighlightBadge extends StatelessWidget {
  const BenefitHighlightBadge(this.text, {super.key, this.muted = false});

  final String text;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final tone = muted ? colors.onSurfaceMuted : AppColors.win;
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm,
        vertical: 5,
      ),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: muted ? 0.06 : 0.10),
        borderRadius: AppRadii.smAll,
        border: Border.all(color: tone.withValues(alpha: 0.35)),
      ),
      child: Text(
        text,
        style: AppTypography.mono(
          fontSize: benefitsMinFontSize,
          fontWeight: FontWeight.w700,
          color: muted ? colors.onSurfaceMuted : colors.win,
        ),
      ),
    );
  }
}

/// Texto com trechos em negrito (botão, cupom, WhatsApp nos passos; nome do
/// parceiro no consentimento). Só a primeira ocorrência de cada trecho.
TextSpan boldSpans(
  String text, {
  required Iterable<String> bold,
  required TextStyle style,
  required TextStyle boldStyle,
}) {
  final ranges = <({int start, int end})>[];
  for (final token in bold.where((t) => t.isNotEmpty)) {
    final start = text.indexOf(token);
    if (start < 0) continue;
    final end = start + token.length;
    final overlaps = ranges.any((r) => start < r.end && end > r.start);
    if (!overlaps) ranges.add((start: start, end: end));
  }
  ranges.sort((a, b) => a.start.compareTo(b.start));

  final children = <TextSpan>[];
  var cursor = 0;
  for (final range in ranges) {
    if (range.start > cursor) {
      children.add(TextSpan(text: text.substring(cursor, range.start)));
    }
    children.add(
      TextSpan(text: text.substring(range.start, range.end), style: boldStyle),
    );
    cursor = range.end;
  }
  if (cursor < text.length)
    children.add(TextSpan(text: text.substring(cursor)));
  return TextSpan(style: style, children: children);
}
