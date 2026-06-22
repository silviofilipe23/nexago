import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:share_plus/share_plus.dart';

import '../../domain/tournament_uniforms/tournament_uniforms_logic.dart';
import '../../domain/tournament_uniforms/tournament_uniforms_models.dart';
import '../../domain/tournament_uniforms/tournament_uniforms_providers.dart';
import 'widgets/uniforms/organizer_uniforms_athlete_tile.dart';
import 'widgets/uniforms/organizer_uniforms_category_chips.dart';
import 'widgets/uniforms/organizer_uniforms_kpi_row.dart';
import 'widgets/uniforms/organizer_uniforms_size_panel.dart';

class OrganizerTournamentUniformsPage extends ConsumerStatefulWidget {
  const OrganizerTournamentUniformsPage({
    super.key,
    required this.tournamentId,
    this.initialCategoryId,
  });

  final String tournamentId;
  final String? initialCategoryId;

  @override
  ConsumerState<OrganizerTournamentUniformsPage> createState() =>
      _OrganizerTournamentUniformsPageState();
}

class _OrganizerTournamentUniformsPageState
    extends ConsumerState<OrganizerTournamentUniformsPage> {
  @override
  void initState() {
    super.initState();
    final categoryId = widget.initialCategoryId?.trim();
    if (categoryId != null && categoryId.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ref.read(organizerTournamentUniformsFilterProvider.notifier).state =
            OrganizerUniformsFilter(categoryId: categoryId);
      });
    }
  }

  void _togglePendingFilter() {
    final current = ref.read(organizerTournamentUniformsFilterProvider);
    ref.read(organizerTournamentUniformsFilterProvider.notifier).state =
        current.copyWith(
          pendingOnly: !current.pendingOnly,
          clearSizeTop: true,
        );
  }

  void _selectSize(String size) {
    final current = ref.read(organizerTournamentUniformsFilterProvider);
    final next = current.sizeTop == size
        ? null
        : size;
    ref.read(organizerTournamentUniformsFilterProvider.notifier).state =
        current.copyWith(
          sizeTop: next,
          pendingOnly: false,
          clearSizeTop: next == null,
        );
  }

  void _selectPendingFromSizePanel() {
    final current = ref.read(organizerTournamentUniformsFilterProvider);
    ref.read(organizerTournamentUniformsFilterProvider.notifier).state =
        current.copyWith(
          pendingOnly: true,
          clearSizeTop: true,
        );
  }

  void _clearFilters() {
    ref.read(organizerTournamentUniformsFilterProvider.notifier).state =
        const OrganizerUniformsFilter();
  }

  void _selectCategory(String? categoryId) {
    final current = ref.read(organizerTournamentUniformsFilterProvider);
    ref.read(organizerTournamentUniformsFilterProvider.notifier).state =
        current.copyWith(
          categoryId: categoryId,
          clearCategoryId: categoryId == null,
        );
  }

  Future<void> _exportCsv(OrganizerUniformsState state) async {
    final csv = buildUniformsExportCsv(
      summary: state.summary,
      rows: state.rows,
      tournamentName: state.tournamentName,
    );
    await Share.share(
      csv,
      subject: 'Uniformes — ${state.tournamentName}',
    );
  }

  @override
  Widget build(BuildContext context) {
    final uniformsAsync = ref.watch(
      organizerTournamentUniformsProvider(widget.tournamentId),
    );
    final filter = ref.watch(organizerTournamentUniformsFilterProvider);
    final filteredRows = ref.watch(
      organizerTournamentUniformsFilteredProvider(widget.tournamentId),
    );

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: uniformsAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('Erro ao carregar uniformes: $e')),
          data: (state) {
            if (!state.isUniformEnabled) {
              return _EmptyUniformKit(
                onBack: () => context.pop(),
              );
            }

            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _UniformsHeader(
                  tournamentName: state.tournamentName,
                  locationLine: state.locationLine,
                  onBack: () => context.pop(),
                  onExport: () => _exportCsv(state),
                ),
                const SizedBox(height: 12),
                OrganizerUniformsKpiRow(
                  summary: state.summary,
                  pendingFilterActive: filter.pendingOnly,
                  onPendingTap: _togglePendingFilter,
                ),
                OrganizerUniformsSizePanel(
                  summary: state.summary,
                  selectedSize: filter.sizeTop,
                  pendingFilterActive: filter.pendingOnly,
                  onSizeSelected: _selectSize,
                  onPendingSelected: _selectPendingFromSizePanel,
                  onClearFilters: _clearFilters,
                ),
                const SizedBox(height: 12),
                OrganizerUniformsCategoryChips(
                  totalAthletes: state.summary.totalAthletes,
                  chips: state.categoryChips,
                  selectedCategoryId: filter.categoryId,
                  onSelected: _selectCategory,
                ),
                const SizedBox(height: 10),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${filteredRows.length} DE ${state.summary.totalAthletes} UNIFORMES',
                          style: AppTypography.mono(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: context.themeColors.onSurfaceMuted,
                            letterSpacing: 0.4,
                          ),
                        ),
                      ),
                      Text(
                        'TAM · Nº',
                        style: AppTypography.mono(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: context.themeColors.onSurfaceMuted,
                          letterSpacing: 0.4,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 6),
                Expanded(
                  child: filteredRows.isEmpty
                      ? Center(
                          child: Text(
                            'Nenhum atleta neste filtro.',
                            style: AppTypography.soraRegular(
                              fontSize: 14,
                              color: context.themeColors.onSurfaceMuted,
                            ),
                          ),
                        )
                      : ListView.builder(
                          padding: const EdgeInsets.only(bottom: 16),
                          itemCount: filteredRows.length,
                          itemBuilder: (context, index) =>
                              OrganizerUniformsAthleteTile(
                            row: filteredRows[index],
                          ),
                        ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _UniformsHeader extends StatelessWidget {
  const _UniformsHeader({
    required this.tournamentName,
    required this.locationLine,
    required this.onBack,
    required this.onExport,
  });

  final String tournamentName;
  final String locationLine;
  final VoidCallback onBack;
  final VoidCallback onExport;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          IconButton(
            onPressed: onBack,
            icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (locationLine.isNotEmpty) ...[
                  Text(
                    locationLine.toUpperCase(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.mono(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: AppColors.brand,
                      letterSpacing: 0.6,
                    ),
                  ),
                  const SizedBox(height: 4),
                ],
                Text(
                  'Uniformes',
                  style: AppTypography.soraRegular(
                    fontSize: 26,
                    fontWeight: FontWeight.w900,
                    color: context.themeColors.onSurface,
                    height: 1.05,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: onExport,
            icon: const Icon(Icons.download_rounded),
            tooltip: 'Exportar CSV',
          ),
        ],
      ),
    );
  }
}

class _EmptyUniformKit extends StatelessWidget {
  const _EmptyUniformKit({required this.onBack});

  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: IconButton(
              onPressed: onBack,
              icon: const Icon(Icons.arrow_back_ios_new_rounded),
            ),
          ),
          const Spacer(),
          Icon(
            Icons.checkroom_outlined,
            size: 48,
            color: context.themeColors.onSurfaceMuted,
          ),
          const SizedBox(height: 16),
          Text(
            'Este torneio não usa uniforme na inscrição.',
            textAlign: TextAlign.center,
            style: AppTypography.soraRegular(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: context.themeColors.onSurface,
            ),
          ),
          const Spacer(),
        ],
      ),
    );
  }
}
