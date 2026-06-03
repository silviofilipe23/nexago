import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../domain/athlete_discover_models.dart';
import '../domain/athlete_discover_providers.dart';
import '../domain/athlete_profile_providers.dart';
import 'widgets/discover/athlete_discover_card.dart';
import 'widgets/discover/athlete_discover_filters_sheet.dart';

class AthleteDiscoverPage extends ConsumerStatefulWidget {
  const AthleteDiscoverPage({super.key});

  @override
  ConsumerState<AthleteDiscoverPage> createState() =>
      _AthleteDiscoverPageState();
}

class _AthleteDiscoverPageState extends ConsumerState<AthleteDiscoverPage> {
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
      ref.read(athleteDiscoverProvider.notifier).loadMore();
    }
  }

  void _onSearchChanged() {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 350), () {
      ref
          .read(athleteDiscoverProvider.notifier)
          .search(_searchController.text);
    });
  }

  Future<void> _openFilters() async {
    final state = ref.read(athleteDiscoverProvider);
    final result = await showAthleteDiscoverFiltersSheet(
      context: context,
      initial: state.filters,
      previewResultCount: (draft) =>
          ref.read(athleteDiscoverProvider.notifier).previewForFilters(draft).length,
    );
    if (result != null && mounted) {
      ref.read(athleteDiscoverProvider.notifier).applyFilters(result);
    }
  }

  void _onInviteTap() {
    showAppSnackBar(context, 'Convite por raio — em breve.');
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(athleteDiscoverProvider);
    final viewer = ref.watch(athleteProfileProvider).valueOrNull;
    final cityLabel = viewer?.city.trim().isNotEmpty == true
        ? viewer!.city.trim()
        : 'sua região';
    final now = DateTime.now();

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _DiscoverAppBar(
              subtitle: cityLabel,
              filtersActive: state.filters.hasActiveFilters,
              onBack: () => context.pop(),
              onFilters: _openFilters,
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
              child: TextField(
                controller: _searchController,
                style: AppTypography.soraRegular(
                  fontSize: 14,
                  color: context.themeColors.onSurface,
                ),
                decoration: InputDecoration(
                  hintText: 'Nome, @, cidade ou esporte…',
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
                  contentPadding: const EdgeInsets.symmetric(vertical: 12),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: AthleteDiscoverQuickCategory.values.map((cat) {
                    final selected = state.filters.quickCategory == cat;
                    final label = cat.label.isEmpty ? 'Todos' : cat.label;
                    return Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: FilterChip(
                        label: Text(label),
                        selected: selected,
                        showCheckmark: false,
                        onSelected: (_) => ref
                            .read(athleteDiscoverProvider.notifier)
                            .setQuickCategory(cat),
                        labelStyle: TextStyle(
                          fontWeight: FontWeight.w700,
                          color: selected
                              ? context.themeColors.onSurface
                              : context.themeColors.onSurfaceMuted,
                        ),
                        backgroundColor: context.themeColors.surfaceRaised,
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
            ),
            SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: _MetaRow(
                total: state.totalCount,
                online: state.supportsOnlineFilter
                    ? state.onlineCount(now)
                    : null,
                sort: state.sort,
                onSortChanged: (s) =>
                    ref.read(athleteDiscoverProvider.notifier).setSort(s),
              ),
            ),
            SizedBox(height: 12),
            Expanded(
              child: _DiscoverBody(
                state: state,
                scrollController: _scrollController,
                onRefresh: () =>
                    ref.read(athleteDiscoverProvider.notifier).refresh(),
                onInvite: _onInviteTap,
              ),
            ),
          ],
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
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 12, 8),
      child: Row(
        children: [
          IconButton(
            onPressed: onBack,
            icon: Icon(Icons.arrow_back_rounded),
            color: context.themeColors.onSurface,
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Descobrir',
                  style: AppTypography.soraRegular(
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                    color: context.themeColors.onSurface,
                  ),
                ),
                Text(
                  subtitle,
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
                icon: Icon(Icons.tune_rounded),
                color: context.themeColors.onSurface,
              ),
              if (filtersActive)
                Positioned(
                  right: 10,
                  top: 10,
                  child: Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: AppColors.brand,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MetaRow extends StatelessWidget {
  const _MetaRow({
    required this.total,
    required this.online,
    required this.sort,
    required this.onSortChanged,
  });

  final int total;
  final int? online;
  final AthleteDiscoverSort sort;
  final ValueChanged<AthleteDiscoverSort> onSortChanged;

  static const _sortLabels = {
    AthleteDiscoverSort.ranking: 'Ranking',
    AthleteDiscoverSort.proximity: 'Proximidade',
    AthleteDiscoverSort.level: 'Nível',
  };

  @override
  Widget build(BuildContext context) {
    final onlinePart = online != null ? ' · $online online' : '';
    return Row(
      children: [
        Expanded(
          child: Text(
            '$total ATLETAS$onlinePart',
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: context.themeColors.onSurfaceMuted,
              letterSpacing: 0.5,
            ),
          ),
        ),
        PopupMenuButton<AthleteDiscoverSort>(
          initialValue: sort,
          onSelected: onSortChanged,
          color: context.themeColors.surfaceCard,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Ordenar',
                style: AppTypography.soraRegular(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: AppColors.brand,
                ),
              ),
              SizedBox(width: 4),
              Text(
                _sortLabels[sort]!,
                style: AppTypography.mono(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
              Icon(
                Icons.expand_more_rounded,
                size: 18,
                color: AppColors.brand,
              ),
            ],
          ),
          itemBuilder: (context) => AthleteDiscoverSort.values
              .map(
                (s) => PopupMenuItem(
                  value: s,
                  child: Text(_sortLabels[s]!),
                ),
              )
              .toList(),
        ),
      ],
    );
  }
}

class _DiscoverBody extends StatelessWidget {
  const _DiscoverBody({
    required this.state,
    required this.scrollController,
    required this.onRefresh,
    required this.onInvite,
  });

  final AthleteDiscoverState state;
  final ScrollController scrollController;
  final Future<void> Function() onRefresh;
  final VoidCallback onInvite;

  @override
  Widget build(BuildContext context) {
    if (state.isLoading && state.displayEntries.isEmpty) {
      return Center(
        child: CircularProgressIndicator(color: AppColors.brand),
      );
    }

    if (state.errorMessage != null && state.displayEntries.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            'Não foi possível carregar atletas.\n${state.errorMessage}',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.live),
          ),
        ),
      );
    }

    if (state.displayEntries.isEmpty) {
      return RefreshIndicator(
        color: AppColors.brand,
        onRefresh: onRefresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            SizedBox(height: 80),
            Center(
              child: Text(
                'Nenhum atleta encontrado.',
                style: TextStyle(color: context.themeColors.onSurfaceMuted),
              ),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      color: AppColors.brand,
      onRefresh: onRefresh,
      child: ListView.separated(
        controller: scrollController,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        itemCount: state.displayEntries.length + 1,
        separatorBuilder: (_, __) => SizedBox(height: 12),
        itemBuilder: (context, index) {
          if (index == state.displayEntries.length) {
            if (state.isLoadingMore) {
              return Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Center(
                  child: CircularProgressIndicator(
                    color: AppColors.brand,
                    strokeWidth: 2,
                  ),
                ),
              );
            }
            return SizedBox(height: 8);
          }

          final entry = state.displayEntries[index];
          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: AthleteDiscoverCard(entry: entry)),
              SizedBox(width: 8),
              IconButton(
                onPressed: onInvite,
                icon: Icon(Icons.bolt_rounded),
                color: AppColors.brand,
                tooltip: 'Convidar',
              ),
            ],
          );
        },
      ),
    );
  }
}
