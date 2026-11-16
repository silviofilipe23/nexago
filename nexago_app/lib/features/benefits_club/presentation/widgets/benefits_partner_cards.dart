import 'package:flutter/material.dart';

import '../../../../core/theme/app_borders.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/benefits_club_logic.dart';
import '../../domain/benefits_club_premium_logic.dart';
import '../../domain/partner.dart';
import 'partner_cover.dart';
import 'partner_visuals.dart';

/// Selos que dependem da data e da pessoa, já resolvidos pela tela.
class PartnerCardBadges {
  const PartnerCardBadges({
    this.isNew = false,
    this.ending,
    this.locked = false,
    this.distance,
  });

  final bool isNew;

  /// "Termina em 3 dias" / "Termina hoje".
  final String? ending;

  /// Parceiro com requisito que a pessoa não cumpre.
  final bool locked;

  /// "1,2 km" (só com a localização já liberada).
  final String? distance;
}

/// Card de um parceiro na lista do clube: capa com a logo por cima, nome,
/// categoria, benefício e o selo. Bloqueado = capa cinza, cadeado e a frase
/// do requisito.
class BenefitsPartnerCard extends StatelessWidget {
  const BenefitsPartnerCard({
    super.key,
    required this.partner,
    required this.onTap,
    this.badges = const PartnerCardBadges(),
  });

  static const double _thumbWidth = 86;
  static const double _thumbHeight = 64;

  final Partner partner;
  final VoidCallback onTap;
  final PartnerCardBadges badges;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final highlight = partner.benefitHighlight;
    final locked = badges.locked;
    final ending = badges.ending;
    final distance = badges.distance;
    return Semantics(
      button: true,
      label: locked
          ? '${partner.name}, bloqueado. ${requirementText(partner)}'
          : null,
      child: Material(
        color: colors.surfaceCard,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: AppRadii.lgAll,
          side: AppBorders.subtleSide(colors),
        ),
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Row(
              children: [
                _Thumb(partner: partner, badges: badges),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        partner.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.titleS.copyWith(
                          fontSize: 15,
                          color: colors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 2),
                      BenefitsEyebrow(
                        distance == null
                            ? partnerListCategoryLabel(partner)
                            : '${partnerListCategoryLabel(partner)} · $distance',
                      ),
                      const SizedBox(height: 3),
                      Text(
                        partner.benefitTitle,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.bodyS.copyWith(
                          fontSize: 12.5,
                          color: colors.onSurfaceMuted,
                        ),
                      ),
                      if (locked)
                        _AmberLine(
                          icon: Icons.lock_outline_rounded,
                          text: requirementText(partner),
                        )
                      else if (ending != null)
                        _AmberLine(icon: Icons.schedule_rounded, text: ending),
                    ],
                  ),
                ),
                if (highlight.isNotEmpty) ...[
                  const SizedBox(width: AppSpacing.sm),
                  BenefitHighlightBadge(highlight, muted: locked),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Thumb extends StatelessWidget {
  const _Thumb({required this.partner, required this.badges});

  final Partner partner;
  final PartnerCardBadges badges;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return SizedBox(
      width: BenefitsPartnerCard._thumbWidth,
      height: BenefitsPartnerCard._thumbHeight,
      child: ClipRRect(
        borderRadius: AppRadii.mdAll,
        child: Stack(
          fit: StackFit.expand,
          children: [
            PartnerCover(
              partner: partner,
              muted: badges.locked,
              cacheWidth: 260,
            ),
            if (badges.locked)
              Center(
                child: Container(
                  width: 30,
                  height: 30,
                  decoration: BoxDecoration(
                    color: colors.canvas.withValues(alpha: 0.6),
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: colors.onSurface.withValues(alpha: 0.18),
                    ),
                  ),
                  child: Icon(
                    Icons.lock_outline_rounded,
                    size: 14,
                    color: colors.onSurface,
                  ),
                ),
              ),
            if (badges.isNew && !badges.locked)
              const Positioned(
                top: 5,
                right: 5,
                child: CoverTag(label: 'Novo', height: 18),
              ),
            Positioned(
              left: 5,
              bottom: 5,
              child: Hero(
                tag: partnerLogoHeroTag(partner.id),
                child: PartnerLogo(
                  partner: partner,
                  size: 26,
                  borderRadius: AppRadii.smAll,
                  ring: BorderSide(color: colors.surfaceCard, width: 2),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AmberLine extends StatelessWidget {
  const _AmberLine({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final color = context.themeColors.pending;
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.xs),
      child: Row(
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 5),
          Expanded(
            child: Text(
              text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.bodyS.copyWith(fontSize: 11.5, color: color),
            ),
          ),
        ],
      ),
    );
  }
}

/// "Destaque da semana": capa grande, selo, prazo e a logo saindo da capa.
class BenefitsFeaturedCard extends StatelessWidget {
  const BenefitsFeaturedCard({
    super.key,
    required this.partner,
    required this.onTap,
    this.badges = const PartnerCardBadges(),
  });

  static const double _coverHeight = 124;
  static const double _logoSize = 52;

  final Partner partner;
  final VoidCallback onTap;
  final PartnerCardBadges badges;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final ending = badges.ending;
    return Semantics(
      button: true,
      label: 'Destaque da semana: ${partner.name}. ${partner.benefitTitle}',
      excludeSemantics: true,
      onTap: onTap,
      child: Material(
        color: colors.surfaceCard,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: AppRadii.xlAll,
          side: AppBorders.subtleSide(colors),
        ),
        child: InkWell(
          onTap: onTap,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                height: _coverHeight + _logoSize / 2,
                child: Stack(
                  children: [
                    Positioned(
                      left: 0,
                      right: 0,
                      top: 0,
                      height: _coverHeight,
                      child: PartnerCover(
                        partner: partner,
                        muted: badges.locked,
                        cacheWidth: 900,
                      ),
                    ),
                    const Positioned(
                      top: 10,
                      left: 10,
                      child: CoverTag(label: 'Destaque da semana'),
                    ),
                    if (ending != null)
                      Positioned(
                        top: 10,
                        right: 10,
                        child: CoverTag(
                          label: ending,
                          tone: CoverTagTone.warning,
                          icon: Icons.schedule_rounded,
                        ),
                      ),
                    Positioned(
                      left: 14,
                      bottom: 0,
                      child: Hero(
                        tag: partnerLogoHeroTag(partner.id),
                        child: PartnerLogo(
                          partner: partner,
                          size: _logoSize,
                          borderRadius: AppRadii.mdAll,
                          ring: BorderSide(color: colors.surfaceCard, width: 3),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 6, 14, 14),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            partner.name,
                            style: AppTypography.titleS.copyWith(
                              fontSize: 15,
                              color: colors.onSurface,
                            ),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            partner.benefitTitle,
                            style: AppTypography.bodyS.copyWith(
                              fontSize: 12.5,
                              color: colors.onSurfaceMuted,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (partner.benefitHighlight.isNotEmpty) ...[
                      const SizedBox(width: 10),
                      BenefitHighlightBadge(
                        partner.benefitHighlight,
                        muted: badges.locked,
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
