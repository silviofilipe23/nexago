import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../../arenas/domain/arena_search_providers.dart';
import '../../arenas/domain/arenas_providers.dart';
import '../../arenas/domain/slots_page_logic.dart';
import '../../arenas/presentation/arena_booking_navigation.dart';
import '../domain/favorites_providers.dart';
import 'widgets/arena_search/favorite_arena_card.dart';

class AthleteFavoriteArenasPage extends ConsumerStatefulWidget {
  const AthleteFavoriteArenasPage({super.key, this.slotFilters});

  final ArenaSearchSlotFilters? slotFilters;

  @override
  ConsumerState<AthleteFavoriteArenasPage> createState() =>
      _AthleteFavoriteArenasPageState();
}

class _AthleteFavoriteArenasPageState
    extends ConsumerState<AthleteFavoriteArenasPage> {
  final Set<String> _favoritePendingArenaIds = <String>{};

  Future<void> _toggleFavorite({
    required String? userId,
    required String arenaId,
  }) async {
    if (userId == null || userId.isEmpty) {
      showAppSnackBar(context, 'Faça login para seguir arenas.', isError: true);
      return;
    }
    if (_favoritePendingArenaIds.contains(arenaId)) return;

    setState(() => _favoritePendingArenaIds.add(arenaId));

    try {
      await ref.read(favoritesServiceProvider).toggleFavoriteArena(
            userId: userId,
            arenaId: arenaId,
            isFavorite: true,
          );
      if (!mounted) return;
      setState(() => _favoritePendingArenaIds.remove(arenaId));
    } catch (_) {
      if (!mounted) return;
      setState(() => _favoritePendingArenaIds.remove(arenaId));
      showAppSnackBar(
        context,
        'Não foi possível atualizar favoritos agora.',
        isError: true,
      );
    }
  }

  void _handleBack() {
    if (context.canPop()) {
      context.pop();
      return;
    }
    context.goNamed(
      AppRouteNames.discover,
      queryParameters: const {'tab': 'reservar'},
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final userId = ref.watch(authProvider).valueOrNull?.uid;
    final favoritesAsync = ref.watch(favoriteArenasProvider);
    final slotFilters = widget.slotFilters;
    final searchResultsAsync = slotFilters != null
        ? ref.watch(arenaSearchResultsProvider(slotFilters))
        : null;
    final searchByArenaId = <String, ArenaSearchResult>{};
    if (searchResultsAsync?.hasValue == true) {
      for (final result in searchResultsAsync!.value!) {
        searchByArenaId[result.arena.id] = result;
      }
    }

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 20, 0),
              child: Row(
                children: [
                  Material(
                    color: context.themeColors.surfaceRaised,
                    borderRadius: BorderRadius.circular(12),
                    child: InkWell(
                      onTap: _handleBack,
                      borderRadius: BorderRadius.circular(12),
                      child: const SizedBox(
                        width: 44,
                        height: 44,
                        child: Icon(Icons.chevron_left_rounded),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'RESERVAR',
                          style: AppTypography.soraRegular(
                            fontSize: 10,
                            fontWeight: FontWeight.w500,
                            color: AppColors.brand,
                            letterSpacing: 1,
                          ),
                        ),
                        Text(
                          'Arenas favoritas',
                          style: theme.textTheme.headlineSmall?.copyWith(
                            fontWeight: FontWeight.w900,
                            letterSpacing: -0.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: favoritesAsync.when(
                loading: () =>
                    const AppLoadingView(message: 'Carregando favoritas...'),
                error: (e, _) => AppErrorView(
                  title: 'Não foi possível carregar',
                  message: e.toString().replaceFirst('Exception: ', ''),
                  onRetry: () {
                    ref.invalidate(favoriteArenaIdsProvider);
                    ref.invalidate(arenasStreamProvider);
                  },
                ),
                data: (arenas) {
                  if (arenas.isEmpty) {
                    return AppEmptyView(
                      icon: Icons.favorite_border_rounded,
                      title: 'Nenhuma arena favorita',
                      subtitle:
                          'Toque no coração nas arenas que você mais joga para vê-las aqui.',
                      actionLabel: 'Buscar arenas',
                      onAction: _handleBack,
                    );
                  }

                  return ListView.separated(
                    padding: const EdgeInsets.fromLTRB(20, 20, 20, 28),
                    physics: const BouncingScrollPhysics(),
                    itemCount: arenas.length + 1,
                    separatorBuilder: (_, index) {
                      if (index == 0) return const SizedBox(height: 12);
                      return const SizedBox(height: 12);
                    },
                    itemBuilder: (context, index) {
                      if (index == 0) {
                        return Text(
                          '${arenas.length} arena${arenas.length == 1 ? '' : 's'}',
                          style: theme.textTheme.labelLarge?.copyWith(
                            color: context.themeColors.onSurfaceMuted,
                            fontWeight: FontWeight.w700,
                          ),
                        );
                      }

                      final arena = arenas[index - 1];
                      final searchResult = searchByArenaId[arena.id];
                      final slot = searchResult?.selectedSlot;
                      final nextLabel = slot?.startTime.trim();

                      return FavoriteArenaCard(
                        arena: arena,
                        height: nextLabel != null && nextLabel.isNotEmpty
                            ? 168
                            : 140,
                        isFavoritePending:
                            _favoritePendingArenaIds.contains(arena.id),
                        onTap: () => openArenaDetail(context, arena),
                        onToggleFavorite: _favoritePendingArenaIds
                                .contains(arena.id)
                            ? null
                            : () => _toggleFavorite(
                                  userId: userId,
                                  arenaId: arena.id,
                                ),
                        nextSlotLabel: searchResult?.hasAvailability == true
                            ? nextLabel
                            : null,
                        onReserve: searchResult?.hasAvailability == true &&
                                slot != null
                            ? () => openArenaBookingSlots(
                                  context,
                                  arena: arena,
                                  slot: slot,
                                  date: slotDayOnly(
                                    slotFilters?.date ?? slot.date,
                                  ),
                                )
                            : null,
                      );
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
