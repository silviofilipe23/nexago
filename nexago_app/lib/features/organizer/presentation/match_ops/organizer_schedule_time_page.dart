import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../domain/match_ops/match_ops_providers.dart';
import '../../domain/match_ops/schedule_grid_logic.dart';
import '../../domain/match_ops/schedule_time_logic.dart';
import '../../domain/tournament_ops/tournament_ops_providers.dart';
import '../../../tournaments/domain/tournament_match.dart';
import 'widgets/organizer_court_schedule_grid_widgets.dart';
import 'widgets/organizer_match_live_table_widgets.dart';
import 'widgets/organizer_schedule_pick_widgets.dart';
import 'widgets/organizer_schedule_time_widgets.dart';

/// H2 — Selecionar quadra e horário para agendar partida.
class OrganizerScheduleTimePage extends ConsumerStatefulWidget {
  const OrganizerScheduleTimePage({
    super.key,
    required this.tournamentId,
    required this.matchId,
  });

  final String tournamentId;
  final String matchId;

  @override
  ConsumerState<OrganizerScheduleTimePage> createState() =>
      _OrganizerScheduleTimePageState();
}

class _OrganizerScheduleTimePageState
    extends ConsumerState<OrganizerScheduleTimePage> {
  String? _courtIdOverride;
  DateTime? _selectedSlotOverride;
  bool _saving = false;

  TournamentMatch? _findMatch(List<TournamentMatch> matches) {
    for (final match in matches) {
      if (match.id == widget.matchId) return match;
    }
    return null;
  }

  Future<void> _confirm({
    required TournamentMatch match,
    required TournamentMatchOpsConfig config,
    required String dayKey,
    required DateTime slotStart,
    required String courtId,
  }) async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      final durationMin = config.defaultMatchDurationMin;
      final end = slotStart.add(Duration(minutes: durationMin));
      final service = ref.read(organizerMatchScheduleServiceProvider);
      final result = await service.scheduleMatch(
        matchId: match.id,
        courtId: courtId,
        scheduleTime: slotStart,
        scheduleEndTime: end,
        dayKey: dayKey,
      );
      if (!mounted) return;
      final warnings = result['warnings'];
      if (warnings is List && warnings.isNotEmpty) {
        showAppSnackBar(context, 'Agendado com avisos de descanso.');
      } else {
        showAppSnackBar(context, 'Partida agendada.');
      }
      context.pop();
    } catch (e) {
      if (mounted) showAppSnackBar(context, 'Erro: $e');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(organizerMatchOpsStateProvider(widget.tournamentId));
    final allMatches =
        ref.watch(organizerTournamentMatchesProvider(widget.tournamentId))
            .valueOrNull ??
        const <TournamentMatch>[];
    final enrichedMap =
        ref.watch(organizerMatchCardsByIdProvider(widget.tournamentId));
    final categories =
        ref
            .watch(organizerTournamentDetailProvider(widget.tournamentId))
            .valueOrNull
            ?.categories ??
        const [];
    final dayKey =
        ref.watch(organizerScheduleDayKeyProvider(widget.tournamentId));
    final tournamentDays =
        ref.watch(organizerScheduleGridDayKeysProvider(widget.tournamentId));
    final dayMatches = MatchOpsLogic.matchesForDay(allMatches, dayKey);

    final match = _findMatch(allMatches);
    if (match == null) {
      return Scaffold(
        backgroundColor: context.themeColors.canvas,
        body: SafeArea(
          child: Column(
            children: [
              ScheduleTimeHeader(
                metaLabel: 'Partida',
                onBack: () => context.pop(),
              ),
              const Expanded(
                child: Center(child: Text('Partida não encontrada.')),
              ),
            ],
          ),
        ),
      );
    }

    final config = state.config;
    final courts = state.courts;
    final durationMin = config.defaultMatchDurationMin;
    final minRestMin = config.minRestBetweenMatchesMin;
    final slots = ScheduleTimeLogic.timeSlotsForDay(
      dayKey: dayKey,
      config: config,
    );
    final enriched = enrichedMap.valueOrNull?[match.id];
    final categoryLabel = MatchOpsLogic.categoryDisplayLabel(
      categoryId: match.categoryId,
      categories: categories,
    );
    final metaLabel = ScheduleGridLogic.matchMetaLabel(
      match: match,
      categoryLabel: categoryLabel,
    );

    final courtId = _courtIdOverride ??
        ScheduleTimeLogic.initialCourtId(
          match: match,
          courts: courts,
          dayMatches: dayMatches,
          config: config,
          dayKey: dayKey,
        );
    final slotStart = _selectedSlotOverride ??
        ScheduleTimeLogic.slotOnDay(
          slot: ScheduleTimeLogic.initialSlot(
            match: match,
            dayMatches: dayMatches,
            courts: courts,
            config: config,
            dayKey: dayKey,
            slots: slots,
          ),
          dayKey: dayKey,
          config: config,
        );
    final selectedCourtName = courts
        .where((court) => court.id == courtId)
        .map((court) => court.name)
        .firstOrNull;

    final conflicts = ScheduleTimeLogic.conflictsFor(
      match: match,
      courtId: courtId,
      slotStart: slotStart,
      durationMin: durationMin,
      allMatches: allMatches,
      minRestMin: minRestMin,
      courtName: selectedCourtName,
    );

    ScheduleConflict? displayConflict;
    for (final conflict in conflicts) {
      if (conflict.type == 'rest') {
        displayConflict = conflict;
        break;
      }
    }

    final confirmEnabled = courts.isNotEmpty;
    final confirmLabel = ScheduleTimeLogic.confirmLabel(slotStart: slotStart);

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
                ScheduleTimeHeader(
                  metaLabel: metaLabel,
                  onBack: () => context.pop(),
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
                      setState(() {
                        _selectedSlotOverride = null;
                        _courtIdOverride = null;
                      });
                    },
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ScheduleTimeMatchSummary(
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
                    seedA: liveTableTeamSeed(match, sideA: true),
                    seedB: liveTableTeamSeed(match, sideA: false),
                  ),
                  if (courts.isNotEmpty)
                    ScheduleTimeCourtPicker(
                      courts: courts,
                      selectedCourtId: courtId,
                      onCourtSelected: (id) =>
                          setState(() => _courtIdOverride = id),
                    ),
                  ScheduleTimeSlotPicker(
                    slots: slots,
                    selectedSlot: slotStart,
                    onSlotSelected: (slot) {
                      setState(() {
                        _selectedSlotOverride = ScheduleTimeLogic.slotOnDay(
                          slot: slot,
                          dayKey: dayKey,
                          config: config,
                        );
                      });
                    },
                  ),
                  if (displayConflict != null)
                    ScheduleTimeConflictCard(
                      title: ScheduleTimeLogic.conflictTitle(displayConflict),
                      message: displayConflict.message,
                    ),
                  const SizedBox(height: 16),
                ],
              ),
            ),
          ),
          ScheduleTimeActionBar(
            saving: _saving,
            confirmEnabled: confirmEnabled,
            confirmLabel: confirmLabel,
            onCancel: () => context.pop(),
            onConfirm: () => _confirm(
              match: match,
              config: config,
              dayKey: dayKey,
              slotStart: slotStart,
              courtId: courtId,
            ),
          ),
        ],
      ),
    );
  }
}
