import 'package:flutter/material.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../domain/match_ops/match_ops_providers.dart';
import '../../domain/match_ops/match_scoring_logic.dart';

/// I4 — Súmula e audit log.
class OrganizerMatchSummaryPage extends ConsumerWidget {
  const OrganizerMatchSummaryPage({
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
    final auditAsync = ref.watch(organizerMatchAuditLogProvider(matchId));

    return Scaffold(
      appBar: NexaAppBar(
        title: const Text('Súmula'),
        actions: [
          IconButton(
            icon: const Icon(Icons.share_rounded),
            onPressed: () {
              final match = matchAsync.valueOrNull;
              if (match == null) return;
              Share.share(
                'Súmula: ${match.teamsLabel} — ${match.scoreLabel}',
              );
            },
          ),
        ],
      ),
      body: matchAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (match) {
          if (match == null) {
            return const Center(child: Text('Partida não encontrada'));
          }
          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Text(match.teamsLabel,
                  style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 8),
              Text(
                MatchScoringLogic.setsScoreLabel(match),
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              if (match.sets.isNotEmpty) ...[
                const SizedBox(height: 16),
                const Text('Sets', style: TextStyle(fontWeight: FontWeight.bold)),
                for (var i = 0; i < match.sets.length; i++)
                  Text('Set ${i + 1}: ${match.sets[i].a}-${match.sets[i].b}'),
              ],
              const SizedBox(height: 24),
              const Text('Histórico', style: TextStyle(fontWeight: FontWeight.bold)),
              auditAsync.when(
                loading: () => const LinearProgressIndicator(),
                error: (e, _) => Text('$e'),
                data: (entries) {
                  if (entries.isEmpty) {
                    return const Text('Nenhum evento registrado.');
                  }
                  return Column(
                    children: [
                      for (final e in entries)
                        ListTile(
                          dense: true,
                          title: Text(e.type),
                          subtitle: Text(
                            '${e.at.toLocal()} · ${e.byUid}',
                          ),
                        ),
                    ],
                  );
                },
              ),
            ],
          );
        },
      ),
    );
  }
}
