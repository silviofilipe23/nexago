import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../domain/match_ops/match_ops_providers.dart';
import '../../domain/match_ops/schedule_grid_logic.dart';
import '../../domain/match_ops/schedule_pick_logic.dart';
import '../../domain/tournament_ops/tournament_ops_providers.dart';
import '../../../tournaments/domain/tournament_match.dart';
import 'organizer_match_navigation.dart';
import 'widgets/organizer_court_schedule_grid_widgets.dart';
import 'widgets/organizer_schedule_pick_widgets.dart';

/// H1.2 — Selecionar partida a agendar.
class OrganizerSchedulePickPage extends ConsumerStatefulWidget {
  const OrganizerSchedulePickPage({
    super.key,
    required this.tournamentId,
  });

  final String tournamentId;

  @override
  ConsumerState<OrganizerSchedulePickPage> createState() =>
      _OrganizerSchedulePickPageState();
}

class _OrganizerSchedulePickPageState
    extends ConsumerState<OrganizerSchedulePickPage> {
  SchedulePickTab _tab = SchedulePickTab.ready;
  String _categoryId = '';
  String? _selectedMatchId;

  void _selectMatch(TournamentMatch match) {
    if (!SchedulePickLogic.isReady(match)) return;
    setState(() {
      _selectedMatchId =
          _selectedMatchId == match.id ? null : match.id;
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(organizerMatchOpsStateProvider(widget.tournamentId));
    final enrichedMap =
        ref.watch(organizerMatchCardsByIdProvider(widget.tournamentId));
    final categories =
        ref
            .watch(organizerTournamentDetailProvider(widget.tournamentId))
            .valueOrNull
            ?.categories ??
        const [];
    final config = state.config;
    final courts = state.courts;
    final dayKey = ref.watch(organizerScheduleDayKeyProvider(widget.tournamentId));
    final tournamentDays =
        ref.watch(organizerScheduleGridDayKeysProvider(widget.tournamentId));
    final allMatches =
        ref.watch(organizerTournamentMatchesProvider(widget.tournamentId))
            .valueOrNull ??
        const <TournamentMatch>[];
    final dayMatches = MatchOpsLogic.matchesForDay(allMatches, dayKey);

    final filteredByCategory = SchedulePickLogic.filterByCategory(
      dayMatches,
      categoryId: _categoryId,
    );
    final counts = SchedulePickLogic.tabCounts(filteredByCategory);
    final visibleMatches = SchedulePickLogic.sortedForDisplay(
      SchedulePickLogic.matchesForTab(filteredByCategory, _tab),
    );
    final suggestions = SchedulePickLogic.suggestSlotsForDay(
      dayMatches: dayMatches,
      courts: courts,
      config: config,
      dayKey: dayKey,
    );

    TournamentMatch? selectedMatch;
    if (_selectedMatchId != null) {
      for (final match in visibleMatches) {
        if (match.id == _selectedMatchId) {
          selectedMatch = match;
          break;
        }
      }
      if (selectedMatch == null) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) setState(() => _selectedMatchId = null);
        });
      }
    }

    final canSchedule =
        selectedMatch != null && SchedulePickLogic.isReady(selectedMatch);
    final ctaLabel = selectedMatch == null
        ? 'Agendar partida'
        : SchedulePickLogic.scheduleCtaLabel(
            match: selectedMatch,
            teamLabel: schedulePickTeamData(
              match: selectedMatch,
              sideA: true,
              enriched: enrichedMap.valueOrNull?[selectedMatch.id],
            ).label,
          );

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SafeArea(
            bottom: false,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SchedulePickHeader(
                  programLabel:
                      'PROGRAMAÇÃO • ${ScheduleGridLogic.programDayDateLabel(dayKey).toUpperCase()}',
                  onBack: () => context.pop(),
                  onMore: () => context.push(
                    organizerMatchAutoSchedulePath(widget.tournamentId),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                  child: ScheduleGridDayPicker(
                    tournamentDays: tournamentDays,
                    selectedDayKey: dayKey,
                    onDaySelected: (key) {
                      ref
                          .read(
                            organizerScheduleDayKeyProvider(
                              widget.tournamentId,
                            ).notifier,
                          )
                          .select(key);
                      setState(() => _selectedMatchId = null);
                    },
                  ),
                ),
              ],
            ),
          ),
          SchedulePickTabRow(
            activeTab: _tab,
            counts: counts,
            onTabChanged: (tab) => setState(() {
              _tab = tab;
              _selectedMatchId = null;
            }),
          ),
          const SizedBox(height: 12),
          SchedulePickCategoryChips(
            categories: categories,
            selectedCategoryId: _categoryId,
            onSelected: (id) => setState(() {
              _categoryId = id;
              _selectedMatchId = null;
            }),
          ),
          SchedulePickSectionHeader(activeTab: _tab),
          Expanded(
            child: visibleMatches.isEmpty
                ? Center(
                    child: Text(
                      _emptyMessage(_tab),
                      style: TextStyle(
                        color: context.themeColors.onSurfaceMuted,
                      ),
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.only(bottom: 16),
                    itemCount: visibleMatches.length,
                    itemBuilder: (context, index) {
                      final match = visibleMatches[index];
                      final enriched = enrichedMap.valueOrNull?[match.id];
                      final selectable = SchedulePickLogic.isReady(match) &&
                          _tab != SchedulePickTab.blocked;
                      final suggestion = suggestions[match.id];

                      return SchedulePickMatchCard(
                        match: match,
                        categoryLabel: MatchOpsLogic.categoryCompactLabel(
                          categoryId: match.categoryId,
                          categories: categories,
                        ),
                        teamA: schedulePickTeamData(
                          match: match,
                          sideA: true,
                          enriched: enriched,
                        ),
                        teamB: schedulePickTeamData(
                          match: match,
                          sideA: false,
                          enriched: enriched,
                        ),
                        suggestionLabel: suggestion?.label,
                        selected: _selectedMatchId == match.id,
                        selectable: selectable,
                        onTap: () => _selectMatch(match),
                      );
                    },
                  ),
          ),
          SchedulePickActionBar(
            scheduling: false,
            scheduleEnabled: canSchedule,
            scheduleLabel: ctaLabel,
            onAuto: () => context.push(
              organizerMatchAutoSchedulePath(widget.tournamentId),
            ),
            onSchedule: selectedMatch == null
                ? () {}
                : () => context.push(
                      organizerMatchScheduleTimePath(
                        widget.tournamentId,
                        selectedMatch!.id,
                      ),
                    ),
          ),
        ],
      ),
    );
  }

  String _emptyMessage(SchedulePickTab tab) {
    return switch (tab) {
      SchedulePickTab.ready => 'Nenhuma partida pronta para agendar.',
      SchedulePickTab.blocked => 'Nenhuma partida bloqueada.',
      SchedulePickTab.unscheduled => 'Nenhuma partida pendente.',
    };
  }
}
