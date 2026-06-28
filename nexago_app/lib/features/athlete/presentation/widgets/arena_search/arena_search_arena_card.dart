import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/formatting/app_currency_format.dart';
import '../../../../arenas/domain/arena_list_item.dart';
import '../../../../arenas/domain/arena_search_filter_logic.dart';
import '../../../../arenas/domain/arena_search_filters.dart';
import '../../../../arenas/domain/nearby_arenas_logic.dart';
import 'arena_search_highlight.dart';
import 'arena_search_sport_chips.dart';

class ArenaSearchArenaCard extends StatelessWidget {
  const ArenaSearchArenaCard({
    super.key,
    required this.item,
    required this.searchQuery,
    required this.isFavorite,
    required this.isFavoritePending,
    required this.isBestPrice,
    required this.selectedSportChip,
    required this.onOpenArena,
    required this.onToggleFavorite,
    required this.onReserve,
  });

  final FilteredArenaSearchResult item;
  final String searchQuery;
  final bool isFavorite;
  final bool isFavoritePending;
  final bool isBestPrice;
  final ArenaSportChip selectedSportChip;
  final VoidCallback onOpenArena;
  final VoidCallback? onToggleFavorite;
  final VoidCallback? onReserve;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final result = item.result;
    final arena = result.arena;
    final place = arenaPlaceFields(arena);
    final location =
        '${place.city}${place.state.isNotEmpty ? ', ${place.state}' : ''}';
    final courts = result.availableCourtsCount;
    final courtsLabel = courts == 1 ? '1 QUADRA' : '$courts QUADRAS';
    final kmLabel = item.kmDistance != null
        ? '${item.kmDistance!.toStringAsFixed(1)} km'
        : '—';
    final priceValue = formatBRLWhole(result.displayPricePerHourReais);
    final rating = arena.ratingAverage > 0
        ? arena.ratingAverage.toStringAsFixed(1)
        : '—';
    final reviews = arena.reviewsCount;
    final score = arena.reputationScore;
    final slot = result.selectedSlot;
    final slotMessage = switch ((result.isExactMatch, slot != null)) {
      (true, true) => slot!.startTime,
      (false, true) => slot!.startTime,
      _ => '—',
    };
    final courtLine = result.courtName != null && result.courtName!.isNotEmpty
        ? '${result.courtName}${result.minutesDistance != null && result.minutesDistance! > 0 ? ' · em ${result.minutesDistance} min' : ''}'
        : 'Sem horário no dia';

    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(16),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onOpenArena,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _HeroImage(
              arena: arena,
              courtsLabel: courtsLabel,
              kmLabel: kmLabel,
              isFavorite: isFavorite,
              isFavoritePending: isFavoritePending,
              isBestPrice: isBestPrice && result.hasAvailability,
              onToggleFavorite: onToggleFavorite,
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
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
                            Text.rich(
                              buildArenaSearchHighlightedName(
                                context,
                                arena.name,
                                searchQuery,
                                baseStyle: theme.textTheme.titleMedium
                                    ?.copyWith(
                                      fontWeight: FontWeight.w900,
                                      color: context.themeColors.onSurface,
                                    ),
                              ),
                            ),
                            SizedBox(height: 4),
                            Text(
                              location,
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: context.themeColors.onSurfaceMuted,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                            SizedBox(height: 8),
                            Row(
                              children: [
                                Icon(
                                  Icons.star_rounded,
                                  size: 16,
                                  color: AppColors.pending,
                                ),
                                SizedBox(width: 4),
                                Text(
                                  rating,
                                  style: theme.textTheme.labelSmall?.copyWith(
                                    fontWeight: FontWeight.w800,
                                    color: context.themeColors.onSurface,
                                  ),
                                ),
                                SizedBox(width: 4),
                                Text(
                                  reviews > 0 ? '($reviews av.)' : '(sem av.)',
                                  style: theme.textTheme.labelSmall?.copyWith(
                                    fontWeight: FontWeight.w600,
                                    color: context.themeColors.onSurfaceMuted,
                                  ),
                                ),
                                SizedBox(width: 12),
                                Icon(
                                  Icons.emoji_events_outlined,
                                  size: 16,
                                  color: AppColors.brand,
                                ),
                                SizedBox(width: 4),
                                Text(
                                  'Score',
                                  style: theme.textTheme.labelSmall?.copyWith(
                                    fontWeight: FontWeight.w700,
                                    color: context.themeColors.onSurface,
                                  ),
                                ),
                                SizedBox(width: 4),
                                Text(
                                  '$score',
                                  style: theme.textTheme.labelSmall?.copyWith(
                                    fontWeight: FontWeight.w900,
                                    color: AppColors.brand,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      SizedBox(width: 12),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            'A PARTIR DE',
                            style: AppTypography.mono(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.6,
                              color: context.themeColors.onSurfaceMuted,
                            ),
                          ),
                          SizedBox(height: 2),
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.baseline,
                            textBaseline: TextBaseline.alphabetic,
                            children: [
                              Text(
                                priceValue,
                                style: AppTypography.mono(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 22,
                                  color: context.themeColors.onSurface,
                                  height: 1,
                                ),
                              ),
                              Text(
                                '/h',
                                style: theme.textTheme.bodySmall?.copyWith(
                                  fontWeight: FontWeight.w600,
                                  color: context.themeColors.onSurfaceMuted,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ],
                  ),
                  SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: context.themeColors.surfaceRaised,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 36,
                          height: 36,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: AppColors.brand.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Icon(
                            arenaSearchSportChipIcon(selectedSportChip),
                            color: AppColors.brand,
                            size: 20,
                          ),
                        ),
                        SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                result.hasAvailability
                                    ? 'Próximo: $slotMessage'
                                    : 'Sem disponibilidade',
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  fontWeight: FontWeight.w800,
                                  color: result.hasAvailability
                                      ? AppColors.brand
                                      : context.themeColors.onSurfaceMuted,
                                ),
                              ),
                              Text(
                                courtLine,
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: context.themeColors.onSurfaceMuted,
                                ),
                              ),
                            ],
                          ),
                        ),
                        SizedBox(width: 8),
                        FilledButton(
                          onPressed: onReserve,
                          style: FilledButton.styleFrom(
                            backgroundColor: AppColors.brand,
                            foregroundColor: AppColors.black,
                            padding: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 10,
                            ),
                          ),
                          child: Text(
                            'Reservar',
                            style: TextStyle(fontWeight: FontWeight.w800),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HeroImage extends StatelessWidget {
  const _HeroImage({
    required this.arena,
    required this.courtsLabel,
    required this.kmLabel,
    required this.isFavorite,
    required this.isFavoritePending,
    required this.isBestPrice,
    required this.onToggleFavorite,
  });

  final ArenaListItem arena;
  final String courtsLabel;
  final String kmLabel;
  final bool isFavorite;
  final bool isFavoritePending;
  final bool isBestPrice;
  final VoidCallback? onToggleFavorite;

  @override
  Widget build(BuildContext context) {
    final cover = arena.coverUrl;
    final hasCover = cover != null && cover.isNotEmpty;

    return SizedBox(
      height: 140,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (hasCover)
            CachedNetworkImage(imageUrl: cover, fit: BoxFit.cover)
          else
            ColoredBox(color: arenaSearchTintColor(arena.id)),
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Colors.black.withValues(alpha: 0.05),
                  Colors.black.withValues(alpha: 0.45),
                ],
              ),
            ),
          ),
          Positioned(left: 10, top: 10, child: _Pill(label: courtsLabel)),
          Positioned(
            right: 10,
            top: 10,
            child: Row(
              children: [
                _Pill(label: kmLabel),
                SizedBox(width: 8),
                _FavoriteIcon(
                  isFavorite: isFavorite,
                  isPending: isFavoritePending,
                  onTap: onToggleFavorite,
                ),
              ],
            ),
          ),
          if (isBestPrice)
            Positioned(
              left: 10,
              bottom: 10,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.brand,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.bolt_rounded, size: 14, color: AppColors.black),
                    SizedBox(width: 4),
                    Text(
                      'MELHOR PREÇO',
                      style: TextStyle(
                        fontWeight: FontWeight.w900,
                        fontSize: 10,
                        color: AppColors.black,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: AppTypography.mono(
          color: AppColors.white,
          fontWeight: FontWeight.w800,
          fontSize: 12,
        ),
      ),
    );
  }
}

class _FavoriteIcon extends StatelessWidget {
  const _FavoriteIcon({
    required this.isFavorite,
    required this.isPending,
    required this.onTap,
  });

  final bool isFavorite;
  final bool isPending;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.black.withValues(alpha: 0.4),
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Padding(
          padding: const EdgeInsets.all(6),
          child: isPending
              ? SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.white,
                  ),
                )
              : Icon(
                  isFavorite ? Icons.favorite : Icons.favorite_border,
                  color: isFavorite ? const Color(0xFFE53935) : AppColors.white,
                  size: 20,
                ),
        ),
      ),
    );
  }
}
