import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../domain/match_ops/match_ops_providers.dart';
import '../../domain/match_ops/schedule_grid_logic.dart';
import '../../domain/tournament_ops/tournament_ops_providers.dart';
import '../../../tournaments/domain/tournament_match.dart';
import 'organizer_match_navigation.dart';
import 'sheets/organizer_schedule_match_sheet.dart';
import 'widgets/organizer_court_schedule_grid_widgets.dart';

/// H1 — Grade do dia.
class OrganizerCourtScheduleGridPage extends ConsumerStatefulWidget {
  const OrganizerCourtScheduleGridPage({
    super.key,
    required this.tournamentId,
  });

  final String tournamentId;

  @override
  ConsumerState<OrganizerCourtScheduleGridPage> createState() =>
      _OrganizerCourtScheduleGridPageState();
}

class _OrganizerCourtScheduleGridPageState
    extends ConsumerState<OrganizerCourtScheduleGridPage> {
  String? _draggingMatchId;
  Timer? _clockTimer;
  late final ScrollController _gridHorizontalScrollController;
  late final ScrollController _headerHorizontalScrollController;

  @override
  void initState() {
    super.initState();
    _gridHorizontalScrollController = ScrollController();
    _headerHorizontalScrollController = ScrollController();
    _gridHorizontalScrollController.addListener(_syncHeaderHorizontalScroll);
    _clockTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) setState(() {});
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      bootstrapOrganizerTournamentCourts(ref, widget.tournamentId);
    });
  }

  void _syncHeaderHorizontalScroll() {
    if (!_headerHorizontalScrollController.hasClients ||
        !_gridHorizontalScrollController.hasClients) {
      return;
    }
    final offset = _gridHorizontalScrollController.offset;
    if (_headerHorizontalScrollController.offset != offset) {
      _headerHorizontalScrollController.jumpTo(offset);
    }
  }

  @override
  void dispose() {
    _gridHorizontalScrollController.removeListener(_syncHeaderHorizontalScroll);
    _gridHorizontalScrollController.dispose();
    _headerHorizontalScrollController.dispose();
    _clockTimer?.cancel();
    super.dispose();
  }

  Map<String, String> _categoryLabels(
    List<TournamentMatch> matches,
    List<OrganizerTournamentCategorySummary> categories,
  ) {
    return {
      for (final match in matches)
        match.id: MatchOpsLogic.categoryCompactLabel(
          categoryId: match.categoryId,
          categories: categories,
        ),
    };
  }

  Map<String, List<TournamentMatch>> _categoryMatchesByCategoryId(
    List<TournamentMatch> matches,
  ) {
    final map = <String, List<TournamentMatch>>{};
    for (final match in matches) {
      map.putIfAbsent(match.categoryId, () => []).add(match);
    }
    return map;
  }

  Future<void> _dropMatch(
    TournamentMatch match,
    String courtId,
    DateTime slotStart,
    TournamentMatchOpsConfig config,
    String dayKey,
  ) async {
    setState(() => _draggingMatchId = null);
    final end = slotStart.add(
      Duration(minutes: config.defaultMatchDurationMin),
    );
    try {
      final service = ref.read(organizerMatchScheduleServiceProvider);
      if (match.scheduleTime == null) {
        await service.scheduleMatch(
          matchId: match.id,
          courtId: courtId,
          scheduleTime: slotStart,
          scheduleEndTime: end,
          dayKey: dayKey,
        );
      } else {
        await service.rescheduleMatch(
          matchId: match.id,
          courtId: courtId,
          scheduleTime: slotStart,
          scheduleEndTime: end,
          dayKey: dayKey,
        );
      }
      if (mounted) {
        showAppSnackBar(context, 'Horário atualizado.');
      }
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, 'Erro: $e');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(organizerMatchOpsStateProvider(widget.tournamentId));
    final courts = state.courts;
    final config = state.config;
    final tournamentDays =
        ref.watch(organizerScheduleGridDayKeysProvider(widget.tournamentId));
    final dayKey =
        ref.watch(organizerScheduleGridDayKeyProvider(widget.tournamentId));
    final allMatches =
        ref.watch(organizerTournamentMatchesProvider(widget.tournamentId))
            .valueOrNull ??
        const <TournamentMatch>[];
    final dayMatches = MatchOpsLogic.matchesForDay(allMatches, dayKey);
    final slots = ScheduleGridLogic.gridTimeSlotsForDay(
      dayKey: dayKey,
      dayMatches: dayMatches,
      defaultDurationMin: config.defaultMatchDurationMin,
    );
    final gridStart = slots.isNotEmpty
        ? slots.first
        : ScheduleGridLogic.gridDayAnchor(dayKey: dayKey, slots: slots);
    final scheduled = ScheduleGridLogic.scheduledMatches(dayMatches);
    final matchesByCourt = ScheduleGridLogic.matchesByCourtId(scheduled);
    final unscheduled = ScheduleGridLogic.unscheduledCount(dayMatches);
    final categories =
        ref
            .watch(organizerTournamentDetailProvider(widget.tournamentId))
            .valueOrNull
            ?.categories ??
        const [];
    final categoryLabels = _categoryLabels(dayMatches, categories);
    final categoryMatchesByCategoryId =
        _categoryMatchesByCategoryId(allMatches);
    final categoryAccentByCategoryId = ScheduleGridLogic.categoryAccentColors([
      for (final category in categories) category.categoryId,
      for (final match in allMatches) match.categoryId,
    ]);
    final enrichedByMatchId =
        ref
            .watch(organizerMatchCardsByIdProvider(widget.tournamentId))
            .valueOrNull ??
        const {};

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: courts.isEmpty
          ? const Center(child: Text('Configure quadras no torneio.'))
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SafeArea(
                  bottom: false,
                  child: ScheduleGridHeader(
                    programLabel:
                        'PROGRAMAÇÃO • ${ScheduleGridLogic.programDayDateLabel(dayKey).toUpperCase()}',
                    alertCount: unscheduled,
                    onBack: () => context.pop(),
                    onMore: () => context.push(
                      organizerMatchAutoSchedulePath(widget.tournamentId),
                    ),
                    dayPicker: ScheduleGridDayPicker(
                      tournamentDays: tournamentDays,
                      selectedDayKey: dayKey,
                      onDaySelected: (key) => ref
                          .read(
                            organizerScheduleGridDayKeyProvider(
                              widget.tournamentId,
                            ).notifier,
                          )
                          .select(key),
                    ),
                  ),
                ),
                ScheduleGridCourtHeaders(
                  courts: courts,
                  timeColumnWidth: ScheduleGridLogic.timeColumnWidth,
                  courtColumnWidth: ScheduleGridLogic.courtColumnWidth,
                  horizontalScrollController: _headerHorizontalScrollController,
                ),
                Expanded(
                  child: ScheduleGridBody(
                    courts: courts,
                    slots: slots,
                    gridStart: gridStart,
                    matchesByCourt: matchesByCourt,
                    categoryLabelsByMatchId: categoryLabels,
                    categoryAccentByCategoryId: categoryAccentByCategoryId,
                    categoryMatchesByCategoryId: categoryMatchesByCategoryId,
                    enrichedByMatchId: enrichedByMatchId,
                    defaultDurationMin: config.defaultMatchDurationMin,
                    draggingMatchId: _draggingMatchId,
                    selectedDayKey: dayKey,
                    horizontalScrollController: _gridHorizontalScrollController,
                    onMatchTap: (match) => showOrganizerScheduleMatchSheet(
                      context,
                      tournamentId: widget.tournamentId,
                      match: match,
                      courts: courts,
                      allMatches: allMatches,
                      config: config,
                      dayKey: dayKey,
                    ),
                    onDropMatch: (match, courtId, slotStart) => _dropMatch(
                      match,
                      courtId,
                      slotStart,
                      config,
                      dayKey,
                    ),
                    onDragStarted: (match) =>
                        setState(() => _draggingMatchId = match.id),
                    onDragEnded: () => setState(() => _draggingMatchId = null),
                  ),
                ),
                ScheduleGridActionBar(
                  onAuto: () => context.push(
                    organizerMatchAutoSchedulePath(widget.tournamentId),
                  ),
                  scheduleEnabled: unscheduled > 0,
                  onSchedule: () => context.push(
                    organizerMatchSchedulePickPath(widget.tournamentId),
                  ),
                ),
              ],
            ),
    );
  }
}
