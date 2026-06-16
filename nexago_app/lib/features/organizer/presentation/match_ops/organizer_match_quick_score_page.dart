import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../domain/match_ops/match_ops_providers.dart';
import '../../domain/match_ops/match_scoring_logic.dart';
import '../../../tournaments/data/nexago_artifacts_paths.dart';
import '../../../tournaments/data/tournament_live_matches_sync.dart';
import '../../../tournaments/domain/tournament_match_set.dart';
import '../../../tournaments/domain/tournament_match_status.dart';

/// I2 — Lançamento rápido de placar.
class OrganizerMatchQuickScorePage extends ConsumerStatefulWidget {
  const OrganizerMatchQuickScorePage({
    super.key,
    required this.tournamentId,
    required this.matchId,
  });

  final String tournamentId;
  final String matchId;

  @override
  ConsumerState<OrganizerMatchQuickScorePage> createState() =>
      _OrganizerMatchQuickScorePageState();
}

class _OrganizerMatchQuickScorePageState
    extends ConsumerState<OrganizerMatchQuickScorePage> {
  final _sets = <TournamentMatchSet>[
    const TournamentMatchSet(a: 0, b: 0),
  ];
  bool _saving = false;

  void _updateSet(int index, {int? a, int? b}) {
    setState(() {
      final current = _sets[index];
      _sets[index] = TournamentMatchSet(
        a: a ?? current.a,
        b: b ?? current.b,
      );
    });
  }

  Future<void> _save({String? winnerId}) async {
    if (!MatchScoringLogic.validateQuickScoreSets(_sets)) {
      showAppSnackBar(context, 'Informe placar válido.');
      return;
    }
    setState(() => _saving = true);
    try {
      final match = ref
          .read(organizerMatchByIdProvider((
            tournamentId: widget.tournamentId,
            matchId: widget.matchId,
          )))
          .valueOrNull;
      if (match == null) return;

      final computedWinner = winnerId ??
          MatchScoringLogic.matchWinnerId(
            sets: _sets,
            teamAId: match.teamAId,
            teamBId: match.teamBId,
          );

      await FirebaseFirestore.instance
          .collection(NexagoArtifactsPaths.matchesCollection())
          .doc(widget.matchId)
          .update({
        'sets': _sets.map((s) => s.toMap()).toList(),
        'status': computedWinner != null
            ? TournamentMatchStatus.completed
            : TournamentMatchStatus.inProgress,
        if (computedWinner != null) 'winnerId': computedWinner,
        'resultA': '${_sets.where((s) => s.a > s.b).length}',
        'resultB': '${_sets.where((s) => s.b > s.a).length}',
        'matchEndedAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });

      if (computedWinner != null) {
        await ref
            .read(organizerMatchScheduleServiceProvider)
            .advanceBracketWinner(matchId: widget.matchId);
        await ref
            .read(organizerMatchScheduleServiceProvider)
            .applyLeagueRankingForMatch(matchId: widget.matchId);
      }

      await TournamentLiveMatchesSync.syncForTournament(
        FirebaseFirestore.instance,
        widget.tournamentId,
      );
      if (mounted) {
        showAppSnackBar(context, 'Placar salvo.');
        Navigator.of(context).pop();
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
      appBar: NexaAppBar(title: const Text('Lançamento rápido')),
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
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 16),
              for (var i = 0; i < _sets.length; i++) ...[
                Text('Set ${i + 1}'),
                Row(
                  children: [
                    _Stepper(
                      value: _sets[i].a,
                      onChanged: (v) => _updateSet(i, a: v),
                    ),
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 12),
                      child: Text('×'),
                    ),
                    _Stepper(
                      value: _sets[i].b,
                      onChanged: (v) => _updateSet(i, b: v),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
              ],
              OutlinedButton(
                onPressed: () => setState(() {
                  _sets.add(const TournamentMatchSet(a: 0, b: 0));
                }),
                child: const Text('Adicionar set'),
              ),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: _saving ? null : _save,
                style: FilledButton.styleFrom(backgroundColor: AppColors.brand),
                child: const Text('Confirmar vencedor'),
              ),
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: _saving
                    ? null
                    : () => _save(winnerId: match.teamAId),
                child: const Text('W.O. equipe A'),
              ),
              OutlinedButton(
                onPressed: _saving
                    ? null
                    : () => _save(winnerId: match.teamBId),
                child: const Text('W.O. equipe B'),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _Stepper extends StatelessWidget {
  const _Stepper({required this.value, required this.onChanged});

  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        IconButton(
          onPressed: value > 0 ? () => onChanged(value - 1) : null,
          icon: const Icon(Icons.remove_rounded),
        ),
        Text('$value', style: Theme.of(context).textTheme.headlineSmall),
        IconButton(
          onPressed: () => onChanged(value + 1),
          icon: const Icon(Icons.add_rounded),
        ),
      ],
    );
  }
}
