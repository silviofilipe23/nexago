import 'package:flutter/material.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/ui/nexa_share.dart';

import '../../organizer/domain/match_ops/match_ops_providers.dart';
import '../../organizer/domain/match_ops/match_scoring_logic.dart';
import '../../organizer/presentation/match_ops/organizer_match_navigation.dart';

/// J2 — Transmissão pública (read-only).
class PublicMatchLivePage extends ConsumerWidget {
  const PublicMatchLivePage({
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

    return Scaffold(
      appBar: NexaAppBar(
        title: const Text('Ao vivo'),
        actions: [
          IconButton(
            icon: const Icon(Icons.share_rounded),
            onPressed: () => nexaShareText(
              context,
              publicMatchLivePath(tournamentId, matchId),
            ),
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
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (match.isInProgress)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.live.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Text(
                        'AO VIVO',
                        style: TextStyle(
                          color: AppColors.live,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  const SizedBox(height: 24),
                  Text(
                    match.teamsLabel,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    MatchScoringLogic.setsScoreLabel(match),
                    style: Theme.of(context).textTheme.displaySmall?.copyWith(
                          color: AppColors.brand,
                          fontWeight: FontWeight.bold,
                        ),
                  ),
                  if (match.effectiveCourtLabel.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Text(match.effectiveCourtLabel),
                  ],
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
