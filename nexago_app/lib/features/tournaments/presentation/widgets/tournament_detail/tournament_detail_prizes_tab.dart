import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/tournament_detail_logic.dart';
import '../../../domain/tournament_detail_model.dart';
import '../../../domain/tournament_discovery_models.dart';
import 'tournament_detail_tab_slivers.dart';

class TournamentDetailPrizesTab extends StatelessWidget {
  const TournamentDetailPrizesTab({super.key, required this.tournament});

  final TournamentDetail tournament;

  List<Widget> buildSlivers(BuildContext context) {
    final offers = tournament.categoryOffers;
    final categoriesTotalValue = tournamentCategoryPrizesTotalAll(offers);
    final firstPlaceTotal = tournamentCategoryFirstPlaceTotalAll(offers);
    final eventTotalValue = tournamentEventPrizesTotalValue(tournament);

    if (offers.isEmpty) {
      return tournamentDetailTabSliversFromChildren(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
        children: [
          _PrizeTotalCard(
            eventTotalLabel: formatMoney(eventTotalValue),
            categoriesCount: 0,
            firstPlaceTotalLabel: formatMoney(0),
          ),
          const _EmptyCategoriesMessage(),
        ],
      );
    }

    return tournamentDetailTabSliversFromChildren(
      padding: const EdgeInsets.only(bottom: 24),
      children: [
        _PrizeTotalCard(
          eventTotalLabel: formatMoney(
            categoriesTotalValue > 0 ? categoriesTotalValue : eventTotalValue,
          ),
          categoriesCount: offers.length,
          firstPlaceTotalLabel: formatMoney(firstPlaceTotal),
        ),
        for (final offer in offers) _CategoryPrizesCard(offer: offer),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(slivers: buildSlivers(context));
  }
}

class _PrizeTotalCard extends StatelessWidget {
  const _PrizeTotalCard({
    required this.eventTotalLabel,
    required this.categoriesCount,
    required this.firstPlaceTotalLabel,
  });

  final String eventTotalLabel;
  final int categoriesCount;
  final String firstPlaceTotalLabel;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(20, 16, 20, 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'PRÊMIO TOTAL',
                  style: AppTypography.mono(
                    fontSize: 10,
                    color: AppColors.brand,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.8,
                  ),
                ),
                SizedBox(height: 8),
                Text(
                  eventTotalLabel,
                  style: AppTypography.soraRegular(
                    fontSize: 28,
                    fontWeight: FontWeight.w900,
                    color: AppColors.brand,
                    height: 1,
                    letterSpacing: -0.6,
                  ),
                ),
              ],
            ),
          ),
          SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '$categoriesCount ${categoriesCount == 1 ? 'categoria' : 'categorias'}',
                style: AppTypography.soraRegular(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: context.themeColors.onSurface,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CategoryPrizesCard extends StatelessWidget {
  const _CategoryPrizesCard({required this.offer});

  final TournamentCategoryOffer offer;

  @override
  Widget build(BuildContext context) {
    final prizeRows = categoryPrizeRows(offer);
    final totalValue = tournamentCategoryPrizesTotal(offer);
    final subtitle = tournamentCategoryPrizeSubtitle(offer);

    return Container(
      margin: const EdgeInsets.fromLTRB(20, 0, 20, 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      offer.name,
                      style: AppTypography.soraRegular(
                        fontSize: 17,
                        fontWeight: FontWeight.w900,
                        color: context.themeColors.onSurface,
                      ),
                    ),
                    if (subtitle.isNotEmpty) ...[
                      SizedBox(height: 4),
                      Text(
                        subtitle,
                        style: AppTypography.soraRegular(
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          color: context.themeColors.onSurfaceMuted,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    'TOTAL',
                    style: AppTypography.mono(
                      fontSize: 10,
                      color: context.themeColors.onSurfaceMuted,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.8,
                    ),
                  ),
                  SizedBox(height: 2),
                  Text(
                    prizeRows.isEmpty ? '—' : formatMoney(totalValue),
                    style: AppTypography.soraRegular(
                      fontSize: 17,
                      fontWeight: FontWeight.w900,
                      color: AppColors.brand,
                      height: 1.1,
                    ),
                  ),
                ],
              ),
            ],
          ),
          if (prizeRows.isEmpty) ...[
            SizedBox(height: 12),
            Text(
              'Premiação desta categoria será publicada em breve.',
              style: AppTypography.soraRegular(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          ] else ...[
            SizedBox(height: 14),
            Divider(
              height: 1,
              thickness: 1,
              color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
            ),
            SizedBox(height: 12),
            for (var i = 0; i < prizeRows.length; i++) ...[
              if (i > 0)
                Divider(
                  height: 24,
                  thickness: 1,
                  color: context.themeColors.onSurfaceMuted.withValues(
                    alpha: 0.12,
                  ),
                ),
              _PrizeRow(
                row: prizeRows[i],
                placeOrder: _extractPositionNumber(prizeRows[i].positionLabel),
              ),
            ],
          ],
        ],
      ),
    );
  }
}

class _PrizeRow extends StatelessWidget {
  const _PrizeRow({required this.row, required this.placeOrder});

  final CategoryPrizeRow row;
  final int placeOrder;

  @override
  Widget build(BuildContext context) {
    final style = _placeVisualStyle(context, placeOrder, row.highlight);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        _PositionBadge(placeOrder: placeOrder, style: style),
        SizedBox(width: 12),
        Expanded(
          child: Text(
            row.positionLabel,
            style: AppTypography.soraRegular(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: style.labelColor,
            ),
          ),
        ),
        Text(
          row.amountLabel,
          style: AppTypography.soraRegular(
            fontSize: 14,
            fontWeight: FontWeight.w800,
            color: style.amountColor,
          ),
        ),
      ],
    );
  }
}

class _PlaceVisualStyle {
  const _PlaceVisualStyle({
    required this.labelColor,
    required this.amountColor,
    required this.badgeBackground,
    required this.badgeBorder,
    required this.badgeTextColor,
  });

  final Color labelColor;
  final Color amountColor;
  final Color badgeBackground;
  final Color badgeBorder;
  final Color badgeTextColor;
}

_PlaceVisualStyle _placeVisualStyle(
  BuildContext context,
  int placeOrder,
  bool highlight,
) {
  final colors = context.themeColors;
  if (highlight || placeOrder == 1) {
    return _PlaceVisualStyle(
      labelColor: AppColors.brand,
      amountColor: AppColors.brand,
      badgeBackground: AppColors.brand.withValues(alpha: 0.12),
      badgeBorder: AppColors.brand.withValues(alpha: 0.55),
      badgeTextColor: AppColors.brand,
    );
  }
  if (placeOrder == 2) {
    return _PlaceVisualStyle(
      labelColor: colors.onSurface,
      amountColor: colors.onSurface,
      badgeBackground: colors.surfaceCard,
      badgeBorder: colors.onSurfaceMuted.withValues(alpha: 0.28),
      badgeTextColor: colors.onSurfaceMuted,
    );
  }
  return _PlaceVisualStyle(
    labelColor: colors.onSurfaceMuted.withValues(alpha: 0.75),
    amountColor: colors.onSurfaceMuted.withValues(alpha: 0.65),
    badgeBackground: colors.surfaceCard,
    badgeBorder: colors.onSurfaceMuted.withValues(alpha: 0.15),
    badgeTextColor: colors.onSurfaceMuted.withValues(alpha: 0.55),
  );
}

class _PositionBadge extends StatelessWidget {
  const _PositionBadge({required this.placeOrder, required this.style});

  final int placeOrder;
  final _PlaceVisualStyle style;

  @override
  Widget build(BuildContext context) {
    final label = placeOrder > 0 ? '$placeOrderº' : '—';

    return Container(
      width: 34,
      height: 34,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: style.badgeBackground,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: style.badgeBorder),
      ),
      child: Text(
        label,
        style: AppTypography.soraRegular(
          fontSize: 13,
          fontWeight: FontWeight.w800,
          color: style.badgeTextColor,
          height: 1,
        ),
      ),
    );
  }
}

class _EmptyCategoriesMessage extends StatelessWidget {
  const _EmptyCategoriesMessage();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Text(
        'As categorias e premiações serão publicadas em breve pelo organizador.',
        style: AppTypography.soraRegular(
          fontSize: 14,
          fontWeight: FontWeight.w500,
          color: context.themeColors.onSurfaceMuted,
        ),
      ),
    );
  }
}

int _extractPositionNumber(String positionLabel) {
  final digits = positionLabel.codeUnits
      .where((c) => c >= 48 && c <= 57)
      .toList();
  if (digits.isEmpty) return 0;
  return int.tryParse(String.fromCharCodes(digits)) ?? 0;
}
