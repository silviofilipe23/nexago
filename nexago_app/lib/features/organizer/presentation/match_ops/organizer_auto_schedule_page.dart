import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../domain/match_ops/match_ops_providers.dart';
import '../../domain/match_ops/schedule_grid_logic.dart';
import '../../domain/tournament_ops/tournament_ops_providers.dart';
import '../../../tournaments/domain/tournament_match.dart';
import '../../../tournaments/domain/tournament_match_card_view_model.dart';
import 'widgets/organizer_auto_schedule_widgets.dart';
import 'widgets/organizer_court_schedule_grid_widgets.dart';
import 'widgets/organizer_match_live_table_widgets.dart';
import 'widgets/organizer_schedule_pick_widgets.dart';

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
  bool _loading = false;
  Map<String, dynamic>? _preview;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _run(preview: true));
  }

  Future<void> _run({required bool preview}) async {
    setState(() => _loading = true);
    try {
      final dayKey =
          ref.read(organizerScheduleDayKeyProvider(widget.tournamentId));
      final service = ref.read(organizerMatchScheduleServiceProvider);
      final result = await service.autoScheduleTournamentDay(
        tournamentId: widget.tournamentId,
        dayKey: dayKey,
        preview: preview,
        avoidAthleteConflict: _avoidConflict,
        respectBracketDeps: _respectDeps,
      );
      if (!mounted) return;
      setState(() => _preview = result);
      if (!preview) {
        showAppSnackBar(context, 'Grade aplicada com sucesso.');
        await _run(preview: true);
      }
    } catch (e) {
      if (mounted) showAppSnackBar(context, 'Erro: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
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
                      ref
                          .read(
                            organizerScheduleDayKeyProvider(widget.tournamentId)
                                .notifier,
                          )
                          .select(key);
                      setState(() => _preview = null);
                      _run(preview: true);
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
