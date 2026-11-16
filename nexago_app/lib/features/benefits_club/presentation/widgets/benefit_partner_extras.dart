import 'package:flutter/material.dart';

import '../../../../core/theme/app_borders.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/benefits_club_premium_logic.dart';
import '../../domain/partner.dart';
import 'benefits_member_card.dart';
import 'partner_visuals.dart';

IconData _termsIcon(PartnerTermsTag tag) => switch (tag) {
  PartnerTermsTag.online => Icons.language_rounded,
  PartnerTermsTag.inStore => Icons.storefront_outlined,
  PartnerTermsTag.notCumulative => Icons.block_rounded,
  PartnerTermsTag.unlimited => Icons.all_inclusive_rounded,
  PartnerTermsTag.firstOrder => Icons.looks_one_outlined,
  PartnerTermsTag.onePerPerson => Icons.person_outline_rounded,
};

/// Chips dos termos ("Online", "Não cumulativo"…).
class BenefitTermsChips extends StatelessWidget {
  const BenefitTermsChips({super.key, required this.tags});

  final List<PartnerTermsTag> tags;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Semantics(
      label: 'Termos',
      container: true,
      child: Wrap(
        spacing: AppSpacing.sm,
        runSpacing: AppSpacing.sm,
        children: [
          for (final tag in tags)
            Container(
              height: 30,
              padding: const EdgeInsets.symmetric(horizontal: 11),
              decoration: BoxDecoration(
                color: colors.surfaceCard,
                borderRadius: AppRadii.pillAll,
                border: Border.all(
                  color: colors.onSurface.withValues(alpha: 0.14),
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(_termsIcon(tag), size: 13, color: colors.onSurfaceMuted),
                  const SizedBox(width: 6),
                  Text(
                    tag.label,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: colors.onSurface.withValues(alpha: 0.8),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Uma unidade em "Onde usar": nome, endereço (com a distância quando há
/// localização liberada) e horário.
class BenefitLocationTile extends StatelessWidget {
  const BenefitLocationTile({super.key, required this.location, this.distance});

  final PartnerLocation location;
  final String? distance;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final km = distance;
    final hours = location.hours;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: AppRadii.lgAll,
        border: AppBorders.subtle(colors),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: AppColors.brand.withValues(alpha: 0.12),
              borderRadius: AppRadii.mdAll,
            ),
            child: Icon(
              Icons.place_outlined,
              size: 18,
              color: colors.brandText,
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  location.name,
                  style: AppTypography.titleS.copyWith(
                    fontSize: 13.5,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  km == null ? location.address : '${location.address} · $km',
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 12,
                    color: colors.onSurfaceMuted,
                  ),
                ),
                if (hours != null) ...[
                  const SizedBox(height: 3),
                  Text(
                    hours,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11.5,
                      color: colors.win,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Cupom escondido de um parceiro bloqueado.
class BenefitMaskedCoupon extends StatelessWidget {
  const BenefitMaskedCoupon({super.key});

  static const Key maskKey = Key('benefits-coupon-masked');

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      key: maskKey,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: colors.onSurface.withValues(alpha: 0.03),
        borderRadius: AppRadii.lgAll,
        border: Border.all(
          color: colors.onSurface.withValues(alpha: 0.22),
          width: 1.5,
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const BenefitsEyebrow('Cupom'),
                const SizedBox(height: 2),
                Semantics(
                  label: 'Cupom escondido',
                  excludeSemantics: true,
                  child: Text(
                    '••••••••',
                    style: AppTypography.mono(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 5,
                      color: colors.onSurface.withValues(alpha: 0.35),
                    ),
                  ),
                ),
              ],
            ),
          ),
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: colors.surfaceRaised,
              borderRadius: AppRadii.mdAll,
              border: AppBorders.strong(colors),
            ),
            child: Icon(
              Icons.lock_outline_rounded,
              size: 18,
              color: colors.onSurface,
            ),
          ),
        ],
      ),
    );
  }
}

/// Cupom de parceiro com requisito para quem cumpre: só aparece depois da
/// `claimBenefit` ("Mostrar").
class BenefitClaimCouponBox extends StatelessWidget {
  const BenefitClaimCouponBox({
    super.key,
    required this.busy,
    required this.onClaim,
  });

  static const Key buttonKey = Key('benefits-claim-coupon');

  final bool busy;
  final VoidCallback onClaim;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 10, 10, 10),
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
                const BenefitsEyebrow('Cupom'),
                const SizedBox(height: 2),
                Text(
                  'Liberado para você',
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 13,
                    color: colors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          BenefitCopyButton(
            buttonKey: buttonKey,
            label: 'Mostrar',
            icon: Icons.visibility_outlined,
            busy: busy,
            onTap: onClaim,
          ),
        ],
      ),
    );
  }
}

/// Os dois passos de "Como desbloquear", por tipo de requisito.
List<String> unlockSteps(PartnerRequirementType type) => switch (type) {
  PartnerRequirementType.squad => const [
    'Conheça o Squad e veja como virar embaixador.',
    'Quando você entrar, o cupom aparece aqui sozinho.',
  ],
  PartnerRequirementType.tournament => const [
    'Inscreva-se no torneio participante e conclua o pagamento.',
    'Com a inscrição paga, o cupom aparece aqui sozinho.',
  ],
  PartnerRequirementType.minLevel => const [
    'Seu nível sobe com os resultados nos torneios e ligas da NexaGO.',
    'Quando você chegar ao nível pedido, o cupom aparece aqui sozinho.',
  ],
  PartnerRequirementType.none => const [],
};

/// "Como desbloquear": a frase do requisito e os passos.
class BenefitUnlockCard extends StatelessWidget {
  const BenefitUnlockCard({super.key, required this.partner});

  static const Key cardKey = Key('benefits-unlock');

  final Partner partner;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final amber = colors.pending;
    final steps = unlockSteps(partner.requirement.type);
    return Container(
      key: cardKey,
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        borderRadius: AppRadii.lgAll,
        border: Border.all(color: amber.withValues(alpha: 0.35)),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color.alphaBlend(amber.withValues(alpha: 0.10), colors.surfaceCard),
            colors.surfaceCard,
          ],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            header: true,
            child: Row(
              children: [
                Icon(Icons.lock_open_rounded, size: 18, color: amber),
                const SizedBox(width: AppSpacing.sm),
                Text(
                  'Como desbloquear',
                  style: AppTypography.titleS.copyWith(color: colors.onSurface),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          Text(
            requirementText(partner),
            style: AppTypography.bodyS.copyWith(
              fontSize: 13,
              height: 1.5,
              color: colors.onSurface.withValues(alpha: 0.78),
            ),
          ),
          for (var i = 0; i < steps.length; i++) ...[
            const SizedBox(height: 10),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 24,
                  height: 24,
                  decoration: BoxDecoration(
                    color: colors.surfaceRaised,
                    shape: BoxShape.circle,
                    border: AppBorders.strong(colors),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    '${i + 1}',
                    style: AppTypography.mono(
                      fontSize: benefitsMinFontSize,
                      fontWeight: FontWeight.w700,
                      color: amber,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: Text(
                      steps[i],
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 12.5,
                        height: 1.45,
                        color: colors.onSurface.withValues(alpha: 0.78),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
