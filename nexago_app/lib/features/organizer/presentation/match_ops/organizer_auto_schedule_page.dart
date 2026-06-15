import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../domain/match_ops/match_ops_providers.dart';
import '../../domain/match_ops/schedule_logic.dart';

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

  Future<void> _run({required bool preview}) async {
    setState(() => _loading = true);
    try {
      final config =
          ref.read(organizerMatchOpsConfigProvider(widget.tournamentId)).valueOrNull;
      final dayKey = config?.activeDayKey.isNotEmpty == true
          ? config!.activeDayKey
          : ScheduleLogic.dayKeyFromDate(DateTime.now());
      final service = ref.read(organizerMatchScheduleServiceProvider);
      final result = await service.autoScheduleTournamentDay(
        tournamentId: widget.tournamentId,
        dayKey: dayKey,
        preview: preview,
        avoidAthleteConflict: _avoidConflict,
        respectBracketDeps: _respectDeps,
      );
      setState(() => _preview = result);
      if (!preview && mounted) {
        showAppSnackBar(context, 'Grade aplicada com sucesso.');
      }
    } catch (e) {
      if (mounted) showAppSnackBar(context, 'Erro: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final slots = _preview?['slots'];
    final count = _preview?['count'] ?? 0;

    return Scaffold(
      appBar: AppBar(title: const Text('Auto-programação')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          SwitchListTile(
            title: const Text('Evitar conflito de atletas'),
            value: _avoidConflict,
            onChanged: (v) => setState(() => _avoidConflict = v),
          ),
          SwitchListTile(
            title: const Text('Respeitar dependências da chave'),
            value: _respectDeps,
            onChanged: (v) => setState(() => _respectDeps = v),
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
                  onPressed: _loading || _preview == null
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
          Text('Prévia: $count partidas'),
          if (slots is List)
            for (final slot in slots)
              if (slot is Map)
                ListTile(
                  dense: true,
                  title: Text('${slot['matchId']} → ${slot['courtId']}'),
                  subtitle: Text('${slot['start']}'),
                ),
        ],
      ),
    );
  }
}
