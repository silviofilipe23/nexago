import 'package:flutter/material.dart';

import '../../../../arenas/domain/arena_list_item.dart';
import '../../../../arenas/domain/arena_search_filter_logic.dart';
import 'arena_search_section_header.dart';
import 'favorite_arena_card.dart';

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
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (context, index) {
              final item = items[index];
              final arena = item.result.arena;
              return FavoriteArenaCard(
                arena: arena,
                width: 160,
                height: 120,
                searchQuery: searchQuery,
                isFavoritePending: isFavoritePending(arena.id),
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
