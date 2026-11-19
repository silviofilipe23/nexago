import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../class_agreements/application/class_agreements_providers.dart';
import '../../../../professor_links/application/professor_links_providers.dart';
import '../../../../schedule_plans/application/schedule_plans_providers.dart';
import '../../../domain/arena_club_providers.dart';
import '../../../domain/arena_detail_offers_logic.dart';
import 'arena_detail_info_sections.dart';

/// Cartões de "Outras formas de jogar" da arena (horário fixo, Clubinho,
/// aulas). Lista vazia enquanto carrega ou quando a arena não oferece nada.
final arenaDetailOtherOffersProvider = Provider.autoDispose
    .family<List<ArenaOfferSummary>, String>((ref, arenaId) {
  final plans =
      ref.watch(arenaActiveSchedulePlansProvider(arenaId)).valueOrNull ??
          const [];
  final sessions =
      ref.watch(arenaUpcomingClubSessionsProvider(arenaId)).valueOrNull ??
          const [];
  final signupOpen =
      ref.watch(arenaClassSignupOpenProvider(arenaId)).valueOrNull == true;
  final professors =
      ref.watch(arenaPublicProfessorsProvider(arenaId)).valueOrNull ??
          const [];

  final next = sessions.isEmpty ? null : sessions.first;
  return arenaOtherOffers(
    planMonthlyPrices: [for (final p in plans) p.monthlyPriceReais],
    nextClubSession: next == null
        ? null
        : ArenaOfferClubSession(
            startAt: next.startAt,
            startTime: next.startTime,
            spotsLeft: next.spotsLeft,
            priceReais: next.priceReais,
          ),
    classSignupOpen: signupOpen,
    professorsCount: professors.length,
  );
});

/// "Outras formas de jogar": fileira de cartões que rola para o lado. Tocar
/// leva à seção completa mais abaixo.
class ArenaDetailOtherOffers extends ConsumerWidget {
  const ArenaDetailOtherOffers({
    super.key,
    required this.arenaId,
    required this.onTap,
    this.horizontalPadding = 20,
  });

  static const double cardWidth = 156;

  final String arenaId;
  final ValueChanged<ArenaOfferKind> onTap;
  final double horizontalPadding;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final offers = ref.watch(arenaDetailOtherOffersProvider(arenaId));
    if (offers.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: EdgeInsets.symmetric(horizontal: horizontalPadding),
          child: const ArenaDetailSectionTitle('Outras formas de jogar'),
        ),
        const SizedBox(height: 12),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: EdgeInsets.symmetric(horizontal: horizontalPadding),
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final (i, offer) in offers.indexed) ...[
                  if (i > 0) const SizedBox(width: 10),
                  SizedBox(
                    width: cardWidth,
                    child: _OfferCard(
                      offer: offer,
                      onTap: () => onTap(offer.kind),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _OfferCard extends StatelessWidget {
  const _OfferCard({required this.offer, required this.onTap});

  final ArenaOfferSummary offer;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    return Material(
      color: colors.surfaceCard,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: colors.outline.withValues(alpha: 0.35)),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                offer.kicker,
                style: AppTypography.mono(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1,
                  color: colors.brandText,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                offer.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: colors.onSurface,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                offer.subtitle,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: colors.onSurfaceMuted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
