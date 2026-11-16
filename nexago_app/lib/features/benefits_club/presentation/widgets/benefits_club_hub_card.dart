import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../application/benefits_club_providers.dart';
import '../../domain/benefit_event.dart';
import '../../domain/partner.dart';
import '../benefits_club_navigation.dart';
import 'partner_visuals.dart';

/// Quantas logos de parceiro o card mostra.
const int _maxLogos = 3;
const double _logoSize = 28;
const double _logoOverlap = 8;

/// Card "Clube de Vantagens Nexa" do Hub, de largura inteira, logo abaixo da
/// grade. Só aparece com a flag ligada ou para quem testa; carregando ou com
/// erro não ocupa espaço nenhum (o Hub de hoje não pode pular nem quebrar).
class BenefitsClubHubCard extends ConsumerWidget {
  const BenefitsClubHubCard({super.key, this.bottomGap = 0});

  static const Key cardKey = Key('compete-hub-benefits-club');

  /// Respiro depois do card — só existe quando o card aparece.
  final double bottomGap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(benefitsHubCardVisibleProvider)) {
      return const SizedBox.shrink();
    }
    final partners =
        ref.watch(benefitsVisiblePartnersProvider).valueOrNull ?? const [];
    return Padding(
      padding: EdgeInsets.only(bottom: bottomGap),
      child: _HubCard(
        key: cardKey,
        partners: partners.take(_maxLogos).toList(),
      ),
    );
  }
}

class _HubCard extends ConsumerStatefulWidget {
  const _HubCard({super.key, required this.partners});

  final List<Partner> partners;

  @override
  ConsumerState<_HubCard> createState() => _HubCardState();
}

class _HubCardState extends ConsumerState<_HubCard> {
  @override
  void initState() {
    super.initState();
    // Visto = desenhado. O tracker garante uma vez por sessão do app.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) ref.read(benefitsClubTrackerProvider).hubCardViewed();
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final titleStyle = AppTypography.titleS.copyWith(
      fontSize: 14.5,
      color: colors.onSurface,
      height: 1.25,
    );
    return Semantics(
      button: true,
      label: 'Clube de Vantagens Nexa, novo. Descontos dos parceiros NexaGO',
      excludeSemantics: true,
      onTap: _open,
      child: Material(
        color: Color.alphaBlend(
          AppColors.brand.withValues(alpha: 0.08),
          colors.surfaceCard,
        ),
        clipBehavior: Clip.antiAlias,
        shape: const RoundedRectangleBorder(
          borderRadius: AppRadii.lgAll,
          side: BorderSide(color: AppColors.brand, width: 1.5),
        ),
        child: InkWell(
          onTap: _open,
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.md + 2),
            child: Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: const BoxDecoration(
                    color: AppColors.brand,
                    borderRadius: AppRadii.mdAll,
                  ),
                  child: const Icon(
                    Icons.card_giftcard_rounded,
                    size: 21,
                    color: AppColors.canvas,
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text.rich(
                        TextSpan(
                          text: 'Clube de Vantagens Nexa ',
                          children: const [
                            WidgetSpan(
                              alignment: PlaceholderAlignment.middle,
                              child: _NewBadge(),
                            ),
                          ],
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: titleStyle,
                      ),
                      const SizedBox(height: 3),
                      Text(
                        'Descontos dos parceiros NexaGO',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.bodyS.copyWith(
                          fontSize: 11.5,
                          height: 1.3,
                          color: colors.onSurfaceMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                if (widget.partners.isNotEmpty) ...[
                  const SizedBox(width: AppSpacing.sm),
                  _StackedLogos(partners: widget.partners),
                ],
                const SizedBox(width: AppSpacing.sm),
                Icon(
                  Icons.arrow_forward_rounded,
                  size: 17,
                  color: colors.onSurface,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _open() => openBenefitsClub(context, BenefitSource.hubCard);
}

class _NewBadge extends StatelessWidget {
  const _NewBadge();

  @override
  Widget build(BuildContext context) => Container(
    height: 18,
    padding: const EdgeInsets.symmetric(horizontal: 6),
    decoration: const BoxDecoration(
      color: AppColors.brand,
      borderRadius: AppRadii.smAll,
    ),
    alignment: Alignment.center,
    child: Text(
      'NOVO',
      style: AppTypography.mono(
        fontSize: benefitsMinFontSize,
        fontWeight: FontWeight.w800,
        color: AppColors.canvas,
        letterSpacing: 0.8,
        height: 1,
      ),
    ),
  );
}

class _StackedLogos extends StatelessWidget {
  const _StackedLogos({required this.partners});

  final List<Partner> partners;

  @override
  Widget build(BuildContext context) {
    final ring = BorderSide(color: context.themeColors.surfaceCard, width: 2);
    const step = _logoSize - _logoOverlap;
    return SizedBox(
      width: _logoSize + step * (partners.length - 1),
      height: _logoSize,
      child: Stack(
        children: [
          for (var i = 0; i < partners.length; i++)
            Positioned(
              left: step * i,
              child: PartnerLogo(
                partner: partners[i],
                size: _logoSize,
                ring: ring,
              ),
            ),
        ],
      ),
    );
  }
}
