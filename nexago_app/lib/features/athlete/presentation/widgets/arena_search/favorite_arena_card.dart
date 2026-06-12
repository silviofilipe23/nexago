import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../arenas/domain/arena_list_item.dart';
import 'arena_search_highlight.dart';

class FavoriteArenaCard extends StatelessWidget {
  const FavoriteArenaCard({
    super.key,
    required this.arena,
    required this.onTap,
    this.searchQuery = '',
    this.isFavoritePending = false,
    this.onToggleFavorite,
    this.nextSlotLabel,
    this.onReserve,
    this.width,
    this.height = 140,
  });

  final ArenaListItem arena;
  final VoidCallback onTap;
  final String searchQuery;
  final bool isFavoritePending;
  final VoidCallback? onToggleFavorite;
  final String? nextSlotLabel;
  final VoidCallback? onReserve;
  final double? width;
  final double height;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final rating = arena.ratingAverage;
    final ratingLabel = rating > 0
        ? NumberFormat.decimalPattern('pt_BR').format(rating)
        : '—';
    final cover = arena.coverUrl;
    final hasCover = cover != null && cover.isNotEmpty;
    final showReserve =
        onReserve != null && nextSlotLabel != null && nextSlotLabel!.isNotEmpty;

    final card = Material(
      color: context.themeColors.surfaceRaised,
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
                      Colors.black.withValues(alpha: 0.12),
                      Colors.black.withValues(alpha: showReserve ? 0.82 : 0.68),
                    ],
                  ),
                ),
              ),
            ),
            Positioned(
              top: 8,
              right: 8,
              child: FavoriteArenaHeartButton(
                isPending: isFavoritePending,
                onTap: onToggleFavorite,
              ),
            ),
            Positioned(
              left: 12,
              right: 12,
              bottom: showReserve ? 52 : 12,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
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
            if (showReserve)
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: Container(
                  padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                  color: Colors.black.withValues(alpha: 0.45),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Próximo: $nextSlotLabel',
                          style: theme.textTheme.labelMedium?.copyWith(
                            color: AppColors.white,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      FilledButton(
                        onPressed: onReserve,
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.brand,
                          foregroundColor: AppColors.black,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 8,
                          ),
                          minimumSize: Size.zero,
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        child: const Text(
                          'Reservar',
                          style: TextStyle(fontWeight: FontWeight.w800),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );

    if (width != null) {
      return SizedBox(width: width, height: height, child: card);
    }
    return SizedBox(height: height, child: card);
  }
}

class FavoriteArenaHeartButton extends StatelessWidget {
  const FavoriteArenaHeartButton({
    super.key,
    required this.isPending,
    this.onTap,
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
              : const Icon(Icons.favorite, color: Color(0xFFE53935), size: 18),
        ),
      ),
    );
  }
}
