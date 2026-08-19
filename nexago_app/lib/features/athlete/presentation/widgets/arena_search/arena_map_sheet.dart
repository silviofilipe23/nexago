import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollDirection;

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/ui/app_status_views.dart';
import '../../../../arenas/domain/arena_search_filter_logic.dart';
import '../../../../arenas/domain/arena_search_filters.dart';
import 'arena_search_result_tile.dart';
import 'arena_search_section_header.dart';
import 'arena_search_signup_cta_card.dart';

/// A lista de arenas deve estar na tela?
///
/// Ela não fica sempre visível: sobre o mapa, uma lista permanente rouba a
/// metade de baixo sem ninguém ter pedido. Aparece quando o atleta digita algo
/// — ou quando ele toca num pino, que abre o card daquela arena.
///
/// Filtro aplicado NÃO abre a lista de propósito: filtrar muda os pinos do
/// mapa, que é onde o atleta está olhando.
///
/// Consequência aceita: arena sem coordenada não tem pino e só aparece na
/// lista, então ela fica fora da tela até alguém pesquisar pelo nome.
bool shouldShowArenaList({
  required String query,
  required bool hasFocusedArena,
}) {
  return hasFocusedArena || query.trim().isNotEmpty;
}

/// Tudo que a lista precisa saber sobre um resultado além do próprio dado.
///
/// Existe para a lista não receber cinco mapas soltos e ter que cruzá-los na
/// hora de desenhar.
class ArenaSheetItemState {
  const ArenaSheetItemState({
    required this.isFavorite,
    required this.isFavoritePending,
    required this.isBestPrice,
  });

  final bool isFavorite;
  final bool isFavoritePending;
  final bool isBestPrice;
}

/// Ações que a lista de resultados dispara. Agrupadas porque viajam sempre
/// juntas, do sheet ao fallback.
class ArenaResultsCallbacks {
  const ArenaResultsCallbacks({
    required this.onOpenArena,
    required this.onSortTap,
    required this.onSignupTap,
    required this.onToggleFavorite,
    required this.onReserve,
    required this.onContactUnclaimed,
    required this.onShowAllArenas,
    required this.onOpenFilters,
  });

  final ValueChanged<FilteredArenaSearchResult> onOpenArena;
  final VoidCallback onSortTap;
  final VoidCallback onSignupTap;
  final ValueChanged<FilteredArenaSearchResult> onToggleFavorite;
  final ValueChanged<FilteredArenaSearchResult> onReserve;
  final void Function(String arenaId, String whatsAppUrl) onContactUnclaimed;
  final VoidCallback onShowAllArenas;
  final VoidCallback onOpenFilters;
}

/// A lista de arenas do resultado da busca.
///
/// Uma só implementação serve ao sheet do mapa e ao fallback sem mapa — é o
/// que garante que as duas telas mostrem exatamente o mesmo conteúdo.
class ArenaResultsList extends StatelessWidget {
  ArenaResultsList({
    super.key,
    required this.items,
    required this.offMapItems,
    required this.searchQuery,
    required this.selectedSportChip,
    required this.stateFor,
    required this.callbacks,
    this.scrollController,
    this.showHandle = true,
    this.hiddenByFiltersCount = 0,
    this.bottomInset = 0,
  }) : assert(
          !_overlaps(items, offMapItems),
          'A mesma arena não pode estar nas duas seções: quem chama já deve '
          'ter separado quem tem pino de quem não tem.',
        );

  /// Só roda em debug (asserts somem em release).
  static bool _overlaps(
    List<FilteredArenaSearchResult> a,
    List<FilteredArenaSearchResult> b,
  ) {
    if (a.isEmpty || b.isEmpty) return false;
    final ids = a.map((e) => e.result.arena.id).toSet();
    return b.any((e) => ids.contains(e.result.arena.id));
  }

  /// Resultados que também aparecem como pino no mapa.
  final List<FilteredArenaSearchResult> items;

  /// Resultados sem coordenada — existem só aqui.
  final List<FilteredArenaSearchResult> offMapItems;

  final String searchQuery;
  final ArenaSportChip selectedSportChip;
  final ArenaSheetItemState Function(String arenaId) stateFor;
  final ArenaResultsCallbacks callbacks;

  final ScrollController? scrollController;

  /// A alça de arrastar. Fora do sheet ela mente: não há o que arrastar.
  final bool showHandle;

  /// Quantas arenas existem na base mas foram escondidas pelos filtros.
  final int hiddenByFiltersCount;

  final double bottomInset;

  int get _totalCount => items.length + offMapItems.length;

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      controller: scrollController,
      slivers: [
        SliverToBoxAdapter(
          child: _SheetHeader(
            count: _totalCount,
            showHandle: showHandle,
            onSortTap: callbacks.onSortTap,
          ),
        ),
        if (_totalCount == 0)
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
            sliver: SliverToBoxAdapter(
              child: _EmptyResults(
                hiddenCount: hiddenByFiltersCount,
                onShowAll: callbacks.onShowAllArenas,
                onOpenFilters: callbacks.onOpenFilters,
                onSignupTap: callbacks.onSignupTap,
              ),
            ),
          ),
        if (items.isNotEmpty)
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 0),
            sliver: SliverList.separated(
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(height: 16),
              itemBuilder: (context, index) => _tile(items[index]),
            ),
          ),
        if (offMapItems.isNotEmpty) ...[
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 8),
            sliver: SliverToBoxAdapter(
              child: ArenaSearchSectionHeader(
                title: 'Sem localização no mapa',
                trailingAccent: '· ${offMapItems.length}',
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
            sliver: SliverList.separated(
              itemCount: offMapItems.length,
              separatorBuilder: (_, __) => const SizedBox(height: 16),
              itemBuilder: (context, index) => _tile(offMapItems[index]),
            ),
          ),
        ],
        if (_totalCount > 0)
          SliverPadding(
            padding: EdgeInsets.fromLTRB(20, 24, 20, 24 + bottomInset),
            sliver: SliverToBoxAdapter(
              child: ArenaSearchSignupCtaCard(onTap: callbacks.onSignupTap),
            ),
          )
        else
          SliverToBoxAdapter(child: SizedBox(height: 24 + bottomInset)),
      ],
    );
  }

  Widget _tile(FilteredArenaSearchResult item) {
    final state = stateFor(item.result.arena.id);
    return ArenaSearchResultTile(
      item: item,
      searchQuery: searchQuery,
      selectedSportChip: selectedSportChip,
      isFavorite: state.isFavorite,
      isFavoritePending: state.isFavoritePending,
      isBestPrice: state.isBestPrice,
      onOpenArena: () => callbacks.onOpenArena(item),
      onToggleFavorite: () => callbacks.onToggleFavorite(item),
      onReserve:
          item.result.hasAvailability ? () => callbacks.onReserve(item) : null,
      onContactUnclaimed: callbacks.onContactUnclaimed,
    );
  }
}

/// A lista de arenas que mora sobre o mapa, arrastável.
///
/// Com [focusedItem] ela vira um card só — o da arena cujo pino foi tocado.
/// Sem isso, tocar num pino obrigaria a rolar uma lista longa atrás do card
/// correspondente.
class ArenaMapSheet extends StatefulWidget {
  const ArenaMapSheet({
    super.key,
    required this.list,
    required this.stateFor,
    required this.callbacks,
    required this.searchQuery,
    required this.selectedSportChip,
    this.focusedItem,
    this.onClearFocus,
    this.initialSize = 0.32,
    this.bottomInset = 0,
  });

  final ArenaResultsList Function(ScrollController controller) list;
  final ArenaSheetItemState Function(String arenaId) stateFor;
  final ArenaResultsCallbacks callbacks;
  final String searchQuery;
  final ArenaSportChip selectedSportChip;

  final FilteredArenaSearchResult? focusedItem;
  final VoidCallback? onClearFocus;

  /// Altura de descanso — para onde "minimizar" leva o sheet de volta.
  final double initialSize;

  /// Altura da barra de navegação do shell, para o último card não nascer
  /// debaixo dela.
  final double bottomInset;

  @override
  State<ArenaMapSheet> createState() => _ArenaMapSheetState();
}

class _ArenaMapSheetState extends State<ArenaMapSheet> {
  /// Existe só para o botão de minimizar: sem ele não há como recolher o
  /// sheet por código, apenas arrastando.
  final DraggableScrollableController _drag = DraggableScrollableController();

  double _extent = 0;
  bool _scrolledUp = false;

  @override
  void initState() {
    super.initState();
    _extent = widget.initialSize;
  }

  @override
  void dispose() {
    _drag.dispose();
    super.dispose();
  }

  /// Só faz sentido oferecer "minimizar" quando há o que recolher.
  bool get _showMinimize => _scrolledUp && _extent > widget.initialSize + 0.02;

  bool _onScroll(UserScrollNotification notification) {
    // `forward` é o dedo descendo, ou seja, a lista subindo de volta. Arrastar
    // o sheet para cima conta como `reverse`, então expandir NÃO faz o botão
    // nascer — ele aparece quando o atleta volta ao topo, que é o momento em
    // que ele quer sair da lista.
    final next = switch (notification.direction) {
      ScrollDirection.forward => true,
      ScrollDirection.reverse => false,
      ScrollDirection.idle => _scrolledUp,
    };
    if (next != _scrolledUp) setState(() => _scrolledUp = next);
    return false;
  }

  bool _onExtent(DraggableScrollableNotification notification) {
    if ((notification.extent - _extent).abs() < 0.005) return false;
    setState(() => _extent = notification.extent);
    return false;
  }

  Future<void> _minimize() async {
    setState(() => _scrolledUp = false);
    if (!_drag.isAttached) return;
    await _drag.animateTo(
      widget.initialSize,
      duration: const Duration(milliseconds: 260),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    final focused = widget.focusedItem;
    if (focused != null) {
      return _FocusedCard(
        item: focused,
        searchQuery: widget.searchQuery,
        selectedSportChip: widget.selectedSportChip,
        state: widget.stateFor(focused.result.arena.id),
        bottomInset: widget.bottomInset,
        onClose: widget.onClearFocus,
        onOpenArena: () => widget.callbacks.onOpenArena(focused),
        onToggleFavorite: () => widget.callbacks.onToggleFavorite(focused),
        onReserve: focused.result.hasAvailability
            ? () => widget.callbacks.onReserve(focused)
            : null,
        onContactUnclaimed: widget.callbacks.onContactUnclaimed,
      );
    }

    return Stack(
      children: [
        NotificationListener<DraggableScrollableNotification>(
          onNotification: _onExtent,
          child: NotificationListener<UserScrollNotification>(
            onNotification: _onScroll,
            child: DraggableScrollableSheet(
              controller: _drag,
              initialChildSize: widget.initialSize,
              minChildSize: 0.14,
              maxChildSize: 0.92,
              snap: true,
              snapSizes: const [0.14, 0.32, 0.92],
              builder: (context, scrollController) {
                return _SheetSurface(child: widget.list(scrollController));
              },
            ),
          ),
        ),
        if (_showMinimize)
          Positioned(
            left: 0,
            right: 0,
            // Flutua logo acima da borda do sheet, acompanhando o arrasto.
            bottom: MediaQuery.sizeOf(context).height * _extent + 8,
            child: Center(child: _MinimizeChip(onTap: _minimize)),
          ),
      ],
    );
  }
}

/// A pastilha que recolhe a lista.
class _MinimizeChip extends StatelessWidget {
  const _MinimizeChip({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Material(
      color: colors.surfaceCard,
      borderRadius: BorderRadius.circular(20),
      clipBehavior: Clip.antiAlias,
      elevation: 4,
      shadowColor: AppColors.black.withValues(alpha: 0.3),
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 7, 14, 7),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.keyboard_arrow_down_rounded,
                size: 18,
                color: colors.onSurface,
              ),
              const SizedBox(width: 4),
              Text(
                'Minimizar',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: colors.onSurface,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SheetSurface extends StatelessWidget {
  const _SheetSurface({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.canvas,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        boxShadow: [
          BoxShadow(
            color: AppColors.black.withValues(alpha: 0.22),
            blurRadius: 24,
            offset: const Offset(0, -6),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        child: child,
      ),
    );
  }
}

class _SheetHandle extends StatelessWidget {
  const _SheetHandle();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: 40,
        height: 4,
        margin: const EdgeInsets.only(top: 10, bottom: 6),
        decoration: BoxDecoration(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.4),
          borderRadius: BorderRadius.circular(2),
        ),
      ),
    );
  }
}

class _SheetHeader extends StatelessWidget {
  const _SheetHeader({
    required this.count,
    required this.showHandle,
    required this.onSortTap,
  });

  final int count;
  final bool showHandle;
  final VoidCallback onSortTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        if (showHandle) const _SheetHandle() else const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 6, 20, 4),
          child: ArenaSearchSectionHeader(
            title: count == 1 ? '1 arena' : '$count arenas',
            trailingLabel: count == 0 ? null : 'ordenar',
            onTrailingTap: count == 0 ? null : onSortTap,
          ),
        ),
      ],
    );
  }
}

class _EmptyResults extends StatelessWidget {
  const _EmptyResults({
    required this.hiddenCount,
    required this.onShowAll,
    required this.onOpenFilters,
    required this.onSignupTap,
  });

  final int hiddenCount;
  final VoidCallback onShowAll;
  final VoidCallback onOpenFilters;
  final VoidCallback onSignupTap;

  @override
  Widget build(BuildContext context) {
    final filtered = hiddenCount > 0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (filtered) ...[
          _FiltersHiddenBanner(
            hiddenCount: hiddenCount,
            onShowAll: onShowAll,
            onOpenFilters: onOpenFilters,
          ),
          const SizedBox(height: 16),
        ],
        // A tela vazia é onde um dono de arena mais provavelmente se
        // reconhece — o vazio é literalmente o que ele preencheria.
        AppEmptyView(
          icon: filtered ? Icons.tune_rounded : Icons.heart_broken_outlined,
          title: filtered
              ? 'Filtros ocultaram as arenas'
              : 'Nenhuma arena encontrada',
          subtitle: filtered
              ? 'Temos $hiddenCount arena${hiddenCount == 1 ? '' : 's'} na base, '
                  'mas nenhuma passou nos filtros atuais. Tem uma arena por aqui?'
              : 'Ajuste filtros, data ou horário para ver mais opções. '
                  'Tem uma arena por aqui?',
          actionLabel: 'Quero cadastrar minha arena',
          onAction: onSignupTap,
        ),
      ],
    );
  }
}

class _FiltersHiddenBanner extends StatelessWidget {
  const _FiltersHiddenBanner({
    required this.hiddenCount,
    required this.onShowAll,
    required this.onOpenFilters,
  });

  final int hiddenCount;
  final VoidCallback onShowAll;
  final VoidCallback onOpenFilters;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '$hiddenCount arena${hiddenCount == 1 ? '' : 's'} '
            'oculta${hiddenCount == 1 ? '' : 's'} pelos filtros',
            style: TextStyle(
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurface,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: onOpenFilters,
                  child: const Text('Ajustar filtros'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: FilledButton(
                  onPressed: onShowAll,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: AppColors.black,
                  ),
                  child: const Text('Ver todas'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// O card único que aparece quando um pino é tocado.
class _FocusedCard extends StatelessWidget {
  const _FocusedCard({
    required this.item,
    required this.searchQuery,
    required this.selectedSportChip,
    required this.state,
    required this.bottomInset,
    required this.onClose,
    required this.onOpenArena,
    required this.onToggleFavorite,
    required this.onReserve,
    required this.onContactUnclaimed,
  });

  final FilteredArenaSearchResult item;
  final String searchQuery;
  final ArenaSportChip selectedSportChip;
  final ArenaSheetItemState state;
  final double bottomInset;
  final VoidCallback? onClose;
  final VoidCallback onOpenArena;
  final VoidCallback onToggleFavorite;
  final VoidCallback? onReserve;
  final void Function(String arenaId, String whatsAppUrl) onContactUnclaimed;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.bottomCenter,
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, 0, 16, 12 + bottomInset),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            _CloseChip(onTap: onClose),
            const SizedBox(height: 8),
            ArenaSearchResultTile(
              item: item,
              searchQuery: searchQuery,
              selectedSportChip: selectedSportChip,
              isFavorite: state.isFavorite,
              isFavoritePending: state.isFavoritePending,
              isBestPrice: state.isBestPrice,
              onOpenArena: onOpenArena,
              onToggleFavorite: onToggleFavorite,
              onReserve: onReserve,
              onContactUnclaimed: onContactUnclaimed,
            ),
          ],
        ),
      ),
    );
  }
}

class _CloseChip extends StatelessWidget {
  const _CloseChip({required this.onTap});

  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Material(
      color: colors.surfaceCard,
      shape: const CircleBorder(),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: SizedBox(
          width: 34,
          height: 34,
          child: Icon(Icons.close_rounded, size: 18, color: colors.onSurface),
        ),
      ),
    );
  }
}
