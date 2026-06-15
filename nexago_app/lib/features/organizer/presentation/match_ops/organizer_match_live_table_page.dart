import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../domain/match_ops/match_ops_providers.dart';
import '../../domain/match_ops/match_scoring_logic.dart';
import '../../../tournaments/domain/tournament_discovery_providers.dart';
import '../../../tournaments/domain/tournament_match_set.dart';
import '../../../tournaments/domain/tournament_match_status.dart';
import 'organizer_match_navigation.dart';

/// I1 — Mesa ao vivo ponto a ponto.
class OrganizerMatchLiveTablePage extends ConsumerStatefulWidget {
  const OrganizerMatchLiveTablePage({
    super.key,
    required this.tournamentId,
    required this.matchId,
  });

  final String tournamentId;
  final String matchId;

  @override
  ConsumerState<OrganizerMatchLiveTablePage> createState() =>
      _OrganizerMatchLiveTablePageState();
}

class _OrganizerMatchLiveTablePageState
    extends ConsumerState<OrganizerMatchLiveTablePage> {
  bool _saving = false;

  Future<void> _point(String side) async {
    final match = ref
        .read(organizerMatchByIdProvider((
          tournamentId: widget.tournamentId,
          matchId: widget.matchId,
        )))
        .valueOrNull;
    if (match == null) return;

    final result = MatchScoringLogic.applyPoint(
      sets: match.sets,
      currentSetIndex: match.currentSetIndex ?? 0,
      side: side,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
    );

    setState(() => _saving = true);
    try {
      final repo = ref.read(tournamentMatchesRepositoryProvider);
      final setIdx = match.currentSetIndex ?? 0;
      final current = result.sets.length > setIdx ? result.sets[setIdx] : null;
      await repo.recordPointTransaction(
        matchId: widget.matchId,
        matchUpdate: {
          'sets': result.sets.map((s) => s.toMap()).toList(),
          'currentSetIndex': result.currentSetIndex,
          'status': result.winnerId != null
              ? TournamentMatchStatus.completed
              : TournamentMatchStatus.inProgress,
          if (result.winnerId != null) 'winnerId': result.winnerId,
          if (result.winnerId != null)
            'matchEndedAt': FieldValue.serverTimestamp(),
          if (match.matchStartedAt == null)
            'matchStartedAt': FieldValue.serverTimestamp(),
          'resultA': '${result.sets.where((s) => s.a > s.b).length}',
          'resultB': '${result.sets.where((s) => s.b > s.a).length}',
        },
        pointEvent: {
          'type': 'point',
          'side': side,
          'setIndex': setIdx,
          'scoreA': current?.a ?? 0,
          'scoreB': current?.b ?? 0,
        },
      );
      if (result.winnerId != null) {
        await ref.read(organizerMatchScheduleServiceProvider).advanceBracketWinner(
              matchId: widget.matchId,
            );
      }
    } catch (e) {
      if (mounted) showAppSnackBar(context, 'Erro: $e');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final matchAsync = ref.watch(organizerMatchByIdProvider((
      tournamentId: widget.tournamentId,
      matchId: widget.matchId,
    )));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Mesa ao vivo'),
        actions: [
          IconButton(
            icon: const Icon(Icons.summarize_outlined),
            onPressed: () => context.push(
              organizerMatchSummaryPath(widget.tournamentId, widget.matchId),
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
          final setIdx = match.currentSetIndex ?? 0;
          final sets = match.sets;
          final current = sets.length > setIdx
              ? sets[setIdx]
              : const TournamentMatchSet(a: 0, b: 0);

          return Column(
            children: [
              const SizedBox(height: 24),
              Text(match.teamsLabel, textAlign: TextAlign.center),
              const SizedBox(height: 24),
              Text(
                '${current.a} × ${current.b}',
                style: Theme.of(context).textTheme.displayMedium?.copyWith(
                      color: AppColors.brand,
                      fontWeight: FontWeight.bold,
                    ),
              ),
              const Spacer(),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _ScoreButton(
                    label: 'A +1',
                    onPressed: _saving ? null : () => _point('A'),
                  ),
                  _ScoreButton(
                    label: 'B +1',
                    onPressed: _saving ? null : () => _point('B'),
                  ),
                ],
              ),
              const SizedBox(height: 32),
              if (match.isCompleted)
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: FilledButton(
                    onPressed: () => context.push(
                      organizerMatchValidatePath(
                        widget.tournamentId,
                        widget.matchId,
                      ),
                    ),
                    child: const Text('Validar resultado'),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _ScoreButton extends StatelessWidget {
  const _ScoreButton({required this.label, this.onPressed});

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.brand,
        minimumSize: const Size(120, 56),
      ),
      child: Text(label),
    );
  }
}
