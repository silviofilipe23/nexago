import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/layout/nexa_floating_header.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../domain/team_discover_models.dart';
import '../domain/team_discover_providers.dart';
import 'widgets/team_discover/team_discover_card.dart';
import 'widgets/team_discover/team_discover_filters_sheet.dart';
import 'widgets/team_discover/team_discover_list_skeleton.dart';

const _discoverHorizontalPadding = 20.0;

class TeamDiscoverPage extends ConsumerStatefulWidget {
  const TeamDiscoverPage({super.key});

  @override
  ConsumerState<TeamDiscoverPage> createState() => _TeamDiscoverPageState();
}

class _TeamDiscoverPageState extends ConsumerState<TeamDiscoverPage> {
  final _searchController = TextEditingController();
  final _scrollController = ScrollController();
  Timer? _searchDebounce;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _searchController.addListener(_onSearchChanged);
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    final pos = _scrollController.position;
    if (pos.pixels >= pos.maxScrollExtent - 200) {
      ref.read(teamDiscoverProvider.notifier).loadMore();
    }
  }

  void _onSearchChanged() {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 350), () {
      ref
          .read(teamDiscoverProvider.notifier)
          .setSearchQuery(_searchController.text);
    });
  }

  Future<void> _openFilters() async {
    final state = ref.read(teamDiscoverProvider);
    final result = await showTeamDiscoverFiltersSheet(
      context: context,
      initial: state.filters,
      previewResultCount: (draft) => ref
          .read(teamDiscoverProvider.notifier)
          .previewForFilters(draft)
          .length,
    );
    if (result != null && mounted) {
      ref.read(teamDiscoverProvider.notifier).applyFilters(result);
    }
  }

  Future<void> _refresh() =>
      ref.read(teamDiscoverProvider.notifier).refresh();

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(teamDiscoverProvider);
    final viewer = ref.watch(athleteProfileProvider).valueOrNull;
    final cityLabel = viewer?.city.trim().isNotEmpty == true
        ? viewer!.city.trim()
        : 'sua região';

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        top: false,
        bottom: false,
        child: ColoredBox(
          color: context.themeColors.canvas,
          child: RefreshIndicator(
            color: AppColors.brand,
            onRefresh: _refresh,
            child: CustomScrollView(
              controller: _scrollController,
              physics: const AlwaysScrollableScrollPhysics(
                parent: BouncingScrollPhysics(),
              ),
              slivers: [
                NexaFloatingHeaderSliver(
                  padding: const EdgeInsets.fromLTRB(
                    _discoverHorizontalPadding,
                    0,
                    _discoverHorizontalPadding,
                    12,
                  ),
                  topGap: 4,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _DiscoverAppBar(
                        subtitle: 'Equipes perto de você · $cityLabel',
                        filtersActive: state.filters.hasActiveFilters,
                        onBack: () => context.pop(),
                        onFilters: _openFilters,
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _searchController,
                        style: AppTypography.soraRegular(
                          fontSize: 14,
                          color: context.themeColors.onSurface,
                        ),
                        decoration: InputDecoration(
                          hintText: 'Nome da dupla, atletas ou cidade…',
                          hintStyle: AppTypography.soraRegular(
                            fontSize: 14,
                            color: context.themeColors.onSurfaceMuted,
                          ),
                          prefixIcon: Icon(
                            Icons.search_rounded,
                            color: context.themeColors.onSurfaceMuted,
                          ),
                          filled: true,
                          fillColor: context.themeColors.surfaceRaised,
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                            borderSide: BorderSide.none,
                          ),
                          contentPadding:
                              const EdgeInsets.symmetric(vertical: 12),
                        ),
                      ),
                      const SizedBox(height: 12),
                      SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          children:
                              TeamDiscoverGenderFilter.values.map((gender) {
                            final selected = state.filters.gender == gender;
                            return Padding(
                              padding: const EdgeInsets.only(right: 8),
                              child: FilterChip(
                                label: Text(gender.chipLabel),
                                selected: selected,
                                showCheckmark: false,
                                onSelected: (_) => ref
                                    .read(teamDiscoverProvider.notifier)
                                    .setGenderFilter(gender),
                                labelStyle: TextStyle(
                                  fontWeight: FontWeight.w700,
                                  color: selected
                                      ? context.themeColors.onSurface
                                      : context.themeColors.onSurfaceMuted,
                                ),
                                backgroundColor:
                                    context.themeColors.surfaceRaised,
                                selectedColor: context.themeColors.surfaceCard,
                                side: BorderSide(
                                  color: selected
                                      ? AppColors.brand.withValues(alpha: 0.5)
                                      : Colors.transparent,
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(20),
                                ),
                              ),
                            );
                          }).toList(),
                        ),
                      ),
                    ],
                  ),
                ),
                ..._buildBodySlivers(state: state),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _DiscoverAppBar extends StatelessWidget {
  const _DiscoverAppBar({
    required this.subtitle,
    required this.filtersActive,
    required this.onBack,
    required this.onFilters,
  });

  final String subtitle;
  final bool filtersActive;
  final VoidCallback onBack;
  final VoidCallback onFilters;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Material(
          color: context.themeColors.surfaceRaised,
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            onTap: onBack,
            borderRadius: BorderRadius.circular(12),
            child: SizedBox(
              width: 40,
              height: 40,
              child: Icon(
                Icons.chevron_left_rounded,
                color: context.themeColors.onSurface,
              ),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Duplas',
                style: AppTypography.soraRegular(
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                  color: context.themeColors.onSurface,
                ),
              ),
              Text(
                subtitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.soraRegular(
                  fontSize: 13,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            ],
          ),
        ),
        Stack(
          clipBehavior: Clip.none,
          children: [
            IconButton(
              onPressed: onFilters,
              icon: const Icon(Icons.tune_rounded),
              color: context.themeColors.onSurface,
            ),
            if (filtersActive)
              Positioned(
                right: 10,
                top: 10,
                child: Container(
                  width: 8,
                  height: 8,
                  decoration: const BoxDecoration(
                    color: AppColors.brand,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
          ],
        ),
      ],
    );
  }
}

List<Widget> _buildBodySlivers({required TeamDiscoverState state}) {
  if (state.isLoading && state.displayEntries.isEmpty) {
    return const [
      SliverFillRemaining(
        child: TeamDiscoverListSkeleton(),
      ),
    ];
  }

  if (state.errorMessage != null && state.displayEntries.isEmpty) {
    return [
      SliverFillRemaining(
        hasScrollBody: false,
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Não foi possível carregar duplas.\n${state.errorMessage}',
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.live),
            ),
          ),
        ),
      ),
    ];
  }

  if (state.displayEntries.isEmpty) {
    return [
      SliverFillRemaining(
        hasScrollBody: false,
        child: Builder(
          builder: (context) => Center(
            child: Text(
              'Nenhuma dupla encontrada.',
              style: TextStyle(color: context.themeColors.onSurfaceMuted),
            ),
          ),
        ),
      ),
    ];
  }

  return [
    SliverPadding(
      padding: const EdgeInsets.fromLTRB(
        _discoverHorizontalPadding,
        0,
        _discoverHorizontalPadding,
        24,
      ),
      sliver: SliverList.separated(
        itemCount: state.displayEntries.length + 1,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          if (index == state.displayEntries.length) {
            if (state.isLoadingMore) {
              return const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Center(
                  child: CircularProgressIndicator(
                    color: AppColors.brand,
                    strokeWidth: 2,
                  ),
                ),
              );
            }
            return const SizedBox(height: 8);
          }

          final entry = state.displayEntries[index];
          return TeamDiscoverCard(entry: entry);
        },
      ),
    ),
  ];
}
