import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../../domain/match_ops/match_ops_providers.dart';
import '../../../domain/match_ops/schedule_grid_logic.dart';
import '../../../domain/match_ops/schedule_time_logic.dart';
import '../../../domain/tournament_ops/tournament_ops_providers.dart';
import '../../../../tournaments/domain/tournament_match.dart';
import '../widgets/organizer_match_live_table_widgets.dart';
import '../widgets/organizer_schedule_match_sheet_widgets.dart';
import '../widgets/organizer_schedule_pick_widgets.dart';
import '../widgets/organizer_schedule_time_widgets.dart';

Future<void> showOrganizerScheduleMatchSheet(
  BuildContext context, {
  required String tournamentId,
  required TournamentMatch match,
  required List<TournamentCourt> courts,
  required List<TournamentMatch> allMatches,
  required TournamentMatchOpsConfig config,
  String? dayKey,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.themeColors.surfaceCard,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.88,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (context, scrollController) => _OrganizerScheduleMatchSheet(
        tournamentId: tournamentId,
        match: match,
        courts: courts,
        allMatches: allMatches,
        config: config,
        dayKey: dayKey,
        scrollController: scrollController,
      ),
    ),
  );
}

class _OrganizerScheduleMatchSheet extends ConsumerStatefulWidget {
  const _OrganizerScheduleMatchSheet({
    required this.tournamentId,
    required this.match,
    required this.courts,
    required this.allMatches,
    required this.config,
    this.dayKey,
    this.scrollController,
  });

  final String tournamentId;
  final TournamentMatch match;
  final List<TournamentCourt> courts;
  final List<TournamentMatch> allMatches;
  final TournamentMatchOpsConfig config;
  final String? dayKey;
  final ScrollController? scrollController;

  @override
  ConsumerState<_OrganizerScheduleMatchSheet> createState() =>
      _OrganizerScheduleMatchSheetState();
}

class _OrganizerScheduleMatchSheetState
    extends ConsumerState<_OrganizerScheduleMatchSheet> {
  late String _courtId;
  late DateTime _selectedSlot;
  DateTime? _previousTime;
  bool _slotsExpanded = false;
  bool _saving = false;

  String _effectiveDayKey(WidgetRef ref) {
    final passed = widget.dayKey?.trim() ?? '';
    if (passed.isNotEmpty) return passed;
    return ref.watch(organizerScheduleDayKeyProvider(widget.tournamentId));
  }

  String _initialDayKey(WidgetRef ref) {
    final passed = widget.dayKey?.trim() ?? '';
    if (passed.isNotEmpty) return passed;
    return ref.read(organizerScheduleDayKeyProvider(widget.tournamentId));
  }

  @override
  void initState() {
    super.initState();
    final dayKey = _initialDayKey(ref);
    final dayMatches = MatchOpsLogic.matchesForDay(
      widget.allMatches,
      dayKey,
    );
    final slots = ScheduleTimeLogic.timeSlotsForDay(
      dayKey: dayKey,
      config: widget.config,
    );

    _previousTime = widget.match.scheduleTime;
    _courtId = ScheduleTimeLogic.initialCourtId(
      match: widget.match,
      courts: widget.courts,
      dayMatches: dayMatches,
      config: widget.config,
      dayKey: dayKey,
    );
    _selectedSlot = ScheduleTimeLogic.slotOnDay(
      slot: ScheduleTimeLogic.initialSlot(
        match: widget.match,
        dayMatches: dayMatches,
        courts: widget.courts,
        config: widget.config,
        dayKey: dayKey,
        slots: slots,
      ),
      dayKey: dayKey,
      config: widget.config,
    );
  }

  ScheduleConflict? _displayConflict({
    required DateTime slotStart,
    required String courtId,
    String? courtName,
  }) {
    final conflicts = ScheduleTimeLogic.conflictsFor(
      match: widget.match,
      courtId: courtId,
      slotStart: slotStart,
      durationMin: widget.config.defaultMatchDurationMin,
      allMatches: widget.allMatches,
      minRestMin: widget.config.minRestBetweenMatchesMin,
      courtName: courtName,
    );
    for (final conflict in conflicts) {
      if (conflict.type == 'rest') return conflict;
    }
    return null;
  }

  Future<void> _save() async {
    if (_saving || widget.courts.isEmpty) return;
    setState(() => _saving = true);
    try {
      final dayKey = _effectiveDayKey(ref);
      final start = _selectedSlot;
      final end = start.add(
        Duration(minutes: widget.config.defaultMatchDurationMin),
      );
      final service = ref.read(organizerMatchScheduleServiceProvider);
      final isReschedule = widget.match.scheduleTime != null;
      final result = isReschedule
          ? await service.rescheduleMatch(
              matchId: widget.match.id,
              courtId: _courtId,
              scheduleTime: start,
              scheduleEndTime: end,
              dayKey: dayKey,
            )
          : await service.scheduleMatch(
              matchId: widget.match.id,
              courtId: _courtId,
              scheduleTime: start,
              scheduleEndTime: end,
              dayKey: dayKey,
            );
      if (!mounted) return;
      final warnings = result['warnings'];
      if (warnings is List && warnings.isNotEmpty) {
        showAppSnackBar(context, 'Agendado com avisos de descanso.');
      } else {
        showAppSnackBar(
          context,
          isReschedule ? 'Horário atualizado.' : 'Partida agendada.',
        );
      }
      Navigator.of(context).pop();
    } catch (e) {
      if (mounted) showAppSnackBar(context, 'Erro: $e');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dayKey = _effectiveDayKey(ref);
    final slots = ScheduleTimeLogic.timeSlotsForDay(
      dayKey: dayKey,
      config: widget.config,
    );
    final categories =
        ref
            .watch(organizerTournamentDetailProvider(widget.tournamentId))
            .valueOrNull
            ?.categories ??
        const [];
    final enriched =
        ref.watch(organizerMatchCardsByIdProvider(widget.tournamentId)).valueOrNull?[widget.match.id];
    final categoryLabel = MatchOpsLogic.categoryCompactLabel(
      categoryId: widget.match.categoryId,
      categories: categories,
    );
    final selectedCourtName = widget.courts
        .where((court) => court.id == _courtId)
        .map((court) => court.name)
        .firstOrNull;
    final conflict = _displayConflict(
      slotStart: _selectedSlot,
      courtId: _courtId,
      courtName: selectedCourtName,
    );
    final programLabel =
        'PROGRAMAÇÃO • ${ScheduleGridLogic.programDayDateLabel(dayKey)}';

    return Column(
      children: [
        ScheduleMatchSheetChrome(
          programLabel: programLabel,
          onClose: () => Navigator.of(context).pop(),
        ),
        Expanded(
          child: ListView(
            controller: widget.scrollController,
            padding: EdgeInsets.only(
              bottom: MediaQuery.of(context).viewInsets.bottom + 8,
            ),
            children: [
              ScheduleMatchSheetMatchCard(
                match: widget.match,
                categoryLabel: categoryLabel,
                teamA: schedulePickTeamData(
                  match: widget.match,
                  sideA: true,
                  enriched: enriched,
                ),
                teamB: schedulePickTeamData(
                  match: widget.match,
                  sideA: false,
                  enriched: enriched,
                ),
                seedA: liveTableTeamSeed(widget.match, sideA: true),
                seedB: liveTableTeamSeed(widget.match, sideA: false),
              ),
              if (widget.courts.isNotEmpty)
                ScheduleMatchSheetCourtPicker(
                  courts: widget.courts,
                  selectedCourtId: _courtId,
                  onCourtSelected: (id) => setState(() => _courtId = id),
                ),
              ScheduleMatchSheetTimeCompare(
                before: _previousTime,
                after: _selectedSlot,
                afterLabel: ScheduleGridLogic.timeLabel(_selectedSlot),
                slotsExpanded: _slotsExpanded,
                onTap: () => setState(() => _slotsExpanded = !_slotsExpanded),
              ),
              if (_slotsExpanded)
                ScheduleTimeSlotPicker(
                  slots: slots,
                  selectedSlot: _selectedSlot,
                  onSlotSelected: (slot) {
                    setState(() {
                      _selectedSlot = ScheduleTimeLogic.slotOnDay(
                        slot: slot,
                        dayKey: dayKey,
                        config: widget.config,
                      );
                    });
                  },
                ),
              if (conflict != null)
                ScheduleTimeConflictCard(
                  title: ScheduleTimeLogic.conflictTitle(conflict),
                  message: conflict.message,
                ),
            ],
          ),
        ),
        ScheduleMatchSheetConfirmBar(
          saving: _saving,
          enabled: widget.courts.isNotEmpty,
          onConfirm: _save,
        ),
      ],
    );
  }
}
