import 'package:flutter/material.dart';

import '../../../../arenas/data/arena_contact_service.dart';
import '../../../../arenas/domain/arena_search_filter_logic.dart';
import '../../../../arenas/domain/arena_search_filters.dart';
import 'arena_search_arena_card.dart';
import 'arena_search_unclaimed_card.dart';

/// Um resultado da busca, no card certo para o que ele é.
///
/// A escolha entre arena parceira e pré-cadastrada vivia solta no meio da
/// página. Isolada aqui, mapa e lista mostram a mesma coisa sem repetir a
/// regra em dois lugares.
class ArenaSearchResultTile extends StatelessWidget {
  const ArenaSearchResultTile({
    super.key,
    required this.item,
    required this.searchQuery,
    required this.selectedSportChip,
    required this.isFavorite,
    required this.isFavoritePending,
    required this.isBestPrice,
    required this.onOpenArena,
    this.onToggleFavorite,
    this.onReserve,
    this.onContactUnclaimed,
  });

  final FilteredArenaSearchResult item;
  final String searchQuery;
  final ArenaSportChip selectedSportChip;
  final bool isFavorite;
  final bool isFavoritePending;
  final bool isBestPrice;

  final VoidCallback onOpenArena;
  final VoidCallback? onToggleFavorite;
  final VoidCallback? onReserve;

  /// Recebe `arenaId` e a URL do WhatsApp já montada.
  final void Function(String arenaId, String whatsAppUrl)? onContactUnclaimed;

  @override
  Widget build(BuildContext context) {
    final arena = item.result.arena;

    // Arena pré-cadastrada não tem reserva, favorito nem preço: o único
    // caminho que existe é o contato.
    if (arena.isUnclaimed) {
      final contactUrl = ArenaContactService.whatsAppUrlFor(arena);
      return ArenaSearchUnclaimedCard(
        arena: arena,
        searchQuery: searchQuery,
        kmDistance: item.kmDistance,
        onContact: contactUrl == null || onContactUnclaimed == null
            ? null
            : () => onContactUnclaimed!(arena.id, contactUrl),
      );
    }

    return ArenaSearchArenaCard(
      item: item,
      searchQuery: searchQuery,
      selectedSportChip: selectedSportChip,
      isFavorite: isFavorite,
      isFavoritePending: isFavoritePending,
      isBestPrice: isBestPrice,
      onOpenArena: onOpenArena,
      onToggleFavorite: isFavoritePending ? null : onToggleFavorite,
      onReserve: onReserve,
    );
  }
}
