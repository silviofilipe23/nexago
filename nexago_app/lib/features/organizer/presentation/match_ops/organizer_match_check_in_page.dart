import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../domain/match_ops/match_ops_providers.dart';
import '../../../tournaments/data/nexago_artifacts_paths.dart';

/// J1 — Check-in e W.O.
class OrganizerMatchCheckInPage extends ConsumerWidget {
  const OrganizerMatchCheckInPage({
    super.key,
    required this.tournamentId,
    required this.matchId,
  });

  final String tournamentId;
  final String matchId;

  Future<void> _setCheckIn(
    WidgetRef ref,
    BuildContext context, {
    required String team,
    required String status,
  }) async {
    try {
      await FirebaseFirestore.instance
          .collection(NexagoArtifactsPaths.matchesCollection())
          .doc(matchId)
          .update({
        'checkIn.$team': {
          'status': status,
          'at': FieldValue.serverTimestamp(),
        },
        'updatedAt': FieldValue.serverTimestamp(),
      });
      if (context.mounted) showAppSnackBar(context, 'Check-in atualizado.');
    } catch (e) {
      if (context.mounted) showAppSnackBar(context, 'Erro: $e');
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final matchAsync = ref.watch(organizerMatchByIdProvider((
      tournamentId: tournamentId,
      matchId: matchId,
    )));
    final config =
        ref.watch(organizerMatchOpsConfigProvider(tournamentId)).valueOrNull;
    final service = ref.watch(organizerMatchScheduleServiceProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Check-in')),
      body: matchAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (match) {
          if (match == null) {
            return const Center(child: Text('Partida não encontrada'));
          }
          return Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Tolerância: ${config?.checkInToleranceMin ?? 15} min',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                const SizedBox(height: 16),
                _TeamCheckInCard(
                  label: match.teamADescription ?? 'Equipe A',
                  status: match.checkInTeamAStatus,
                  onPresent: () => _setCheckIn(
                    ref,
                    context,
                    team: 'teamA',
                    status: 'present',
                  ),
                  onWo: () => service.declareMatchWalkover(
                    matchId: matchId,
                    winnerTeamId: match.teamBId,
                  ),
                ),
                const SizedBox(height: 12),
                _TeamCheckInCard(
                  label: match.teamBDescription ?? 'Equipe B',
                  status: match.checkInTeamBStatus,
                  onPresent: () => _setCheckIn(
                    ref,
                    context,
                    team: 'teamB',
                    status: 'present',
                  ),
                  onWo: () => service.declareMatchWalkover(
                    matchId: matchId,
                    winnerTeamId: match.teamAId,
                  ),
                ),
                const Spacer(),
                FilledButton(
                  onPressed: () async {
                    try {
                      await service.releaseMatchAfterCheckIn(matchId: matchId);
                      if (context.mounted) {
                        showAppSnackBar(context, 'Partida liberada.');
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
                  child: const Text('Liberar partida'),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _TeamCheckInCard extends StatelessWidget {
  const _TeamCheckInCard({
    required this.label,
    required this.status,
    required this.onPresent,
    required this.onWo,
  });

  final String label;
  final String status;
  final VoidCallback onPresent;
  final Future<void> Function() onWo;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: Theme.of(context).textTheme.titleMedium),
            Text('Status: ${status.isEmpty ? 'pending' : status}'),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: onPresent,
                    child: const Text('Presente'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => onWo(),
                    child: const Text('W.O.'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
