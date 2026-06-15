import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../domain/match_ops/match_ops_providers.dart';
import 'organizer_match_navigation.dart';
import 'widgets/organizer_match_card.dart';

/// G2 — Fila de chamada.
class OrganizerMatchCallQueuePage extends ConsumerWidget {
  const OrganizerMatchCallQueuePage({
    super.key,
    required this.tournamentId,
  });

  final String tournamentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(organizerMatchOpsStateProvider(tournamentId));
    final service = ref.watch(organizerMatchScheduleServiceProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Fila de chamada')),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 24),
        children: [
          if (state.callQueue.isEmpty)
            const Padding(
              padding: EdgeInsets.all(32),
              child: Center(child: Text('Fila vazia.')),
            ),
          for (final row in state.callQueue)
            OrganizerMatchCard(
              row: row,
              trailing: Row(
                children: [
                  if (row.hasCheckInPending)
                    const Chip(
                      label: Text('Check-in pendente'),
                      visualDensity: VisualDensity.compact,
                    ),
                  const Spacer(),
                  FilledButton(
                    onPressed: () async {
                      try {
                        final courtId = row.match.courtId.isNotEmpty
                            ? row.match.courtId
                            : state.courts.firstOrNull?.id ?? 'Q1';
                        await service.callMatchToCourt(
                          matchId: row.match.id,
                          courtId: courtId,
                        );
                        if (context.mounted) {
                          showAppSnackBar(context, 'Partida chamada para a quadra.');
                        }
                      } catch (e) {
                        if (context.mounted) {
                          showAppSnackBar(context, 'Erro: $e');
                        }
                      }
                    },
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brand,
                    ),
                    child: const Text('Chamar'),
                  ),
                ],
              ),
            ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push(organizerMatchCourtsPath(tournamentId)),
        icon: const Icon(Icons.sports_tennis_rounded),
        label: const Text('Painel'),
      ),
    );
  }
}
