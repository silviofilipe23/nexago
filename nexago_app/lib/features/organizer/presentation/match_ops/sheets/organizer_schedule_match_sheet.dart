import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../../domain/match_ops/match_ops_models.dart';
import '../../../domain/match_ops/match_ops_providers.dart';
import '../../../domain/match_ops/schedule_logic.dart';
import '../../../../tournaments/domain/tournament_match.dart';

Future<void> showOrganizerScheduleMatchSheet(
  BuildContext context, {
  required String tournamentId,
  required TournamentMatch match,
  required List<TournamentCourt> courts,
  required List<TournamentMatch> allMatches,
  required TournamentMatchOpsConfig config,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (ctx) => _OrganizerScheduleMatchSheet(
      tournamentId: tournamentId,
      match: match,
      courts: courts,
      allMatches: allMatches,
      config: config,
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
  });

  final String tournamentId;
  final TournamentMatch match;
  final List<TournamentCourt> courts;
  final List<TournamentMatch> allMatches;
  final TournamentMatchOpsConfig config;

  @override
  ConsumerState<_OrganizerScheduleMatchSheet> createState() =>
      _OrganizerScheduleMatchSheetState();
}

class _OrganizerScheduleMatchSheetState
    extends ConsumerState<_OrganizerScheduleMatchSheet> {
  late String _courtId;
  late TimeOfDay _time;
  List<ScheduleConflict> _warnings = const [];
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _courtId = widget.match.courtId.isNotEmpty
        ? widget.match.courtId
        : widget.courts.firstOrNull?.id ?? 'Q1';
    final st = widget.match.scheduleTime ?? DateTime.now();
    _time = TimeOfDay(hour: st.hour, minute: st.minute);
    _recomputeWarnings();
  }

  void _recomputeWarnings() {
    final dayKey = widget.config.activeDayKey.isNotEmpty
        ? widget.config.activeDayKey
        : ScheduleLogic.dayKeyFromDate(DateTime.now());
    final parts = dayKey.split('-').map(int.parse).toList();
    final start = DateTime(
      parts[0],
      parts[1],
      parts[2],
      _time.hour,
      _time.minute,
    );
    final end = start.add(
      Duration(minutes: widget.config.defaultMatchDurationMin),
    );
    final overlap = ScheduleLogic.detectCourtOverlap(
      courtId: _courtId,
      scheduleStart: start,
      scheduleEnd: end,
      allMatches: widget.allMatches,
      excludeMatchId: widget.match.id,
    );
    final rest = ScheduleLogic.detectRestConflict(
      target: widget.match,
      scheduleStart: start,
      scheduleEnd: end,
      allMatches: widget.allMatches,
      minRestMin: widget.config.minRestBetweenMatchesMin,
    );
    setState(() {
      _warnings = [
        if (overlap != null) overlap,
        ...rest,
      ];
    });
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final dayKey = widget.config.activeDayKey.isNotEmpty
          ? widget.config.activeDayKey
          : ScheduleLogic.dayKeyFromDate(DateTime.now());
      final parts = dayKey.split('-').map(int.parse).toList();
      final start = DateTime(
        parts[0],
        parts[1],
        parts[2],
        _time.hour,
        _time.minute,
      );
      final end = start.add(
        Duration(minutes: widget.config.defaultMatchDurationMin),
      );
      final service = ref.read(organizerMatchScheduleServiceProvider);
      final result = await service.scheduleMatch(
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
        showAppSnackBar(context, 'Partida agendada.');
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
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Agendar partida',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          Text(widget.match.teamsLabel),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            value: _courtId,
            decoration: const InputDecoration(labelText: 'Quadra'),
            items: widget.courts
                .map((c) => DropdownMenuItem(value: c.id, child: Text(c.name)))
                .toList(),
            onChanged: (v) {
              if (v == null) return;
              setState(() => _courtId = v);
              _recomputeWarnings();
            },
          ),
          const SizedBox(height: 12),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Horário'),
            trailing: Text(_time.format(context)),
            onTap: () async {
              final picked = await showTimePicker(
                context: context,
                initialTime: _time,
              );
              if (picked != null) {
                setState(() => _time = picked);
                _recomputeWarnings();
              }
            },
          ),
          if (_warnings.isNotEmpty) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.pending.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final w in _warnings)
                    Text('• ${w.message}',
                        style: const TextStyle(color: AppColors.pending)),
                ],
              ),
            ),
          ],
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _saving ||
                    _warnings.any((w) => w.type == 'overlap')
                ? null
                : _save,
            style: FilledButton.styleFrom(backgroundColor: AppColors.brand),
            child: _saving
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Confirmar'),
          ),
        ],
      ),
    );
  }
}
