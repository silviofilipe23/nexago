import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_shadows.dart';
import '../../../core/theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_status_views.dart';
import '../../../core/ui/nexa_skeleton.dart';
import '../../arena/presentation/widgets/arena_dashboard_tokens.dart';
import '../domain/ranking_list_mapper.dart';
import '../domain/ranking_list_models.dart';
import '../domain/ranking_logic.dart';
import '../domain/ranking_providers.dart';
import 'widgets/ranking_classification_header.dart';
import 'widgets/ranking_format_filter_chip.dart';
import 'widgets/ranking_gender_filter_sheet.dart';
import 'widgets/ranking_how_it_works_sheet.dart';
import 'widgets/ranking_level_filter_chip.dart';
import 'widgets/ranking_list_tile.dart';
import 'widgets/ranking_mode_segment.dart';
import 'widgets/ranking_page_app_bar.dart';
import 'widgets/ranking_podium.dart';
import 'widgets/ranking_year_filter_row.dart';

class AthleteRankingPage extends ConsumerStatefulWidget {
  const AthleteRankingPage({super.key});

  @override
  ConsumerState<AthleteRankingPage> createState() => _AthleteRankingPageState();
}

class _AthleteRankingPageState extends ConsumerState<AthleteRankingPage> {
  final _searchController = TextEditingController();
  final _scrollController = ScrollController();
  final _userAnchorKey = GlobalKey();
  var _searchOpen = false;
  var _searchQuery = '';
  var _userCardFloating = true;
  String? _floatingSessionKey;

  static const _floatingFooterBottomGap = 8.0;

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      setState(() => _searchQuery = _searchController.text);
    });
    _scrollController.addListener(_updateUserCardFloatingState);
  }

  @override
  void dispose() {
    _searchController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _resetFloatingIfNeeded({
    required RankingPageFilter filter,
    required RankingListEntry? userEntry,
  }) {
    final sessionKey =
        '${filter.mode}|${filter.year}|${filter.gender}|${filter.format}|${userEntry?.entityId}|${userEntry?.rank}';
    if (_floatingSessionKey == sessionKey) return;
    _floatingSessionKey = sessionKey;
    _userCardFloating = true;
  }

  void _updateUserCardFloatingState() {
    if (!mounted) return;
    final context = _userAnchorKey.currentContext;
    if (context == null) return;
    final box = context.findRenderObject() as RenderBox?;
    if (box == null || !box.hasSize) return;

    final anchorTop = box.localToGlobal(Offset.zero).dy;
    final media = MediaQuery.of(context);
    final dockLine = media.size.height -
        RankingListTile.approximateHeight -
        media.padding.bottom -
        _floatingFooterBottomGap;

    final shouldFloat = anchorTop > dockLine;
    if (shouldFloat != _userCardFloating) {
      setState(() => _userCardFloating = shouldFloat);
    }
  }

  void _scheduleFloatingCheck() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _updateUserCardFloatingState();
    });
  }

  void _toggleSearch() {
    setState(() {
      _searchOpen = !_searchOpen;
      if (!_searchOpen) {
        _searchController.clear();
        _searchQuery = '';
      }
    });
  }

  Future<void> _openGenderFilter() async {
    final current = ref.read(rankingPageFilterProvider).gender;
    final selected = await showRankingGenderFilterSheet(
      context,
      current: current,
    );
    if (selected == null || selected == current) return;
    ref.read(rankingPageFilterProvider.notifier).state =
        ref.read(rankingPageFilterProvider).copyWith(gender: selected);
  }

  void _openProfile(RankingListEntry entry, RankingListMode mode) {
    final id = entry.entityId.trim();
    if (id.isEmpty) return;
    if (mode == RankingListMode.athletes) {
      context.pushNamed(
        AppRouteNames.athleteProfile,
        queryParameters: {'userId': id},
      );
      return;
    }
    context.pushNamed(
      AppRouteNames.teamProfile,
      pathParameters: {'teamId': id},
    );
  }

  VoidCallback? _profileTap(RankingListEntry entry, RankingListMode mode) {
    final id = entry.entityId.trim();
    if (id.isEmpty) return null;
    return () => _openProfile(entry, mode);
  }

  Widget _buildUserListSlot({
    required RankingListEntry userEntry,
    required RankingListMode mode,
    required bool floating,
  }) {
    if (floating) {
      return SizedBox(
        key: _userAnchorKey,
        height: RankingListTile.approximateHeight,
      );
    }
    return KeyedSubtree(
      key: _userAnchorKey,
      child: RankingUserHighlightTile(
        entry: userEntry,
        onTap: _profileTap(userEntry, mode),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final filter = ref.watch(rankingPageFilterProvider);
    final yearOptions = ref.watch(rankingYearOptionsProvider);
    final entriesAsync = ref.watch(rankingListEntriesProvider);

    return Scaffold(
      backgroundColor: theme.colorScheme.surfaceContainerLowest,
      appBar: RankingPageAppBar(
        searchOpen: _searchOpen,
        searchController: _searchController,
        onSearchToggle: _toggleSearch,
        onFilterTap: _openGenderFilter,
        onInfoTap: () => showRankingHowItWorksSheet(context),
      ),
      body: entriesAsync.when(
        loading: () => const _RankingLoadingSection(),
        error: (_, __) => AppErrorView(
          title: 'Não foi possível carregar',
          message: 'Não foi possível carregar o ranking.',
          onRetry: () => ref.invalidate(rankingListEntriesProvider),
        ),
        data: (entries) {
          final visible = filterRankingEntriesBySearch(entries, _searchQuery);
          final isSearching = _searchQuery.trim().isNotEmpty;
          final userEntry =
              visible.where((e) => e.isCurrentUser).firstOrNull;
          final userInRest = userEntry != null && userEntry.rank > 3;
          final showFloatingUserCard =
              userInRest && _userCardFloating && !isSearching;

          if (userInRest) {
            _resetFloatingIfNeeded(filter: filter, userEntry: userEntry);
            _scheduleFloatingCheck();
          }

          final listBottomPadding = showFloatingUserCard
              ? RankingListTile.approximateHeight +
                  MediaQuery.paddingOf(context).bottom +
                  _floatingFooterBottomGap +
                  16
              : 28.0;

          return Stack(
            children: [
              RefreshIndicator(
                color: AppColors.brand,
                onRefresh: () async {
                  invalidateRankingListCache(ref);
                  await ref.read(rankingListEntriesProvider.future);
                },
                child: ListView(
                  controller: _scrollController,
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: EdgeInsets.fromLTRB(
                    ArenaDashboardTokens.horizontalPadding,
                    12,
                    ArenaDashboardTokens.horizontalPadding,
                    listBottomPadding,
                  ),
                  children: [
                    RankingModeSegment(
                      mode: filter.mode,
                      onChanged: (mode) {
                        // Formato só existe no modo de duplas — um "trio" preso
                        // no Individual esvaziaria a lista sem chip visível.
                        ref.read(rankingPageFilterProvider.notifier).state =
                            filter.copyWith(
                          mode: mode,
                          format: RankingFormatFilter.all,
                        );
                      },
                    ),
                    SizedBox(height: 12),
                    RankingYearFilterRow(
                      yearOptions: [null, ...yearOptions],
                      selectedYear: filter.year,
                      modeLabel: filter.pointsModeLabel,
                      onYearSelected: (year) {
                        ref.read(rankingPageFilterProvider.notifier).state =
                            RankingPageFilter(
                          mode: filter.mode,
                          year: year,
                          gender: filter.gender,
                          format: filter.format,
                          level: filter.level,
                        );
                      },
                    ),
                    SizedBox(height: 10),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          RankingLevelFilterChip(
                            selectedRank: filter.level,
                            onChanged: (rank) {
                              ref
                                  .read(rankingPageFilterProvider.notifier)
                                  .state =
                                  filter.copyWith(level: () => rank);
                            },
                          ),
                          if (filter.mode == RankingListMode.teams)
                            RankingFormatFilterChip(
                              selected: filter.format,
                              onChanged: (format) {
                                ref
                                    .read(rankingPageFilterProvider.notifier)
                                    .state =
                                    filter.copyWith(format: format);
                              },
                            ),
                        ],
                      ),
                    ),
                    SizedBox(height: 20),
                    if (visible.isEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 24),
                        child: AppEmptyView(
                          icon: Icons.leaderboard_outlined,
                          title: 'Nenhum resultado encontrado',
                          subtitle: _searchQuery.isNotEmpty
                              ? 'Nenhum resultado para "$_searchQuery".'
                              : filter.mode == RankingListMode.teams
                                  // Com filtro de trio+ ativo, "dupla" mentiria.
                                  ? (filter.format == RankingFormatFilter.all ||
                                          filter.format ==
                                              RankingFormatFilter.dupla
                                      ? 'Nenhuma dupla no ranking para este filtro.'
                                      : 'Nenhuma equipe no ranking para este filtro.')
                                  : 'Nenhum atleta no ranking para este filtro.',
                        ),
                      )
                    else if (isSearching)
                      _buildSearchResults(
                        visible: visible,
                        filter: filter,
                      )
                    else
                      _buildRankingList(
                        visible: visible,
                        filter: filter,
                        userEntry: userEntry,
                        userInRest: userInRest,
                      ),
                  ],
                ),
              ),
              if (showFloatingUserCard)
                Positioned(
                  left: ArenaDashboardTokens.horizontalPadding,
                  right: ArenaDashboardTokens.horizontalPadding,
                  bottom: MediaQuery.paddingOf(context).bottom +
                      _floatingFooterBottomGap,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      borderRadius: AppRadii.lgAll,
                      boxShadow: AppShadows.floating(context.themeColors),
                    ),
                    child: ClipRRect(
                      borderRadius: AppRadii.lgAll,
                      child: RankingUserHighlightTile(
                        entry: userEntry,
                        onTap: _profileTap(userEntry, filter.mode),
                      ),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildSearchResults({
    required List<RankingListEntry> visible,
    required RankingPageFilter filter,
  }) {
    final sorted = sortedRankingEntries(visible);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        RankingClassificationHeader(
          mode: filter.mode,
          count: visible.length,
        ),
        SizedBox(height: 10),
        for (final entry in sorted)
          if (entry.isCurrentUser)
            RankingUserHighlightTile(
              entry: entry,
              onTap: _profileTap(entry, filter.mode),
            )
          else
            RankingListTile(
              entry: entry,
              onTap: _profileTap(entry, filter.mode),
            ),
      ],
    );
  }

  Widget _buildRankingList({
    required List<RankingListEntry> visible,
    required RankingPageFilter filter,
    required RankingListEntry? userEntry,
    required bool userInRest,
  }) {
    final podium = podiumEntries(visible);
    final rest = listEntriesFromRank4(visible);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (podium.isNotEmpty) ...[
          RankingPodium(
            entries: podium,
            onEntryTap: filter.mode == RankingListMode.athletes
                ? (entry) => _openProfile(entry, filter.mode)
                : null,
          ),
          SizedBox(height: 24),
        ],
        RankingClassificationHeader(
          mode: filter.mode,
          count: visible.length,
        ),
        SizedBox(height: 10),
        for (final entry in rest)
          if (userInRest && entry.entityId == userEntry!.entityId)
            _buildUserListSlot(
              userEntry: userEntry,
              mode: filter.mode,
              floating: _userCardFloating,
            )
          else
            RankingListTile(
              entry: entry,
              onTap: _profileTap(entry, filter.mode),
            ),
      ],
    );
  }
}

class _RankingLoadingSection extends StatelessWidget {
  const _RankingLoadingSection();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        ArenaDashboardTokens.horizontalPadding,
        12,
        ArenaDashboardTokens.horizontalPadding,
        AppSpacing.sectionGap,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: _PodiumSlotSkeleton(circleSize: 56)),
              SizedBox(width: AppSpacing.sm),
              Expanded(child: _PodiumSlotSkeleton(circleSize: 72)),
              SizedBox(width: AppSpacing.sm),
              Expanded(child: _PodiumSlotSkeleton(circleSize: 56)),
            ],
          ),
          SizedBox(height: AppSpacing.xxl),
          for (var i = 0; i < 4; i++) ...[
            if (i > 0) SizedBox(height: AppSpacing.sm),
            NexaSkeleton(height: 64, radius: AppRadii.lgAll),
          ],
        ],
      ),
    );
  }
}

class _PodiumSlotSkeleton extends StatelessWidget {
  const _PodiumSlotSkeleton({required this.circleSize});

  final double circleSize;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        NexaSkeleton.circle(size: circleSize),
        SizedBox(height: AppSpacing.sm),
        NexaSkeleton(width: circleSize * 0.8, height: 10),
        SizedBox(height: AppSpacing.xs),
        NexaSkeleton(width: circleSize * 0.5, height: 14),
      ],
    );
  }
}
