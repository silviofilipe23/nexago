import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../domain/match_ops/match_ops_models.dart';
import '../../domain/match_ops/match_ops_providers.dart';
import 'organizer_match_navigation.dart';
import 'widgets/organizer_match_card.dart';

/// G1 — Central de partidas.
class OrganizerMatchCenterPage extends ConsumerStatefulWidget {
  const OrganizerMatchCenterPage({
    super.key,
    required this.tournamentId,
    this.initialCategoryId = '',
  });

  final String tournamentId;
  final String initialCategoryId;

  @override
  ConsumerState<OrganizerMatchCenterPage> createState() =>
      _OrganizerMatchCenterPageState();
}

class _OrganizerMatchCenterPageState
    extends ConsumerState<OrganizerMatchCenterPage> {
  @override
  void initState() {
    super.initState();
    if (widget.initialCategoryId.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ref
            .read(
              organizerMatchCenterCategoryProvider(widget.tournamentId).notifier,
            )
            .select(widget.initialCategoryId);
      });
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref
          .read(organizerMatchOpsRepositoryProvider)
          .ensureCourtsInitialized(tournamentId: widget.tournamentId);
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(organizerMatchOpsStateProvider(widget.tournamentId));
    final filter = ref.watch(organizerMatchCenterFilterProvider(widget.tournamentId));
    final category =
        ref.watch(organizerMatchCenterCategoryProvider(widget.tournamentId));
    final matchesAsync =
        ref.watch(organizerTournamentMatchesProvider(widget.tournamentId));

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: AppBar(
        backgroundColor: context.themeColors.canvas,
        title: const Text('Central de partidas'),
        actions: [
          IconButton(
            icon: const Icon(Icons.insights_outlined),
            onPressed: () =>
                context.push(organizerMatchInsightsPath(widget.tournamentId)),
          ),
        ],
      ),
      body: matchesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Erro: $e')),
        data: (_) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _FilterRow(
              filter: filter,
              onFilter: (f) => ref
                  .read(organizerMatchCenterFilterProvider(widget.tournamentId).notifier)
                  .select(f),
            ),
            if (state.categories.isNotEmpty)
              SizedBox(
                height: 40,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: const Text('Todas'),
                        selected: category.isEmpty,
                        onSelected: (_) => ref
                            .read(organizerMatchCenterCategoryProvider(
                              widget.tournamentId,
                            ).notifier)
                            .select(''),
                      ),
                    ),
                    for (final cat in state.categories)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          label: Text(cat),
                          selected: category == cat,
                          onSelected: (_) => ref
                              .read(organizerMatchCenterCategoryProvider(
                                widget.tournamentId,
                              ).notifier)
                              .select(cat),
                        ),
                      ),
                  ],
                ),
              ),
            Expanded(
              child: ListView(
                children: [
                  if (state.sections.live.isNotEmpty) ...[
                    _SectionHeader(title: 'AO VIVO'),
                    for (final row in state.sections.live)
                      OrganizerMatchCard(
                        row: row,
                        onTap: () => context.push(
                          organizerMatchLivePath(
                            widget.tournamentId,
                            row.match.id,
                          ),
                        ),
                      ),
                  ],
                  if (state.sections.upcoming.isNotEmpty) ...[
                    _SectionHeader(title: 'A SEGUIR'),
                    for (final row in state.sections.upcoming)
                      OrganizerMatchCard(
                        row: row,
                        onTap: () => context.push(
                          organizerMatchCheckInPath(
                            widget.tournamentId,
                            row.match.id,
                          ),
                        ),
                      ),
                  ],
                  if (state.sections.finished.isNotEmpty) ...[
                    _SectionHeader(title: 'ENCERRADAS'),
                    for (final row in state.sections.finished)
                      OrganizerMatchCard(
                        row: row,
                        onTap: () => context.push(
                          organizerMatchSummaryPath(
                            widget.tournamentId,
                            row.match.id,
                          ),
                        ),
                      ),
                  ],
                  if (state.rows.isEmpty)
                    const Padding(
                      padding: EdgeInsets.all(32),
                      child: Center(child: Text('Nenhuma partida encontrada.')),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => context.push(
                    organizerMatchQueuePath(widget.tournamentId),
                  ),
                  icon: const Icon(Icons.queue_music_rounded),
                  label: const Text('Fila'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton.icon(
                  onPressed: () => context.push(
                    organizerMatchSchedulePath(widget.tournamentId),
                  ),
                  icon: const Icon(Icons.calendar_month_rounded),
                  label: const Text('Grade'),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FilterRow extends StatelessWidget {
  const _FilterRow({required this.filter, required this.onFilter});

  final OrganizerMatchCenterFilter filter;
  final ValueChanged<OrganizerMatchCenterFilter> onFilter;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: SegmentedButton<OrganizerMatchCenterFilter>(
        segments: const [
          ButtonSegment(value: OrganizerMatchCenterFilter.all, label: Text('Tudo')),
          ButtonSegment(value: OrganizerMatchCenterFilter.live, label: Text('Ao vivo')),
          ButtonSegment(
            value: OrganizerMatchCenterFilter.onCourt,
            label: Text('Em quadra'),
          ),
        ],
        selected: {filter},
        onSelectionChanged: (s) => onFilter(s.first),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
      child: Text(
        title,
        style: Theme.of(context).textTheme.labelLarge?.copyWith(
              color: context.themeColors.onSurfaceMuted,
              fontWeight: FontWeight.w700,
              letterSpacing: 1,
            ),
      ),
    );
  }
}
