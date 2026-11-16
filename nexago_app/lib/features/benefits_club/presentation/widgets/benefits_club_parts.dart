import 'package:flutter/material.dart';

import '../../../../core/theme/app_borders.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/nexa_icon_square_button.dart';
import '../../domain/benefits_club_logic.dart';
import '../../domain/partner.dart';
import 'partner_visuals.dart';

/// Alvo mínimo de toque.
const double benefitsTapTarget = 44;

/// Topo das telas do clube: voltar, título e subtítulo centralizados.
class BenefitsTitleHeader extends StatelessWidget {
  const BenefitsTitleHeader({
    super.key,
    required this.title,
    required this.subtitle,
    required this.onBack,
  });

  final String title;
  final String subtitle;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.md,
        AppSpacing.screenH,
        AppSpacing.md,
      ),
      child: Row(
        children: [
          NexaIconSquareButton(
            icon: Icons.arrow_back_rounded,
            size: benefitsTapTarget,
            tooltip: 'Voltar',
            onTap: onBack,
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              children: [
                Semantics(
                  header: true,
                  child: Text(
                    title,
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.titleM.copyWith(
                      color: colors.onSurface,
                    ),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w500,
                    color: colors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.md + benefitsTapTarget),
        ],
      ),
    );
  }
}

/// Banner do patrocinador oficial, na cor da marca dele. O toque abre a tela
/// do parceiro.
class BenefitsSponsorBanner extends StatelessWidget {
  const BenefitsSponsorBanner({
    super.key,
    required this.partner,
    required this.onTap,
  });

  final Partner partner;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final brand = partnerBrandColor(partner);
    final ink = onPartnerBrand(brand);
    return Semantics(
      container: true,
      button: true,
      label: 'Patrocinador oficial: ${partner.name}. ${partner.benefitTitle}',
      excludeSemantics: true,
      onTap: onTap,
      child: Material(
        color: brand,
        borderRadius: AppRadii.xlAll,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Icon(
                      Icons.star_outline_rounded,
                      size: 14,
                      color: ink.withValues(alpha: 0.85),
                    ),
                    const SizedBox(width: 6),
                    BenefitsEyebrow(
                      'Patrocinador oficial',
                      color: ink.withValues(alpha: 0.85),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.md),
                Row(
                  children: [
                    PartnerLogo(
                      partner: partner,
                      size: 52,
                      borderRadius: AppRadii.mdAll,
                      onBrandSurface: true,
                    ),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            partner.name,
                            style: AppTypography.soraRegular(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                              color: ink,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            partner.benefitTitle,
                            style: AppTypography.bodyS.copyWith(
                              fontSize: 13,
                              color: ink.withValues(alpha: 0.88),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.md),
                Container(
                  height: benefitsTapTarget,
                  decoration: const BoxDecoration(
                    color: AppColors.white,
                    borderRadius: AppRadii.mdAll,
                  ),
                  alignment: Alignment.center,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Flexible(
                        child: Text(
                          partner.ctaLabel,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.labelL.copyWith(
                            color: partnerInkOnWhite(brand),
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Icon(
                        Icons.arrow_forward_rounded,
                        size: 16,
                        color: partnerInkOnWhite(brand),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Chips de categoria: "Todos" + as que têm parceiro. Filtro local.
class BenefitsCategoryChips extends StatelessWidget {
  const BenefitsCategoryChips({
    super.key,
    required this.categories,
    required this.selected,
    required this.onSelected,
  });

  final List<PartnerCategory> categories;
  final PartnerCategory? selected;
  final ValueChanged<PartnerCategory?> onSelected;

  @override
  Widget build(BuildContext context) {
    final options = <PartnerCategory?>[null, ...categories];
    return SizedBox(
      height: benefitsTapTarget,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
        itemCount: options.length,
        separatorBuilder: (_, __) => const SizedBox(width: AppSpacing.sm),
        itemBuilder: (context, i) {
          final category = options[i];
          return _CategoryChip(
            key: Key('benefits-chip-${category?.key ?? 'all'}'),
            label: category?.label ?? 'Todos',
            selected: category == selected,
            onTap: () => onSelected(category),
          );
        },
      ),
    );
  }
}

class _CategoryChip extends StatelessWidget {
  const _CategoryChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    // A pílula tem 36 de altura; o toque vale nos 44 da faixa.
    return Semantics(
      button: true,
      selected: selected,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Center(
          child: Container(
            height: 36,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              color: selected
                  ? AppColors.brand.withValues(alpha: 0.12)
                  : colors.surfaceCard,
              borderRadius: AppRadii.pillAll,
              border: Border.all(
                color: selected
                    ? AppColors.brand
                    : colors.onSurfaceMuted.withValues(alpha: 0.2),
              ),
            ),
            alignment: Alignment.center,
            child: Text(
              label,
              style: AppTypography.soraRegular(
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                color: selected ? colors.brandText : colors.onSurfaceMuted,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Card de um parceiro na lista do clube.
class BenefitsPartnerCard extends StatelessWidget {
  const BenefitsPartnerCard({
    super.key,
    required this.partner,
    required this.onTap,
  });

  final Partner partner;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final highlight = partner.benefitHighlight;
    return Material(
      color: colors.surfaceCard,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: AppRadii.lgAll,
        side: AppBorders.subtleSide(colors),
      ),
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Row(
            children: [
              PartnerLogo(
                partner: partner,
                size: 52,
                borderRadius: AppRadii.mdAll,
              ),
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
                    const SizedBox(height: 3),
                    BenefitsEyebrow(partnerListCategoryLabel(partner)),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      partner.benefitTitle,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 12.5,
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
              if (highlight.isNotEmpty) ...[
                const SizedBox(width: AppSpacing.sm),
                BenefitHighlightBadge(highlight),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Aviso do pé da lista.
class BenefitsClubNote extends StatelessWidget {
  const BenefitsClubNote({super.key});

  static const String text =
      'Os descontos são dados pelos parceiros. Você '
      'não paga nada a mais por usar o clube.';

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md + 2,
        vertical: AppSpacing.md,
      ),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: AppRadii.mdAll,
        border: AppBorders.subtle(colors),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline_rounded, size: 16, color: colors.brandText),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: AppTypography.bodyS.copyWith(
                color: colors.onSurfaceMuted,
                height: 1.45,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
