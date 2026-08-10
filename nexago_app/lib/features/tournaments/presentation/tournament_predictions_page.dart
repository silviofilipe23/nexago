import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../ranking/domain/ranking_list_mapper.dart';
import '../../ranking/presentation/widgets/ranking_list_tile.dart';
import '../../ranking/presentation/widgets/ranking_podium.dart';
import '../domain/predictions/prediction_share_text.dart';
import '../domain/predictions/tournament_prediction_entry.dart';
import '../domain/predictions/tournament_predictions_logic.dart';
import '../domain/predictions/tournament_predictions_providers.dart';
import '../domain/tournament_discovery_providers.dart';
import '../domain/tournament_match.dart';
import 'widgets/predictions/prediction_match_pick_card.dart';
import 'widgets/predictions/prediction_rank_delta.dart';
import 'widgets/predictions/prediction_share_capture.dart';
import 'widgets/predictions/predictions_campaign_card.dart';
import 'widgets/predictions/predictions_scoring_panel.dart';
import 'widgets/tournament_detail/tournament_detail_subpage_scaffold.dart';

enum _PredictionsSection { picks, leaderboard }

/// Tela "Palpites": qualquer atleta autenticado palpita quem vence cada
/// partida `Scheduled` do torneio (e o campeão, via a partida final) e
/// acompanha o leaderboard de quem mais acerta.
class TournamentPredictionsPage extends ConsumerStatefulWidget {
  const TournamentPredictionsPage({
    super.key,
    required this.tournamentId,
    this.embedded = false,
  });

  final String tournamentId;

  /// `true` quando renderizada como aba do detalhe do torneio — sem o
  /// scaffold próprio (a casca já tem cabeçalho e abas).
  final bool embedded;

  @override
  ConsumerState<TournamentPredictionsPage> createState() =>
      _TournamentPredictionsPageState();
}

class _TournamentPredictionsPageState
    extends ConsumerState<TournamentPredictionsPage> {
  _PredictionsSection _section = _PredictionsSection.picks;
  final Map<String, String> _draftPicks = {};
  bool _draftInitialized = false;
  bool _submitting = false;
  bool _sharing = false;

  void _seedDraftIfNeeded(TournamentPredictionEntry? entry) {
    if (_draftInitialized) return;
    _draftInitialized = true;
    if (entry != null) {
      _draftPicks.addAll(entry.picks);
    }
  }

  bool _hasUnsavedChanges(
    TournamentPredictionEntry? savedEntry,
    List<TournamentMatch> matches,
  ) {
    final toSubmit = openMatchPicksToSubmit(_draftPicks, matches);
    for (final entry in toSubmit.entries) {
      if (savedEntry?.pickFor(entry.key) != entry.value) return true;
    }
    return false;
  }

  Future<void> _save(List<TournamentMatch> matches) async {
    final uid = ref.read(firebaseAuthProvider).currentUser?.uid;
    if (uid == null || uid.trim().isEmpty) {
      _showSnack('Faça login para enviar seus palpites.');
      return;
    }

    final picks = openMatchPicksToSubmit(_draftPicks, matches);
    final championPick = deriveChampionPickFromDraft(_draftPicks, matches);
    if (picks.isEmpty && championPick == null) return;

    setState(() => _submitting = true);
    try {
      await ref.read(tournamentPredictionsRepositoryProvider).submitPrediction(
            tournamentId: widget.tournamentId,
            picks: picks,
            championPick: championPick,
          );
      ref.invalidate(myTournamentPredictionEntryProvider(widget.tournamentId));
      if (mounted) _showSnack('Palpites salvos!');
    } catch (e) {
      if (mounted) _showSnack('Não foi possível salvar: $e');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final slivers = [
      SliverToBoxAdapter(
        child: Padding(
          padding: EdgeInsets.fromLTRB(20, widget.embedded ? 14 : 0, 20, 14),
          child: _SectionToggle(
            section: _section,
            onChanged: (s) => setState(() => _section = s),
          ),
        ),
      ),
      if (_section == _PredictionsSection.picks)
        ..._buildPicksSlivers()
      else
        ..._buildLeaderboardSlivers(),
    ];

    if (widget.embedded) {
      return CustomScrollView(slivers: slivers);
    }
    return TournamentDetailSubpageScaffold(title: 'Palpites', slivers: slivers);
  }

  List<Widget> _buildPicksSlivers() {
    final cardsAsync =
        ref.watch(tournamentMatchCardsProvider(widget.tournamentId));
    final entryAsync =
        ref.watch(myTournamentPredictionEntryProvider(widget.tournamentId));

    if (cardsAsync.isLoading || entryAsync.isLoading) {
      return const [
        SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.only(top: 60),
            child: Center(
              child: CircularProgressIndicator(color: AppColors.brand),
            ),
          ),
        ),
      ];
    }
    if (cardsAsync.hasError) {
      return const [
        SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: 20, vertical: 24),
            child: Text('Não foi possível carregar as partidas do torneio.'),
          ),
        ),
      ];
    }

    final cards = predictableMatchCards(cardsAsync.value ?? const []);
    final entry = entryAsync.value;
    _seedDraftIfNeeded(entry);

    if (cards.isEmpty) {
      return const [
        SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: 20, vertical: 24),
            child: Text('A chave ainda não tem partidas com os dois lados definidos.'),
          ),
        ),
      ];
    }

    final matches = cards.map((c) => c.match).toList();
    final canSave = _hasUnsavedChanges(entry, matches);

    return [
      SliverList(
        delegate: SliverChildBuilderDelegate(
          (context, index) {
            final card = cards[index];
            final match = card.match;
            final locked = isPredictionLockedForMatch(match);
            return PredictionMatchPickCard(
              viewModel: card,
              selectedTeamId: _draftPicks[match.id],
              locked: locked,
              wasCorrect: predictionWasCorrectForMatch(match, entry),
              onSelect: (teamId) {
                setState(() => _draftPicks[match.id] = teamId);
              },
            );
          },
          childCount: cards.length,
        ),
      ),
      SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
          child: SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: !canSave || _submitting
                  ? null
                  : () => _save(matches),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: Colors.black,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: _submitting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.black,
                      ),
                    )
                  : const Text('Salvar palpites'),
            ),
          ),
        ),
      ),
    ];
  }

  List<Widget> _buildLeaderboardSlivers() {
    final entriesAsync =
        ref.watch(tournamentPredictionLeaderboardProvider(widget.tournamentId));
    final profilesAsync = ref
        .watch(tournamentPredictionLeaderboardProfilesProvider(widget.tournamentId));

    if (entriesAsync.isLoading) {
      return const [
        SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.only(top: 60),
            child: Center(
              child: CircularProgressIndicator(color: AppColors.brand),
            ),
          ),
        ),
      ];
    }
    if (entriesAsync.hasError) {
      return const [
        SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: 20, vertical: 24),
            child: Text('Não foi possível carregar o ranking de palpites.'),
          ),
        ),
      ];
    }

    final entries = entriesAsync.value ?? const [];
    if (entries.isEmpty) {
      return const [
        SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: 20, vertical: 24),
            child: Text('Ninguém palpitou nesse torneio ainda. Seja o primeiro!'),
          ),
        ),
      ];
    }

    final profiles = profilesAsync.value ?? const {};
    final uid = ref.watch(firebaseAuthProvider).currentUser?.uid;
    final matches = (ref.watch(tournamentMatchCardsProvider(widget.tournamentId)).value ??
            const [])
        .map((c) => c.match)
        .toList();

    final rows = buildPredictionLeaderboard(
      entries,
      profiles: profiles,
      matches: matches,
      currentUserId: uid,
    );
    final deltas = {for (final row in rows) row.entry.entityId: row.delta};
    final listEntries = rows.map((row) => row.entry).toList();
    final podium = podiumEntries(listEntries);
    final rest = listEntriesFromRank4(listEntries);

    final myEntry =
        ref.watch(myTournamentPredictionEntryProvider(widget.tournamentId)).value;
    final stats = predictionStatsOf(myEntry, matches, rows);
    final hasPlayed = (myEntry?.picks.isNotEmpty ?? false);

    return [
      SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  rows.length == 1
                      ? '1 participante'
                      : '${rows.length} participantes',
                  style: AppTypography.mono(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: context.themeColors.onSurfaceMuted,
                  ).copyWith(letterSpacing: 1.4),
                ),
              ),
              FilledButton.icon(
                onPressed: _sharing ? null : () => _shareRanking(rows),
                icon: _sharing
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.black,
                        ),
                      )
                    : const Icon(Icons.ios_share, size: 18),
                label: Text(_sharing ? 'Gerando…' : 'Compartilhar'),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brand,
                  foregroundColor: Colors.black,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
      if (podium.isNotEmpty)
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
            child: RankingPodium(entries: podium),
          ),
        ),
      if (hasPlayed)
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
            child: PredictionsCampaignCard(stats: stats),
          ),
        ),
      SliverList(
        delegate: SliverChildBuilderDelegate(
          (context, index) {
            final row = rest[index];
            final trailing = PredictionRankDelta(delta: deltas[row.entityId]);
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: row.isCurrentUser
                  ? RankingUserHighlightTile(entry: row, trailing: trailing)
                  : RankingListTile(entry: row, trailing: trailing),
            );
          },
          childCount: rest.length,
        ),
      ),
      SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
          child: const PredictionsScoringPanel(),
        ),
      ),
    ];
  }

  Future<void> _shareRanking(List<PredictionLeaderboardRow> rows) async {
    if (_sharing || rows.isEmpty) return;
    setState(() => _sharing = true);
    try {
      final url = predictionShareUrl(widget.tournamentId);
      final data = buildPredictionShareData(
        tournamentName: ref
            .read(tournamentDetailProvider(widget.tournamentId))
            .valueOrNull
            ?.name,
        leaderboard: rows,
        url: url,
      );

      final file = await capturePredictionSharePng(data);
      if (!mounted) return;
      if (file == null) {
        _showSnack('Não foi possível gerar a imagem.');
        return;
      }

      await sharePredictionRankingPng(
        context,
        file,
        predictionShareText(data, url),
      );
    } catch (_) {
      if (mounted) _showSnack('Não foi possível compartilhar agora.');
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }
}

class _SectionToggle extends StatelessWidget {
  const _SectionToggle({required this.section, required this.onChanged});

  final _PredictionsSection section;
  final ValueChanged<_PredictionsSection> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: context.themeColors.surfaceRaised),
      ),
      child: Row(
        children: [
          Expanded(
            child: _SegmentButton(
              label: 'Meus palpites',
              selected: section == _PredictionsSection.picks,
              onTap: () => onChanged(_PredictionsSection.picks),
            ),
          ),
          Expanded(
            child: _SegmentButton(
              label: 'Ranking',
              selected: section == _PredictionsSection.leaderboard,
              onTap: () => onChanged(_PredictionsSection.leaderboard),
            ),
          ),
        ],
      ),
    );
  }
}

class _SegmentButton extends StatelessWidget {
  const _SegmentButton({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.brand : Colors.transparent,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Center(
            child: Text(
              label,
              style: AppTypography.soraRegular(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color:
                    selected ? Colors.black : context.themeColors.onSurfaceMuted,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
