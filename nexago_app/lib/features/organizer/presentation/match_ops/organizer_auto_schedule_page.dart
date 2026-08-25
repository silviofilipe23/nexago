import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../domain/match_ops/match_ops_providers.dart';
import '../../domain/match_ops/schedule_grid_logic.dart';
import '../../domain/match_ops/schedule_time_logic.dart';
import '../../domain/tournament_ops/tournament_ops_providers.dart';
import '../../../tournaments/domain/tournament_discovery_providers.dart';
import '../../../tournaments/domain/tournament_match.dart';
import '../../../tournaments/domain/tournament_match_card_view_model.dart';
import 'organizer_match_error.dart';
import 'widgets/organizer_auto_schedule_widgets.dart';
import 'widgets/organizer_court_schedule_grid_widgets.dart';
import 'widgets/organizer_match_live_table_widgets.dart';
import 'widgets/organizer_schedule_pick_widgets.dart';
import 'widgets/organizer_schedule_time_widgets.dart';

/// H3 — Auto-programação.
class OrganizerAutoSchedulePage extends ConsumerStatefulWidget {
  const OrganizerAutoSchedulePage({
    super.key,
    required this.tournamentId,
  });

  final String tournamentId;

  @override
  ConsumerState<OrganizerAutoSchedulePage> createState() =>
      _OrganizerAutoSchedulePageState();
}

class _OrganizerAutoSchedulePageState
    extends ConsumerState<OrganizerAutoSchedulePage> {
  bool _avoidConflict = true;
  bool _respectDeps = true;
  bool _savingDynamicReschedule = false;
  bool _loading = false;
  Map<String, dynamic>? _preview;
  String _scheduleFrom = kDefaultMatchOpsDayStart;
  int _runGeneration = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final config =
          ref.read(organizerMatchOpsStateProvider(widget.tournamentId)).config;
      final scheduleFrom = config.dayStart;
      setState(() => _scheduleFrom = scheduleFrom);
      _run(preview: true, scheduleFrom: scheduleFrom);
    });
  }

  DateTime _dayStartInstant({
    required String dayKey,
    required String scheduleFrom,
    required TournamentMatchOpsConfig config,
  }) {
    final slots = ScheduleTimeLogic.timeSlotsForDay(
      dayKey: dayKey,
      config: config,
    );
    for (final slot in slots) {
      if (ScheduleGridLogic.timeLabel(slot) == scheduleFrom) return slot;
    }
    if (slots.isNotEmpty) return slots.first;

    final parts = dayKey.split('-').map(int.tryParse).toList();
    final hm = scheduleFrom.split(':');
    final hour = int.tryParse(hm.first) ?? 7;
    final minute = hm.length > 1 ? int.tryParse(hm[1]) ?? 0 : 0;
    if (parts.length == 3 && parts.every((p) => p != null)) {
      return nexagoEventDateTime(
        year: parts[0]!,
        month: parts[1]!,
        day: parts[2]!,
        hour: hour,
        minute: minute,
      );
    }
    return nexagoEventNow();
  }

  Map<String, dynamic> _buildLocalPreview({
    required String dayKey,
    required String scheduleFrom,
    required TournamentMatchOpsConfig config,
    required List<TournamentCourt> courts,
    required List<TournamentMatch> allMatches,
  }) {
    final dayStart = _dayStartInstant(
      dayKey: dayKey,
      scheduleFrom: scheduleFrom,
      config: config,
    );
    final unscheduled = ScheduleLogic.filterAutoSchedulable(
      allMatches.where((m) {
        if (m.scheduleTime != null || m.isCompleted) return false;
        final matchDayKey = m.dayKey.trim();
        return matchDayKey.isEmpty || matchDayKey == dayKey;
      }).toList(),
      respectBracketDeps: _respectDeps,
    );
    final existingScheduled = allMatches.where((m) {
      if (m.scheduleTime == null) return false;
      if (m.courtId.isEmpty && m.effectiveCourtLabel.isEmpty) return false;
      final matchDayKey = m.dayKey.trim();
      if (matchDayKey.isNotEmpty) return matchDayKey == dayKey;
      return ScheduleLogic.dayKeyFromDate(m.scheduleTime!) == dayKey;
    }).toList();

    final slots = ScheduleLogic.buildDaySchedule(
      unscheduled: unscheduled,
      courts: courts,
      dayStart: dayStart,
      matchDurationMin: config.defaultMatchDurationMin,
      minRestMin: config.minRestBetweenMatchesMin,
      existingScheduled: existingScheduled,
      avoidAthleteConflict: _avoidConflict,
    );

    return {
      'count': slots.length,
      'slots': slots
          .map(
            (slot) => {
              'matchId': slot.matchId,
              'courtId': slot.courtId,
              'start': slot.start.toIso8601String(),
              'end': slot.end.toIso8601String(),
            },
          )
          .toList(),
    };
  }

  DateTime? _selectedScheduleFromSlot({
    required String dayKey,
    required TournamentMatchOpsConfig config,
  }) {
    final slots = ScheduleTimeLogic.timeSlotsForDay(
      dayKey: dayKey,
      config: config,
    );
    if (slots.isEmpty) return null;
    for (final slot in slots) {
      if (ScheduleGridLogic.timeLabel(slot) == _scheduleFrom) return slot;
    }
    return slots.first;
  }

  Future<List<TournamentMatch>> _refreshTournamentMatches() async {
    final tournamentId = widget.tournamentId.trim();
    final matches = await ref
        .read(tournamentMatchesRepositoryProvider)
        .getByTournamentId(tournamentId);
    ref.invalidate(organizerTournamentMatchesProvider(tournamentId));
    ref.invalidate(organizerMatchCardsByIdProvider(tournamentId));
    return matches;
  }

  Future<void> _run({required bool preview, String? scheduleFrom}) async {
    final effectiveScheduleFrom = scheduleFrom ?? _scheduleFrom;
    final generation = ++_runGeneration;
    setState(() => _loading = true);
    try {
      final dayKey =
          ref.read(organizerScheduleDayKeyProvider(widget.tournamentId));
      final opsState =
          ref.read(organizerMatchOpsStateProvider(widget.tournamentId));
      final config = opsState.config;
      final courts = opsState.courts;
      final allMatches =
          ref.read(organizerTournamentMatchesProvider(widget.tournamentId))
              .valueOrNull ??
          const <TournamentMatch>[];

      if (preview) {
        final result = _buildLocalPreview(
          dayKey: dayKey,
          scheduleFrom: effectiveScheduleFrom,
          config: config,
          courts: courts,
          allMatches: allMatches,
        );
        if (!mounted || generation != _runGeneration) return;
        setState(() => _preview = result);
        return;
      }

      final service = ref.read(organizerMatchScheduleServiceProvider);
      await service.autoScheduleTournamentDay(
        tournamentId: widget.tournamentId,
        dayKey: dayKey,
        preview: false,
        avoidAthleteConflict: _avoidConflict,
        respectBracketDeps: _respectDeps,
        dayStart: effectiveScheduleFrom,
      );
      if (!mounted || generation != _runGeneration) return;
      showAppSnackBar(context, 'Grade aplicada com sucesso.');
      final refreshedMatches = await _refreshTournamentMatches();
      if (!mounted || generation != _runGeneration) return;
      final result = _buildLocalPreview(
        dayKey: dayKey,
        scheduleFrom: effectiveScheduleFrom,
        config: config,
        courts: courts,
        allMatches: refreshedMatches,
      );
      if (!mounted || generation != _runGeneration) return;
      setState(() => _preview = result);
    } catch (e) {
      if (mounted && generation == _runGeneration) {
        showAppSnackBar(context, friendlyScheduleError(e), isError: true);
      }
    } finally {
      if (mounted && generation == _runGeneration) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _toggleDynamicReschedule(bool value) async {
    setState(() => _savingDynamicReschedule = true);
    try {
      final service = ref.read(organizerMatchScheduleServiceProvider);
      await service.updateMatchOpsSettings(
        tournamentId: widget.tournamentId,
        dynamicRescheduleEnabled: value,
      );
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, friendlyScheduleError(e), isError: true);
      }
    } finally {
      if (mounted) setState(() => _savingDynamicReschedule = false);
    }
  }

  String _formatSlotTime(String? iso) {
    if (iso == null || iso.trim().isEmpty) return '—';
    final parsed = DateTime.tryParse(iso);
    if (parsed == null) return iso;
    return DateFormat('HH:mm').format(parsed.toLocal());
  }

  String _formatSlotTimeRange(Map<String, dynamic> slot) {
    final start = _formatSlotTime(slot['start'] as String?);
    final end = _formatSlotTime(slot['end'] as String?);
    if (start == '—') return '—';
    if (end == '—' || end == start) return start;
    return '$start–$end';
  }

  String _courtLabel(String courtId, List<TournamentCourt> courts) {
    for (final court in courts) {
      if (court.id == courtId) return court.name;
    }
    return courtId.trim().isEmpty ? '—' : courtId;
  }

  TournamentMatch? _findMatch(
    String matchId,
    List<TournamentMatch> matches,
  ) {
    for (final match in matches) {
      if (match.id == matchId) return match;
    }
    return null;
  }

  Widget _buildPreviewCard({
    required Map<String, dynamic> slot,
    required List<TournamentMatch> matches,
    required Map<String, TournamentMatchCardViewModel> enrichedByMatchId,
    required List<TournamentCourt> courts,
    required List<OrganizerTournamentCategorySummary> categories,
  }) {
    final matchId = (slot['matchId'] as String?)?.trim() ?? '';
    final courtId = (slot['courtId'] as String?)?.trim() ?? '';
    final timeRange = _formatSlotTimeRange(slot);
    final courtLabel = _courtLabel(courtId, courts);
    final match = _findMatch(matchId, matches);

    if (match == null) {
      return AutoSchedulePreviewMatchCard.fallback(
        categoryEyebrow:
            matchId.isEmpty ? 'PARTIDA' : matchId.toUpperCase(),
        phaseLabel: '',
        courtLabel: courtLabel,
        timeRange: timeRange,
      );
    }

    final enriched = enrichedByMatchId[match.id];
    final categoryLabel = MatchOpsLogic.categoryCompactLabel(
      categoryId: match.categoryId,
      categories: categories,
    );
    final categoryMatches = matches
        .where((m) => m.categoryId == match.categoryId)
        .toList(growable: false);

    return AutoSchedulePreviewMatchCard.fromMatch(
      match: match,
      categoryLabel: categoryLabel,
      categoryMatches: categoryMatches,
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
      courtLabel: courtLabel,
      timeRange: timeRange,
      seedA: liveTableTeamSeed(match, sideA: true),
      seedB: liveTableTeamSeed(match, sideA: false),
    );
  }

  @override
  Widget build(BuildContext context) {
    final dayKey =
        ref.watch(organizerScheduleDayKeyProvider(widget.tournamentId));
    final tournamentDays =
        ref.watch(organizerScheduleGridDayKeysProvider(widget.tournamentId));
    final slots = (_preview?['slots'] as List?)?.cast<Map<String, dynamic>>() ??
        const <Map<String, dynamic>>[];
    final count = (_preview?['count'] as num?)?.toInt() ?? slots.length;
    final matches =
        ref.watch(organizerTournamentMatchesProvider(widget.tournamentId))
            .valueOrNull ??
        const <TournamentMatch>[];
    final enrichedByMatchId =
        ref
            .watch(organizerMatchCardsByIdProvider(widget.tournamentId))
            .valueOrNull ??
        const <String, TournamentMatchCardViewModel>{};
    final courts =
        ref.watch(organizerMatchOpsStateProvider(widget.tournamentId)).courts;
    final config =
        ref.watch(organizerMatchOpsStateProvider(widget.tournamentId)).config;
    final scheduleFromSlots = ScheduleTimeLogic.timeSlotsForDay(
      dayKey: dayKey,
      config: config,
    );
    final selectedScheduleFromSlot = _selectedScheduleFromSlot(
      dayKey: dayKey,
      config: config,
    );
    final categories =
        ref
            .watch(organizerTournamentDetailProvider(widget.tournamentId))
            .valueOrNull
            ?.categories ??
        const <OrganizerTournamentCategorySummary>[];

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
                  title: 'Auto-programação',
                  onBack: () => context.pop(),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                  child: ScheduleGridDayPicker(
                    tournamentDays: tournamentDays,
                    selectedDayKey: dayKey,
                    onDaySelected: (key) {
                      final dayConfig = ref
                          .read(organizerMatchOpsStateProvider(widget.tournamentId))
                          .config;
                      ref
                          .read(
                            organizerScheduleDayKeyProvider(widget.tournamentId)
                                .notifier,
                          )
                          .select(key);
                      setState(() {
                        _preview = null;
                        _scheduleFrom = dayConfig.dayStart;
                      });
                      _run(preview: true, scheduleFrom: dayConfig.dayStart);
                    },
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 20),
              children: [
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Evitar conflito de atletas'),
                  value: _avoidConflict,
                  onChanged: _loading
                      ? null
                      : (v) {
                          setState(() => _avoidConflict = v);
                          _run(preview: true);
                        },
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Respeitar dependências da chave'),
                  value: _respectDeps,
                  onChanged: _loading
                      ? null
                      : (v) {
                          setState(() => _respectDeps = v);
                          _run(preview: true);
                        },
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Reagendamento dinâmico'),
                  subtitle: const Text(
                    'Recalcula automaticamente o horário das próximas '
                    'partidas da quadra quando uma termina antes/depois ou '
                    'vira W.O.',
                  ),
                  value: config.dynamicRescheduleEnabled,
                  onChanged: _savingDynamicReschedule
                      ? null
                      : _toggleDynamicReschedule,
                ),
                if (scheduleFromSlots.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: ScheduleTimeSlotPicker(
                      sectionTitle: 'COMEÇAR A PARTIR DAS',
                      slots: scheduleFromSlots,
                      selectedSlot: selectedScheduleFromSlot,
                      onSlotSelected: _loading
                          ? (_) {}
                          : (slot) {
                              final label = ScheduleGridLogic.timeLabel(slot);
                              if (label == _scheduleFrom) return;
                              setState(() {
                                _scheduleFrom = label;
                                _preview = null;
                              });
                              _run(preview: true, scheduleFrom: label);
                            },
                    ),
                  ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _loading ? null : () => _run(preview: true),
                        child: const Text('Recalcular'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: FilledButton(
                        onPressed: _loading || _preview == null || slots.isEmpty
                            ? null
                            : () => _run(preview: false),
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.brand,
                        ),
                        child: const Text('Aplicar'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                if (_loading && _preview == null)
                  const Center(child: CircularProgressIndicator())
                else ...[
                  Text(
                    'PRÉVIA • $count PARTIDAS',
                    style: AppTypography.mono(
                      fontSize: 9,
                      fontWeight: FontWeight.w800,
                      color: context.themeColors.onSurfaceMuted,
                      letterSpacing: 0.8,
                    ),
                  ),
                  if (slots.isEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Text(
                        'Nenhuma partida sem horário para este dia. '
                        'Partidas já agendadas ou concluídas não entram na prévia.',
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color:
                                  Theme.of(context).colorScheme.onSurfaceVariant,
                            ),
                      ),
                    )
                  else
                    for (final slot in slots)
                      Padding(
                        padding: const EdgeInsets.only(top: 10),
                        child: _buildPreviewCard(
                          slot: slot,
                          matches: matches,
                          enrichedByMatchId: enrichedByMatchId,
                          courts: courts,
                          categories: categories,
                        ),
                      ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
