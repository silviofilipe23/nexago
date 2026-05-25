import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/location/user_location_providers.dart';
import '../../../core/location/user_location_snapshot.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../../arenas/domain/arena_search_filter_logic.dart';
import '../../arenas/domain/arena_search_providers.dart';
import '../../arenas/presentation/arena_booking_navigation.dart';
import '../domain/athlete_profile.dart';
import '../domain/athlete_profile_providers.dart';
import '../domain/favorites_providers.dart';
import '../domain/gamification_providers.dart';
import 'favorite_success_page.dart';
import 'widgets/arena_search/arena_search_arena_card.dart';
import 'widgets/arena_search/arena_search_bar.dart';
import 'widgets/arena_search/arena_search_date_time_row.dart';
import 'widgets/arena_search/arena_search_favorites_strip.dart';
import 'widgets/arena_search/arena_search_filters_sheet.dart';
import 'widgets/arena_search/arena_search_flexible_banner.dart';
import 'widgets/arena_search/arena_search_header.dart';
import 'widgets/arena_search/arena_search_location_sheet.dart';
import 'widgets/arena_search/arena_search_section_header.dart';
import 'widgets/arena_search/arena_search_sort_sheet.dart';
import 'widgets/arena_search/arena_search_sport_chips.dart';

/// Aba Reservar — busca de horários (protótipo Buscar horários).
class ArenaListPage extends ConsumerStatefulWidget {
  const ArenaListPage({super.key});

  @override
  ConsumerState<ArenaListPage> createState() => _ArenaListPageState();
}

class _ArenaListPageState extends ConsumerState<ArenaListPage> {
  late ArenaSearchFilters _filters;
  final Map<String, bool> _favoriteOverrides = <String, bool>{};
  final Set<String> _favoritePendingArenaIds = <String>{};
  final ScrollController _scrollController = ScrollController();
  Timer? _searchDebounce;
  bool _sportChipUserSelected = false;
  static const _flexBoostPercent = 35;

  @override
  void initState() {
    super.initState();
    _filters = _filtersWithProfileSport(
      ref.read(athleteProfileProvider).valueOrNull,
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _syncProfileSportDefault();
    });
  }

  ArenaSportChip _sportChipFromProfile(AthleteProfile? profile) {
    if (profile == null) return ArenaSearchFilters.defaultSportChip;
    final hasSport = profile.primarySportFirestoreId?.isNotEmpty == true ||
        profile.sport.trim().isNotEmpty;
    if (!hasSport) return ArenaSearchFilters.defaultSportChip;

    final chip = defaultSportChipFromProfile(
      sport: profile.sport,
      primarySport: profile.primarySportFirestoreId,
    );
    return chip == ArenaSportChip.all
        ? ArenaSearchFilters.defaultSportChip
        : chip;
  }

  ArenaSearchFilters _filtersWithProfileSport(AthleteProfile? profile) {
    return ArenaSearchFilters.defaults().copyWith(
      sportChip: _sportChipFromProfile(profile),
    );
  }

  void _syncProfileSportDefault() {
    if (_sportChipUserSelected) return;
    final chip = _sportChipFromProfile(
      ref.read(athleteProfileProvider).valueOrNull,
    );
    if (_filters.sportChip == chip) return;
    setState(() => _filters = _filters.copyWith(sportChip: chip));
  }

  int _rawSearchResultCount() {
    return ref.read(arenaSearchResultsProvider(_filters.slot)).valueOrNull?.length ??
        0;
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _scrollController.dispose();
    super.dispose();
  }

  void _updateFilters(ArenaSearchFilters filters) {
    setState(() => _filters = filters);
  }

  void _showAllArenas() {
    _searchDebounce?.cancel();
    _updateFilters(ArenaSearchFilters.showAll(slot: _filters.slot));
  }

  void _onSearchChanged(String value) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 300), () {
      if (!mounted) return;
      setState(() => _filters = _filters.copyWith(query: value));
    });
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _filters.slot.dateOnly,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: DateTime(now.year + 1),
      locale: const Locale('pt', 'BR'),
    );
    if (picked == null) return;
    _updateFilters(
      _filters.copyWith(
        slot: ArenaSearchSlotFilters(
          date: DateTime(picked.year, picked.month, picked.day),
          requestedTime: _filters.slot.requestedTime,
          flexibleTime: _filters.slot.flexibleTime,
        ),
      ),
    );
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: _filters.slot.requestedTime,
    );
    if (picked == null) return;
    _updateFilters(
      _filters.copyWith(
        slot: ArenaSearchSlotFilters(
          date: _filters.slot.dateOnly,
          requestedTime: picked,
          flexibleTime: false,
        ),
      ),
    );
  }

  void _toggleFlexibleTime() {
    final next = !_filters.slot.flexibleTime;
    _updateFilters(
      _filters.copyWith(
        slot: ArenaSearchSlotFilters(
          date: _filters.slot.dateOnly,
          requestedTime: _filters.slot.requestedTime,
          flexibleTime: next,
        ),
      ),
    );
  }

  int _previewFilterResultCount(ArenaSearchFilters draft) {
    final slotResults =
        ref.read(arenaSearchResultsProvider(_filters.slot)).valueOrNull ??
            const <ArenaSearchResult>[];
    final location = ref.read(userLocationProvider).valueOrNull ??
        const UserLocationSnapshot(source: UserLocationSource.none);
    final favorites =
        ref.read(favoriteArenaIdsProvider).valueOrNull ?? const <String>[];

    return filterAndSortArenaResults(
      results: slotResults,
      filters: draft,
      userLocation: location,
      favoriteIds: favorites.toSet(),
    ).length;
  }

  Future<void> _openFilters() async {
    final applied = await showArenaSearchFiltersSheet(
      context: context,
      initial: _filters,
      previewResultCount: _previewFilterResultCount,
    );
    if (applied != null) _updateFilters(applied);
  }

  Future<void> _openSort() async {
    final sort = await showArenaSearchSortSheet(
      context: context,
      current: _filters.sortBy,
    );
    if (sort != null) _updateFilters(_filters.copyWith(sortBy: sort));
  }

  Future<void> _openLocation() async {
    final profile = ref.read(athleteProfileProvider).valueOrNull;
    await showArenaSearchLocationSheet(
      context: context,
      ref: ref,
      profileCity: profile?.city ?? '',
      profileState: profile?.state ?? '',
    );
  }

  Future<void> _toggleFavorite({
    required String? userId,
    required String arenaId,
    required bool isFavorite,
  }) async {
    if (userId == null || userId.isEmpty) {
      showAppSnackBar(context, 'Faça login para seguir arenas.', isError: true);
      return;
    }
    if (_favoritePendingArenaIds.contains(arenaId)) return;

    final next = !isFavorite;
    setState(() {
      _favoriteOverrides[arenaId] = next;
      _favoritePendingArenaIds.add(arenaId);
    });

    try {
      await ref
          .read(favoritesServiceProvider)
          .toggleFavoriteArena(
            userId: userId,
            arenaId: arenaId,
            isFavorite: isFavorite,
          );
      if (!mounted) return;
      setState(() {
        _favoritePendingArenaIds.remove(arenaId);
        _favoriteOverrides.remove(arenaId);
      });
      if (next) {
        await ref
            .read(gamificationServiceProvider)
            .onArenaFavorited(userId: userId, arenaId: arenaId);
        if (!mounted) return;
        await FavoriteSuccessPage.show(context);
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _favoritePendingArenaIds.remove(arenaId);
        _favoriteOverrides.remove(arenaId);
      });
      showAppSnackBar(
        context,
        'Não foi possível atualizar seguidores agora.',
        isError: true,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(athleteProfileProvider, (previous, next) {
      if (_sportChipUserSelected) return;
      final chip = _sportChipFromProfile(next.valueOrNull);
      if (_filters.sportChip == chip) return;
      setState(() => _filters = _filters.copyWith(sportChip: chip));
    });

    final userId = ref.watch(authProvider).valueOrNull?.uid;
    final favoriteIds =
        ref.watch(favoriteArenaIdsProvider).valueOrNull ?? const <String>[];
    final favoriteIdsSet = favoriteIds.toSet();

    final resultsAsync = ref.watch(arenaSearchResultsProvider(_filters.slot));
    final filtered = ref.watch(arenaSearchFilteredProvider(_filters));

    return SafeArea(
      bottom: false,
      child: ColoredBox(
        color: AppColors.canvas,
        child: resultsAsync.when(
          loading: () => const AppLoadingView(message: 'Carregando arenas...'),
          error: (e, _) => AppErrorView(
            title: 'Não foi possível carregar horários',
            message: e.toString().replaceFirst('Exception: ', ''),
            onRetry: () =>
                ref.invalidate(arenaSearchResultsProvider(_filters.slot)),
          ),
          data: (_) {
            final items = filtered;
            final rawCount = _rawSearchResultCount();
            final bestPriceIds = bestPriceArenaIds(items.map((e) => e.result));
            final favoriteItems = items
                .where(
                  (e) =>
                      _favoriteOverrides[e.result.arena.id] ??
                      favoriteIdsSet.contains(e.result.arena.id),
                )
                .toList(growable: false);

            if (items.isEmpty && !_filters.showOnlyFavorites) {
              return CustomScrollView(
                controller: _scrollController,
                slivers: [
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
                    sliver: SliverToBoxAdapter(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          _buildHeaderControls(),
                          if (rawCount > 0) ...[
                            const SizedBox(height: 16),
                            _FiltersHiddenBanner(
                              hiddenCount: rawCount,
                              onShowAll: _showAllArenas,
                              onOpenFilters: _openFilters,
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: AppEmptyView(
                      icon: rawCount > 0
                          ? Icons.tune_rounded
                          : Icons.heart_broken_outlined,
                      title: rawCount > 0
                          ? 'Filtros ocultaram as arenas'
                          : 'Nenhuma arena encontrada',
                      subtitle: rawCount > 0
                          ? 'Temos $rawCount arena${rawCount == 1 ? '' : 's'} na base, '
                              'mas nenhuma passou nos filtros atuais.'
                          : 'Ajuste filtros, data ou horário para ver mais opções.',
                    ),
                  ),
                ],
              );
            }

            return CustomScrollView(
              controller: _scrollController,
              physics: const BouncingScrollPhysics(),
              slivers: [
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 10),
                  sliver: SliverToBoxAdapter(
                    child: _buildHeaderControls(),
                  ),
                ),
                if (favoriteItems.isNotEmpty)
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                    sliver: SliverToBoxAdapter(
                      child: ArenaSearchFavoritesStrip(
                        items: favoriteItems,
                        searchQuery: _filters.query,
                        onViewAll: () {
                          _updateFilters(
                            _filters.copyWith(showOnlyFavorites: true),
                          );
                          _scrollController.animateTo(
                            0,
                            duration: const Duration(milliseconds: 300),
                            curve: Curves.easeOut,
                          );
                        },
                        onArenaTap: (arena) => openArenaDetail(context, arena),
                        onToggleFavorite: (id, fav) => _toggleFavorite(
                          userId: userId,
                          arenaId: id,
                          isFavorite: fav,
                        ),
                        isFavoritePending: _favoritePendingArenaIds.contains,
                      ),
                    ),
                  ),
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                  sliver: SliverToBoxAdapter(
                    child: ArenaSearchSectionHeader(
                      title: 'Arenas perto',
                      trailingAccent: '· ${items.length}',
                      trailingLabel: 'ordenar',
                      onTrailingTap: _openSort,
                    ),
                  ),
                ),
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
                  sliver: SliverList.separated(
                    itemCount: items.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 16),
                    itemBuilder: (context, index) {
                      final item = items[index];
                      final result = item.result;
                      final isFavorite =
                          _favoriteOverrides[result.arena.id] ??
                          favoriteIdsSet.contains(result.arena.id);

                      return staggeredFadeSlide(
                        index: index,
                        child: ArenaSearchArenaCard(
                          item: item,
                          searchQuery: _filters.query,
                          selectedSportChip: _filters.sportChip,
                          isFavorite: isFavorite,
                          isFavoritePending: _favoritePendingArenaIds.contains(
                            result.arena.id,
                          ),
                          isBestPrice: bestPriceIds.contains(result.arena.id),
                          onOpenArena: () => openArenaDetail(
                            context,
                            result.arena,
                            isBestPrice: bestPriceIds.contains(result.arena.id),
                          ),
                          onToggleFavorite:
                              _favoritePendingArenaIds.contains(result.arena.id)
                              ? null
                              : () => _toggleFavorite(
                                  userId: userId,
                                  arenaId: result.arena.id,
                                  isFavorite: isFavorite,
                                ),
                          onReserve: result.hasAvailability
                              ? () => openArenaBookingSlots(
                                  context,
                                  arena: result.arena,
                                  slot: result.selectedSlot,
                                  date: _filters.slot.dateOnly,
                                )
                              : null,
                        ),
                      );
                    },
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildHeaderControls() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ArenaSearchHeader(
          activeFilterCount: countActiveSearchFilters(_filters),
          onFiltersTap: _openFilters,
          onLocationTap: _openLocation,
        ),
        const SizedBox(height: 16),
        ArenaSearchBar(
          initialValue: _filters.query,
          onChanged: _onSearchChanged,
        ),
        const SizedBox(height: 12),
        ArenaSearchSportChips(
          selected: _filters.sportChip,
          onSelected: (chip) {
            _sportChipUserSelected = true;
            _updateFilters(_filters.copyWith(sportChip: chip));
          },
        ),
        const SizedBox(height: 12),
        ArenaSearchDateTimeRow(
          date: _filters.slot.dateOnly,
          timeLabel: _filters.slot.requestedTimeLabel,
          flexibleTime: _filters.slot.flexibleTime,
          onDateTap: _pickDate,
          onTimeTap: _pickTime,
        ),
        const SizedBox(height: 12),
        ArenaSearchFlexibleBanner(
          boostPercent: _flexBoostPercent,
          flexibleTime: _filters.slot.flexibleTime,
          onToggle: _toggleFlexibleTime,
        ),
        if (_filters.showOnlyFavorites) ...[
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: () =>
                  _updateFilters(_filters.copyWith(showOnlyFavorites: false)),
              child: const Text(
                'Ver todas as arenas',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
          ),
        ],
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
            '$hiddenCount arena${hiddenCount == 1 ? '' : 's'} oculta${hiddenCount == 1 ? '' : 's'} pelos filtros',
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              color: AppColors.onSurface,
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
