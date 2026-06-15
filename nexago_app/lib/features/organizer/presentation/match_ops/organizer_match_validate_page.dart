import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../domain/match_ops/match_ops_providers.dart';
import 'organizer_match_navigation.dart';

/// I3 — Validar reporte.
class OrganizerMatchValidatePage extends ConsumerWidget {
  const OrganizerMatchValidatePage({
    super.key,
    required this.tournamentId,
    required this.matchId,
  });

  final String tournamentId;
  final String matchId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final matchAsync = ref.watch(organizerMatchByIdProvider((
      tournamentId: tournamentId,
      matchId: matchId,
    )));
    final service = ref.watch(organizerMatchScheduleServiceProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Validar reporte')),
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
                Text(match.teamsLabel,
                    style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                Text('Placar: ${match.scoreLabel}'),
                const SizedBox(height: 8),
                Text('Status reporte: ${match.reportStatus.isEmpty ? 'none' : match.reportStatus}'),
                const SizedBox(height: 8),
                Text(
                  'Confirmações: A ${match.teamAConfirmed ? '✓' : '—'} · B ${match.teamBConfirmed ? '✓' : '—'}',
                ),
                const Spacer(),
                FilledButton(
                  onPressed: () async {
                    try {
                      await service.validateMatchResult(matchId: matchId);
                      if (context.mounted) {
                        showAppSnackBar(context, 'Resultado validado.');
                        context.pushReplacement(
                          organizerMatchSummaryPath(tournamentId, matchId),
                        );
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
                  child: const Text('Validar resultado'),
                ),
                const SizedBox(height: 8),
                OutlinedButton(
                  onPressed: () => context.push(
                    organizerMatchQuickScorePath(tournamentId, matchId),
                  ),
                  child: const Text('Corrigir placar'),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
