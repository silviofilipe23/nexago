import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../arenas/domain/arena_list_item.dart';
import '../../../../arenas/domain/arena_search_filter_logic.dart';
import 'arena_search_highlight.dart';
import 'arena_search_section_header.dart';

class ArenaSearchFavoritesStrip extends StatelessWidget {
  const ArenaSearchFavoritesStrip({
    super.key,
    required this.items,
    required this.searchQuery,
    required this.onViewAll,
    required this.onArenaTap,
    required this.onToggleFavorite,
    required this.isFavoritePending,
  });

  final List<FilteredArenaSearchResult> items;
  final String searchQuery;
  final VoidCallback onViewAll;
  final void Function(ArenaListItem arena) onArenaTap;
  final void Function(String arenaId, bool isFavorite) onToggleFavorite;
  final bool Function(String arenaId) isFavoritePending;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ArenaSearchSectionHeader(
          title: 'SUAS ARENAS FAVORITAS',
          trailingAccent: '· ${items.length}',
          trailingLabel: 'ver todas',
          onTrailingTap: onViewAll,
        ),
        const SizedBox(height: 10),
        SizedBox(
          height: 120,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: items.length,
            separatorBuilder: (_, _) => const SizedBox(width: 10),
            itemBuilder: (context, index) {
              final item = items[index];
              final arena = item.result.arena;
              return _FavoriteMiniCard(
                arena: arena,
                rating: arena.ratingAverage,
                searchQuery: searchQuery,
                isPending: isFavoritePending(arena.id),
                onTap: () => onArenaTap(arena),
                onToggleFavorite: isFavoritePending(arena.id)
                    ? null
                    : () => onToggleFavorite(arena.id, true),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _FavoriteMiniCard extends StatelessWidget {
  const _FavoriteMiniCard({
    required this.arena,
    required this.rating,
    required this.searchQuery,
    required this.onTap,
    required this.isPending,
    required this.onToggleFavorite,
  });

  final ArenaListItem arena;
  final double rating;
  final String searchQuery;
  final VoidCallback onTap;
  final bool isPending;
  final VoidCallback? onToggleFavorite;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final ratingLabel = rating > 0
        ? NumberFormat.decimalPattern('pt_BR').format(rating)
        : '—';

    final cover = arena.coverUrl;
    final hasCover = cover != null && cover.isNotEmpty;

    return SizedBox(
      width: 160,
      child: Material(
        color: AppColors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (hasCover)
                CachedNetworkImage(imageUrl: cover, fit: BoxFit.cover)
              else
                ColoredBox(color: arenaSearchTintColor(arena.id)),
              Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.black.withValues(alpha: 0.15),
                        Colors.black.withValues(alpha: 0.65),
                      ],
                    ),
                  ),
                ),
              ),
              Positioned(
                top: 8,
                right: 8,
                child: _FavoriteButton(
                  isPending: isPending,
                  onTap: onToggleFavorite,
                ),
              ),
              Positioned(
                left: 10,
                right: 10,
                bottom: 10,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text.rich(
                      buildArenaSearchHighlightedName(
                        context,
                        arena.name,
                        searchQuery,
                        baseStyle: theme.textTheme.titleSmall?.copyWith(
                          color: AppColors.white,
                          fontWeight: FontWeight.w800,
                        ),
                        highlightColor: AppColors.brand,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        const Icon(
                          Icons.star_rounded,
                          size: 14,
                          color: AppColors.pending,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          ratingLabel,
                          style: theme.textTheme.labelSmall?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: AppColors.white,
                          ),
                        ),
                      ],
                    ),
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

class _FavoriteButton extends StatelessWidget {
  const _FavoriteButton({
    required this.isPending,
    required this.onTap,
  });

  final bool isPending;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.black.withValues(alpha: 0.35),
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Padding(
          padding: const EdgeInsets.all(6),
          child: isPending
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.white,
                  ),
                )
              : const Icon(
                  Icons.favorite,
                  color: Color(0xFFE53935),
                  size: 18,
                ),
        ),
      ),
    );
  }
}
