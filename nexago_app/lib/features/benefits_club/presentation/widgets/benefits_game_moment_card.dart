import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_borders.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../application/benefits_club_providers.dart';
import '../../domain/benefit_event.dart';
import '../../domain/benefits_club_premium_logic.dart';
import '../../domain/partner.dart';
import '../benefits_club_navigation.dart';
import 'partner_visuals.dart';

/// Card discreto "Bateu a fome?" no pós-jogo (pelada) e no dia de torneio
/// (Modo Focus). Sem parceiro elegível, com o clube invisível para a pessoa,
/// carregando ou com erro, não ocupa espaço nenhum: a tela que o hospeda fica
/// como era.
class BenefitsGameMomentCard extends ConsumerWidget {
  const BenefitsGameMomentCard({
    super.key,
    required this.placement,
    this.padding = EdgeInsets.zero,
  });

  static const Key cardKey = Key('benefits-game-moment');

  final PartnerPlacement placement;

  /// Respiro em volta — só existe quando o card aparece.
  final EdgeInsets padding;

  BenefitSource get _source => switch (placement) {
    PartnerPlacement.postGame => BenefitSource.postGame,
    PartnerPlacement.tournamentDay => BenefitSource.tournamentDay,
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final partner = ref.watch(benefitsGameMomentPartnerProvider(placement));
    if (partner == null) return const SizedBox.shrink();
    final colors = context.themeColors;
    final line = gameMomentLine(partner);
    final title = gameMomentTitle(partner);
    void open() => openBenefitsPartner(context, partner.id, _source);
    return Padding(
      padding: padding,
      child: Column(
        key: cardKey,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const BenefitsEyebrow('Clube de Vantagens'),
          const SizedBox(height: 6),
          Semantics(
            button: true,
            label: 'Clube de Vantagens. $title $line',
            excludeSemantics: true,
            onTap: open,
            child: Material(
              color: colors.surfaceCard,
              clipBehavior: Clip.antiAlias,
              shape: RoundedRectangleBorder(
                borderRadius: AppRadii.lgAll,
                side: AppBorders.subtleSide(colors),
              ),
              child: InkWell(
                onTap: open,
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  child: Row(
                    children: [
                      PartnerLogo(
                        partner: partner,
                        size: 40,
                        borderRadius: AppRadii.mdAll,
                      ),
                      const SizedBox(width: AppSpacing.md),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              title,
                              style: AppTypography.titleS.copyWith(
                                fontSize: 13.5,
                                color: colors.onSurface,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              line,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: AppTypography.bodyS.copyWith(
                                fontSize: 12,
                                color: colors.onSurfaceMuted,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Icon(
                        Icons.chevron_right_rounded,
                        color: colors.onSurfaceMuted,
                      ),
                    ],
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
