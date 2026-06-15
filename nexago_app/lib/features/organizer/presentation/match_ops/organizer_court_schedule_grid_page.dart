import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../domain/match_ops/match_ops_logic.dart';
import '../../domain/match_ops/match_ops_providers.dart';
import '../../domain/match_ops/schedule_logic.dart';
import 'organizer_match_navigation.dart';
import 'sheets/organizer_schedule_match_sheet.dart';

/// H1 — Grade do dia.
class OrganizerCourtScheduleGridPage extends ConsumerWidget {
  const OrganizerCourtScheduleGridPage({
    super.key,
    required this.tournamentId,
  });

  final String tournamentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(organizerMatchOpsStateProvider(tournamentId));
    final courts = state.courts;
    final dayMatches = [...state.dayMatches]
      ..sort(MatchOpsLogic.compareMatchesForGrid);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Grade do dia'),
        actions: [
          IconButton(
            icon: const Icon(Icons.auto_fix_high_rounded),
            onPressed: () => context.push(
              organizerMatchAutoSchedulePath(tournamentId),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: dayMatches.isEmpty
            ? null
            : () => showOrganizerScheduleMatchSheet(
                  context,
                  tournamentId: tournamentId,
                  match: dayMatches.first,
                  courts: courts,
                  allMatches: state.dayMatches,
                  config: state.config,
                ),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Agendar'),
      ),
      body: courts.isEmpty
          ? const Center(child: Text('Configure quadras no torneio.'))
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: dayMatches.length,
              itemBuilder: (context, index) {
                final match = dayMatches[index];
                final court = courts
                    .where((c) => c.id == match.courtId)
                    .firstOrNull;
                return Card(
                  child: ListTile(
                    title: Text(match.teamsLabel),
                    subtitle: Text(
                      [
                        if (match.scheduleTime != null)
                          '${match.scheduleTime!.hour.toString().padLeft(2, '0')}:'
                          '${match.scheduleTime!.minute.toString().padLeft(2, '0')}',
                        court?.name ?? match.effectiveCourtLabel,
                      ].where((s) => s.isNotEmpty).join(' · '),
                    ),
                    trailing: const Icon(Icons.drag_handle_rounded),
                    onTap: () => showOrganizerScheduleMatchSheet(
                      context,
                      tournamentId: tournamentId,
                      match: match,
                      courts: courts,
                      allMatches: state.dayMatches,
                      config: state.config,
                    ),
                  ),
                );
              },
            ),
    );
  }
}
