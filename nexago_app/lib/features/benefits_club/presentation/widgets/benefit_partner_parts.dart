import 'package:flutter/material.dart';

import '../../../../core/theme/app_borders.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/nexa_icon_square_button.dart';
import '../../domain/partner.dart';
import 'benefits_club_parts.dart';
import 'partner_visuals.dart';

/// Topo da tela do parceiro, na cor da marca (passa por baixo da barra de
/// status): voltar, selo de patrocinador, logo, nome e "Categoria · cidade".
class BenefitPartnerHero extends StatelessWidget {
  const BenefitPartnerHero({
    super.key,
    required this.partner,
    required this.locationLabel,
    required this.onBack,
  });

  final Partner partner;
  final String locationLabel;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final brand = partnerBrandColor(partner);
    final ink = onPartnerBrand(brand);
    return ColoredBox(
      color: brand,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenH,
            AppSpacing.sm,
            AppSpacing.screenH,
            22,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  NexaIconSquareButton(
                    icon: Icons.arrow_back_rounded,
                    size: benefitsTapTarget,
                    tooltip: 'Voltar',
                    iconColor: ink,
                    background: AppColors.black.withValues(alpha: 0.18),
                    side: BorderSide(color: ink.withValues(alpha: 0.24)),
                    onTap: onBack,
                  ),
                  const Spacer(),
                  if (partner.isMasterSponsor) _OfficialPill(ink: ink),
                ],
              ),
              const SizedBox(height: AppSpacing.md + 2),
              Row(
                children: [
                  PartnerLogo(
                    partner: partner,
                    size: 64,
                    borderRadius: AppRadii.lgAll,
                    onBrandSurface: true,
                  ),
                  const SizedBox(width: AppSpacing.md + 2),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Semantics(
                          header: true,
                          child: Text(
                            partner.name,
                            style: AppTypography.titleL.copyWith(color: ink),
                          ),
                        ),
                        const SizedBox(height: AppSpacing.xs),
                        BenefitsEyebrow(
                          locationLabel,
                          color: ink.withValues(alpha: 0.8),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OfficialPill extends StatelessWidget {
  const _OfficialPill({required this.ink});

  final Color ink;

  @override
  Widget build(BuildContext context) => Container(
    height: 28,
    padding: const EdgeInsets.symmetric(horizontal: 10),
    decoration: BoxDecoration(
      color: ink.withValues(alpha: 0.16),
      borderRadius: AppRadii.pillAll,
      border: Border.all(color: ink.withValues(alpha: 0.3)),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.star_outline_rounded, size: 13, color: ink),
        const SizedBox(width: 6),
        BenefitsEyebrow('Patrocinador oficial', color: ink),
      ],
    ),
  );
}

/// O benefício em destaque: selo grande em verde, título e descrição.
class BenefitDetailsCard extends StatelessWidget {
  const BenefitDetailsCard({super.key, required this.partner});

  final Partner partner;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: AppRadii.lgAll,
        border: AppBorders.subtle(colors),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (partner.benefitHighlight.isNotEmpty) ...[
            Text(
              partner.benefitHighlight,
              style: AppTypography.soraRegular(
                fontSize: 26,
                fontWeight: FontWeight.w800,
                color: colors.win,
                height: 1.1,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
          ],
          Text(
            partner.benefitTitle,
            style: AppTypography.titleS.copyWith(color: colors.onSurface),
          ),
          if (partner.description.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              partner.description,
              style: AppTypography.bodyS.copyWith(
                fontSize: 13,
                height: 1.45,
                color: colors.onSurfaceMuted,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Caixa do cupom com o botão "Copiar".
class BenefitCouponBox extends StatelessWidget {
  const BenefitCouponBox({
    super.key,
    required this.coupon,
    required this.onCopy,
  });

  final String coupon;
  final VoidCallback onCopy;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.md + 2,
        AppSpacing.md + 2,
        AppSpacing.md + 2,
      ),
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.06),
        borderRadius: AppRadii.lgAll,
        border: Border.all(
          color: AppColors.brand.withValues(alpha: 0.6),
          width: 1.5,
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const BenefitsEyebrow('Seu cupom'),
                const SizedBox(height: AppSpacing.xs),
                SelectableText(
                  coupon,
                  style: AppTypography.mono(
                    fontSize: 22,
                    letterSpacing: 1.6,
                    color: colors.onSurface,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Material(
            color: colors.surfaceRaised,
            shape: RoundedRectangleBorder(
              borderRadius: AppRadii.mdAll,
              side: AppBorders.strongSide(colors),
            ),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              key: const Key('benefits-copy-coupon'),
              onTap: onCopy,
              child: Container(
                height: benefitsTapTarget,
                padding: const EdgeInsets.symmetric(horizontal: 14),
                alignment: Alignment.center,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.copy_rounded, size: 16, color: colors.onSurface),
                    const SizedBox(width: 7),
                    Text(
                      'Copiar',
                      style: AppTypography.labelL.copyWith(
                        fontSize: 13,
                        color: colors.onSurface,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Os passos numerados, com o botão, o cupom e o WhatsApp em negrito.
class BenefitSteps extends StatelessWidget {
  const BenefitSteps({super.key, required this.steps, required this.bold});

  final List<String> steps;
  final List<String> bold;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final style = AppTypography.bodyS.copyWith(
      fontSize: 13,
      height: 1.45,
      color: colors.onSurface.withValues(alpha: 0.8),
    );
    return Column(
      children: [
        for (var i = 0; i < steps.length; i++)
          Padding(
            padding: EdgeInsets.only(bottom: i == steps.length - 1 ? 0 : 10),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 26,
                  height: 26,
                  decoration: BoxDecoration(
                    color: colors.surfaceRaised,
                    shape: BoxShape.circle,
                    border: AppBorders.strong(colors),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    '${i + 1}',
                    style: AppTypography.mono(
                      fontSize: 12,
                      color: colors.brandText,
                    ),
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: Text.rich(
                      boldSpans(
                        steps[i],
                        bold: bold,
                        style: style,
                        boldStyle: TextStyle(
                          fontWeight: FontWeight.w700,
                          color: colors.onSurface,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

/// "Termos e condições" que abre e fecha no lugar.
class BenefitTermsSection extends StatefulWidget {
  const BenefitTermsSection({super.key, required this.terms});

  final String terms;

  @override
  State<BenefitTermsSection> createState() => _BenefitTermsSectionState();
}

class _BenefitTermsSectionState extends State<BenefitTermsSection> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          button: true,
          expanded: _open,
          child: InkWell(
            key: const Key('benefits-terms-toggle'),
            onTap: () => setState(() => _open = !_open),
            child: Container(
              constraints: const BoxConstraints(minHeight: benefitsTapTarget),
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
              decoration: BoxDecoration(
                border: Border(top: AppBorders.subtleSide(colors)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'Termos e condições',
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 13,
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ),
                  AnimatedRotation(
                    turns: _open ? 0.25 : 0,
                    duration: const Duration(milliseconds: 180),
                    child: Icon(
                      Icons.chevron_right_rounded,
                      size: 18,
                      color: colors.onSurfaceMuted,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        if (_open)
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.xs,
              AppSpacing.xs,
              AppSpacing.xs,
              AppSpacing.sm,
            ),
            child: Text(
              widget.terms,
              style: AppTypography.bodyS.copyWith(
                color: colors.onSurfaceMuted,
                height: 1.5,
              ),
            ),
          ),
      ],
    );
  }
}

/// Barra fixa do pé com o botão laranja e a dica embaixo.
class BenefitCtaBar extends StatelessWidget {
  const BenefitCtaBar({
    super.key,
    required this.label,
    required this.hint,
    required this.onPressed,
    this.icon,
    this.busy = false,
    this.buttonKey,
  });

  final String label;
  final String? hint;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool busy;
  final Key? buttonKey;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final hint = this.hint;
    final icon = this.icon;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.canvas,
        border: Border(top: AppBorders.subtleSide(colors)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenH,
            AppSpacing.md,
            AppSpacing.screenH,
            AppSpacing.md,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                height: 52,
                child: FilledButton(
                  key: buttonKey,
                  onPressed: busy ? null : onPressed,
                  style: FilledButton.styleFrom(
                    shape: const RoundedRectangleBorder(
                      borderRadius: AppRadii.mdAll,
                    ),
                  ),
                  child: busy
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.4,
                            color: AppColors.canvas,
                          ),
                        )
                      : Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Flexible(
                              child: Text(
                                label,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: AppTypography.labelL.copyWith(
                                  fontSize: 15,
                                ),
                              ),
                            ),
                            if (icon != null) ...[
                              const SizedBox(width: AppSpacing.sm),
                              Icon(icon, size: 17),
                            ],
                          ],
                        ),
                ),
              ),
              if (hint != null) ...[
                const SizedBox(height: 6),
                Text(
                  hint,
                  textAlign: TextAlign.center,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: benefitsMinFontSize,
                    color: colors.onSurfaceMuted,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
