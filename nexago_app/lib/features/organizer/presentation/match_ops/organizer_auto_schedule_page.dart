import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../domain/match_ops/match_ops_providers.dart';
import '../../domain/match_ops/schedule_grid_logic.dart';
import 'widgets/organizer_court_schedule_grid_widgets.dart';

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

  @override
  Widget build(BuildContext context) {
    final dayKey =
        ref.watch(organizerScheduleDayKeyProvider(widget.tournamentId));
    final tournamentDays =
        ref.watch(organizerScheduleGridDayKeysProvider(widget.tournamentId));
    final slots = (_preview?['slots'] as List?)?.cast<Map<String, dynamic>>() ??
        const <Map<String, dynamic>>[];
    final count = (_preview?['count'] as num?)?.toInt() ?? slots.length;

    return Scaffold(
      appBar: NexaAppBar(title: const Text('Auto-programação')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          ScheduleGridDayPicker(
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
          const SizedBox(height: 8),
          Text(
            'Dia: ${ScheduleGridLogic.programDayDateLabel(dayKey)}',
            style: Theme.of(context).textTheme.titleSmall,
          ),
          const SizedBox(height: 12),
          SwitchListTile(
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
            Text('Prévia: $count partidas'),
            if (slots.isEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(
                  'Nenhuma partida sem horário para este dia. '
                  'Partidas já agendadas ou concluídas não entram na prévia.',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                ),
              )
            else
              for (final slot in slots)
                ListTile(
                  dense: true,
                  title: Text(
                    '${slot['matchId'] ?? '—'} → ${slot['courtId'] ?? '—'}',
                  ),
                  subtitle: Text(_formatSlotTime(slot['start'] as String?)),
                ),
          ],
        ],
      ),
    );
  }
}
