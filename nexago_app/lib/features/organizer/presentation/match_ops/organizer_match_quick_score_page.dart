import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../domain/match_ops/match_ops_providers.dart';
import '../../domain/tournament_ops/tournament_ops_providers.dart';
import '../../../tournaments/data/tournament_live_matches_sync.dart';
import '../../../tournaments/domain/tournament_match.dart';
import '../../../tournaments/domain/tournament_match_display.dart';
import '../../../tournaments/domain/tournament_match_set.dart';
import 'organizer_match_error.dart';
import 'widgets/organizer_match_live_table_widgets.dart';
import '../../presentation/category_ops/widgets/organizer_team_dual_avatars.dart';

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
  bool _initialized = false;

  int _bestOf = MatchScoringLogic.defaultBestOf;

  void _initSetsFromMatch(TournamentMatch match) {
    _bestOf = match.bestOf;
    final existing = setsForMatch(match);
    if (existing.isNotEmpty) {
      _sets.clear();
      _sets.addAll(existing);
    }
    _initialized = true;
  }

  void _updateSet(int index, {int? a, int? b}) {
    setState(() {
      final current = _sets[index];
      _sets[index] = TournamentMatchSet(
        a: (a ?? current.a).clamp(0, 99),
        b: (b ?? current.b).clamp(0, 99),
      );
    });
  }

  void _addSet() {
    if (_sets.length >= _bestOf) return;
    setState(() => _sets.add(const TournamentMatchSet(a: 0, b: 0)));
  }

  Future<void> _showFormatSheet() async {
    if (_saving) return;
    final choice = await showModalBottomSheet<int>(
      context: context,
      backgroundColor: context.themeColors.surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Quantidade de sets',
                style: AppTypography.soraRegular(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                ),
              ),
              const SizedBox(height: 16),
              for (final option in const [1, 3])
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(sheetContext, option),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: option == _bestOf
                          ? AppColors.brand
                          : context.themeColors.onSurface,
                      side: BorderSide(
                        color: option == _bestOf
                            ? AppColors.brand
                            : context.themeColors.onSurfaceMuted
                                .withValues(alpha: 0.3),
                      ),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child: Text(matchBestOfLabel(option)),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
    if (choice == null || choice == _bestOf) return;
    if (choice < _bestOf &&
        MatchScoringLogic.playedSetsCount(_sets) > choice) {
      if (mounted) {
        showAppSnackBar(
          context,
          'Não dá para mudar para ${matchBestOfLabel(choice)}: '
          'há sets já pontuados.',
          isError: true,
        );
      }
      return;
    }
    setState(() {
      _bestOf = choice;
      if (_sets.length > choice) {
        _sets.removeRange(choice, _sets.length);
      }
      if (_sets.isEmpty) {
        _sets.add(const TournamentMatchSet(a: 0, b: 0));
      }
    });
  }

  Future<void> _save(String? winnerId) async {
    // Pré-validação local para feedback rápido; a validação autoritativa
    // (placar legal + cálculo do vencedor pelas regras) ocorre no servidor.
    if (!MatchScoringLogic.validateQuickScoreSets(_sets)) {
      showAppSnackBar(context, 'Informe placar válido.');
      return;
    }
    // Lançamento rápido finaliza a partida: exige um vencedor definido pelas
    // regras (evita submit incompleto que só falharia no servidor).
    if (winnerId == null) {
      showAppSnackBar(
        context,
        'Complete o placar: nenhuma dupla venceu ainda.',
      );
      return;
    }
    setState(() => _saving = true);
    try {
      await ref.read(organizerMatchScheduleServiceProvider).submitMatchResult(
            matchId: widget.matchId,
            sets: _sets.map((s) => {'a': s.a, 'b': s.b}).toList(),
            bestOf: _bestOf,
          );
      // Avanço de chave + ranking são propagados pelo trigger
      // onTournamentMatchCompletedAdvance ao concluir a partida — de forma
      // atômica e idempotente, sem depender de o app continuar aberto.
      await TournamentLiveMatchesSync.syncForTournament(
        FirebaseFirestore.instance,
        widget.tournamentId,
      );
      if (mounted) {
        showAppSnackBar(context, 'Placar salvo.');
        context.pop();
      }
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, friendlyMatchScoreError(e), isError: true);
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  /// W.O. / abandono passa pela Cloud Function dedicada, que grava o resultado
  /// no formato correto (resultA/resultB "W.O.", check-in, queue) e já avança
  /// chave + ranking de forma consistente.
  Future<void> _declareWalkover(String winnerTeamId) async {
    if (winnerTeamId.trim().isEmpty) return;
    setState(() => _saving = true);
    try {
      await ref.read(organizerMatchScheduleServiceProvider).declareMatchWalkover(
            matchId: widget.matchId,
            winnerTeamId: winnerTeamId,
          );
      await TournamentLiveMatchesSync.syncForTournament(
        FirebaseFirestore.instance,
        widget.tournamentId,
      );
      if (mounted) {
        showAppSnackBar(context, 'W.O. registrado.');
        context.pop();
      }
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, friendlyMatchScoreError(e), isError: true);
      }
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
    final enrichedMap =
        ref.watch(organizerMatchCardsByIdProvider(widget.tournamentId));
    final categories = ref
            .watch(organizerTournamentDetailProvider(widget.tournamentId))
            .valueOrNull
            ?.categories ??
        const [];

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: matchAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (match) {
          if (match == null) {
            return const Center(child: Text('Partida não encontrada'));
          }

          if (!_initialized) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) setState(() => _initSetsFromMatch(match));
            });
          }

          final enriched = enrichedMap.valueOrNull?[match.id];
          final teamA = liveTableTeamData(
            match: match,
            sideA: true,
            enrichedTeam: enriched?.teamA,
          );
          final teamB = liveTableTeamData(
            match: match,
            sideA: false,
            enrichedTeam: enriched?.teamB,
          );

          final wins = MatchScoringLogic.setsWon(_sets, bestOf: _bestOf);
          final setsWonA = wins.a;
          final setsWonB = wins.b;
          final winnerId = MatchScoringLogic.matchWinnerId(
            sets: _sets,
            teamAId: match.teamAId,
            teamBId: match.teamBId,
            bestOf: _bestOf,
          );
          final winnerLabel = winnerId == match.teamAId
              ? teamA.label
              : winnerId == match.teamBId
                  ? teamB.label
                  : null;

          final court = match.courtName?.trim() ?? '';
          final supertitle = court.isNotEmpty
              ? 'LANÇAMENTO RÁPIDO · $court'
              : 'LANÇAMENTO RÁPIDO';

          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SafeArea(
                bottom: false,
                child: _QuickScoreHeader(
                  supertitle: supertitle,
                  onBack: () => context.pop(),
                ),
              ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                  children: [
                    _MatchSummaryCard(
                      match: match,
                      categoryMeta: MatchOpsLogic.matchCardCategoryMeta(
                        match: match,
                        categoryId: match.categoryId,
                        categories: categories,
                      ),
                      teamA: teamA,
                      teamB: teamB,
                      setsWonA: setsWonA,
                      setsWonB: setsWonB,
                    ),
                    const SizedBox(height: 24),
                    _SectionHeader(
                      title: 'GAMES POR SET',
                      trailing: 'set até ${MatchScoringLogic.defaultSetPoints}'
                          ' · decisivo até ${MatchScoringLogic.tiebreakSetPoints}',
                    ),
                    const SizedBox(height: 12),
                    _FormatRow(
                      label: matchBestOfLabel(_bestOf),
                      onTap: _saving ? null : _showFormatSheet,
                    ),
                    const SizedBox(height: 12),
                    for (var i = 0; i < _sets.length; i++) ...[
                      _SetInputRow(
                        index: i,
                        set: _sets[i],
                        onChangeA: (v) => _updateSet(i, a: v),
                        onChangeB: (v) => _updateSet(i, b: v),
                      ),
                      if (i < _sets.length - 1)
                        Divider(
                          height: 1,
                          color: context.themeColors.onSurfaceMuted
                              .withValues(alpha: 0.1),
                        ),
                    ],
                    if (_sets.length < _bestOf) ...[
                      const SizedBox(height: 4),
                      _AddSetButton(
                        label: _sets.length == _bestOf - 1
                            ? 'Adicionar set decisivo'
                            : 'Adicionar set',
                        onPressed: _addSet,
                      ),
                    ],
                    const SizedBox(height: 8),
                    _WoRow(
                      onPressed: _saving
                          ? null
                          : () => _showWoSheet(
                                match,
                                teamA.label,
                                teamB.label,
                              ),
                    ),
                  ],
                ),
              ),
              _ConfirmBottomBar(
                saving: _saving,
                winnerLabel: winnerLabel,
                onConfirm: () => _save(winnerId),
              ),
            ],
          );
        },
      ),
    );
  }

  void _showWoSheet(
    TournamentMatch match,
    String teamALabel,
    String teamBLabel,
  ) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: context.themeColors.surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Qual equipe não compareceu?',
                style: AppTypography.soraRegular(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                ),
              ),
              const SizedBox(height: 16),
              OutlinedButton(
                onPressed: () {
                  Navigator.pop(context);
                  _declareWalkover(match.teamBId);
                },
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.live,
                  side: BorderSide(
                    color: AppColors.live.withValues(alpha: 0.4),
                  ),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: Text('$teamALabel — W.O.'),
              ),
              const SizedBox(height: 10),
              OutlinedButton(
                onPressed: () {
                  Navigator.pop(context);
                  _declareWalkover(match.teamAId);
                },
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.live,
                  side: BorderSide(
                    color: AppColors.live.withValues(alpha: 0.4),
                  ),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: Text('$teamBLabel — W.O.'),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: Text(
                  'Cancelar',
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Header ────────────────────────────────────────────────────────────────────

class _QuickScoreHeader extends StatelessWidget {
  const _QuickScoreHeader({
    required this.supertitle,
    required this.onBack,
  });

  final String supertitle;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _QuickScoreIconButton(
            icon: Icons.arrow_back_ios_new_rounded,
            onPressed: onBack,
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    supertitle,
                    style: AppTypography.mono(
                      fontSize: 9,
                      fontWeight: FontWeight.w800,
                      color: AppColors.brand,
                      letterSpacing: 0.8,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Resultado da partida',
                    style: AppTypography.soraRegular(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: context.themeColors.onSurface,
                      height: 1.15,
                    ),
                  ),
                ],
              ),
            ),
          ),
          // Mantém a simetria do header sem expor uma ação inexistente.
          const SizedBox(width: 40),
        ],
      ),
    );
  }
}

// ── Match summary card ─────────────────────────────────────────────────────────

class _MatchSummaryCard extends StatelessWidget {
  const _MatchSummaryCard({
    required this.match,
    required this.categoryMeta,
    required this.teamA,
    required this.teamB,
    required this.setsWonA,
    required this.setsWonB,
  });

  final TournamentMatch match;
  final String categoryMeta;
  final LiveTableTeamData teamA;
  final LiveTableTeamData teamB;
  final int setsWonA;
  final int setsWonB;

  @override
  Widget build(BuildContext context) {
    final aWins = setsWonA > setsWonB;
    final bWins = setsWonB > setsWonA;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        children: [
          Text(
            categoryMeta,
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: context.themeColors.onSurfaceMuted,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              // Team A
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        OrganizerTeamDualAvatars(
                          player1: teamA.player1,
                          player2: teamA.player2,
                          avatarSize: 28,
                          overlapRingColor: context.themeColors.surfaceCard,
                        ),
                        const SizedBox(width: 10),
                        Text(
                          '$setsWonA',
                          style: AppTypography.mono(
                            fontSize: 36,
                            fontWeight: FontWeight.w800,
                            color: aWins
                                ? AppColors.win
                                : context.themeColors.onSurface,
                            height: 1,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      teamA.label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: context.themeColors.onSurface,
                      ),
                    ),
                  ],
                ),
              ),
              // Center "sets" label
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Text(
                  'sets',
                  style: AppTypography.mono(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              ),
              // Team B
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        Text(
                          '$setsWonB',
                          style: AppTypography.mono(
                            fontSize: 36,
                            fontWeight: FontWeight.w800,
                            color: bWins
                                ? AppColors.win
                                : context.themeColors.onSurface,
                            height: 1,
                          ),
                        ),
                        const SizedBox(width: 10),
                        OrganizerTeamDualAvatars(
                          player1: teamB.player1,
                          player2: teamB.player2,
                          avatarSize: 28,
                          overlapRingColor: context.themeColors.surfaceCard,
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      teamB.label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.right,
                      style: AppTypography.soraRegular(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: context.themeColors.onSurface,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Section header ─────────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, this.trailing});

  final String title;
  final String? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          title,
          style: AppTypography.mono(
            fontSize: 10,
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurfaceMuted,
            letterSpacing: 0.6,
          ),
        ),
        if (trailing != null) ...[
          const Spacer(),
          Text(
            trailing!,
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: context.themeColors.onSurfaceMuted,
            ),
          ),
        ],
      ],
    );
  }
}

// ── Set input row ──────────────────────────────────────────────────────────────

class _SetInputRow extends StatelessWidget {
  const _SetInputRow({
    required this.index,
    required this.set,
    required this.onChangeA,
    required this.onChangeB,
  });

  final int index;
  final TournamentMatchSet set;
  final ValueChanged<int> onChangeA;
  final ValueChanged<int> onChangeB;

  @override
  Widget build(BuildContext context) {
    final aWins = set.a > set.b;
    final bWins = set.b > set.a;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 14),
      child: Row(
        children: [
          Text(
            'SET ${index + 1}',
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurfaceMuted,
              letterSpacing: 0.4,
            ),
          ),
          const Spacer(),
          _ScoreControl(
            value: set.a,
            isWinning: aWins,
            onDecrement: set.a > 0 ? () => onChangeA(set.a - 1) : null,
            onIncrement: () => onChangeA(set.a + 1),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              '×',
              style: AppTypography.mono(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          ),
          _ScoreControl(
            value: set.b,
            isWinning: bWins,
            onDecrement: set.b > 0 ? () => onChangeB(set.b - 1) : null,
            onIncrement: () => onChangeB(set.b + 1),
          ),
        ],
      ),
    );
  }
}

class _ScoreControl extends StatelessWidget {
  const _ScoreControl({
    required this.value,
    required this.isWinning,
    required this.onIncrement,
    this.onDecrement,
  });

  final int value;
  final bool isWinning;
  final VoidCallback? onDecrement;
  final VoidCallback onIncrement;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _ScoreButton(
          icon: Icons.remove_rounded,
          onPressed: onDecrement,
        ),
        SizedBox(
          width: 48,
          child: Text(
            '$value',
            textAlign: TextAlign.center,
            style: AppTypography.mono(
              fontSize: 30,
              fontWeight: FontWeight.w800,
              color: isWinning ? AppColors.win : context.themeColors.onSurface,
              height: 1,
            ),
          ),
        ),
        _ScoreButton(
          icon: Icons.add_rounded,
          onPressed: onIncrement,
        ),
      ],
    );
  }
}

class _ScoreButton extends StatelessWidget {
  const _ScoreButton({required this.icon, this.onPressed});

  final IconData icon;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    return Material(
      color: enabled
          ? AppColors.brand
          : AppColors.brand.withValues(alpha: 0.3),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: 44,
          height: 44,
          child: Icon(
            icon,
            size: 20,
            color: enabled ? Colors.black : Colors.black54,
          ),
        ),
      ),
    );
  }
}

// ── Add set button ─────────────────────────────────────────────────────────────

class _AddSetButton extends StatelessWidget {
  const _AddSetButton({required this.label, required this.onPressed});

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onPressed,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.2),
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.add_rounded,
              size: 16,
              color: context.themeColors.onSurfaceMuted,
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: AppTypography.soraRegular(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Format row (nº de sets) ─────────────────────────────────────────────────────

class _FormatRow extends StatelessWidget {
  const _FormatRow({required this.label, this.onTap});

  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
          ),
        ),
        child: Row(
          children: [
            Icon(
              Icons.tune_rounded,
              size: 16,
              color: context.themeColors.onSurfaceMuted,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Formato da partida',
                style: AppTypography.soraRegular(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            ),
            Text(
              label,
              style: AppTypography.mono(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: AppColors.brand,
              ),
            ),
            Icon(
              Icons.chevron_right_rounded,
              size: 18,
              color: context.themeColors.onSurfaceMuted,
            ),
          ],
        ),
      ),
    );
  }
}

// ── W.O. row ──────────────────────────────────────────────────────────────────

class _WoRow extends StatelessWidget {
  const _WoRow({this.onPressed});

  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onPressed,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
          ),
        ),
        child: Row(
          children: [
            Icon(
              Icons.flag_rounded,
              size: 16,
              color: context.themeColors.onSurfaceMuted,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Encerrar por W.O. ou abandono',
                style: AppTypography.soraRegular(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            ),
            Icon(
              Icons.chevron_right_rounded,
              size: 18,
              color: context.themeColors.onSurfaceMuted,
            ),
          ],
        ),
      ),
    );
  }
}

// ── Confirm bottom bar ─────────────────────────────────────────────────────────

class _ConfirmBottomBar extends StatelessWidget {
  const _ConfirmBottomBar({
    required this.onConfirm,
    this.saving = false,
    this.winnerLabel,
  });

  final VoidCallback onConfirm;
  final bool saving;
  final String? winnerLabel;

  @override
  Widget build(BuildContext context) {
    final hasWinner = winnerLabel != null;
    final label =
        hasWinner ? 'Confirmar · $winnerLabel venceu' : 'Confirmar placar';
    final bgColor = hasWinner ? AppColors.win : AppColors.brand;

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      decoration: BoxDecoration(
        color: context.themeColors.canvas,
        border: Border(
          top: BorderSide(
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
          ),
        ),
      ),
      child: SafeArea(
        top: false,
        child: FilledButton.icon(
          onPressed: saving ? null : onConfirm,
          icon: saving
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.black,
                  ),
                )
              : const Icon(Icons.check_rounded, size: 18, color: Colors.black),
          label: Text(saving ? 'Salvando…' : label),
          style: FilledButton.styleFrom(
            backgroundColor: bgColor,
            foregroundColor: Colors.black,
            minimumSize: const Size.fromHeight(52),
            textStyle: AppTypography.soraRegular(
              fontSize: 15,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ),
    );
  }
}

// ── Icon button ───────────────────────────────────────────────────────────────

class _QuickScoreIconButton extends StatelessWidget {
  const _QuickScoreIconButton({required this.icon, required this.onPressed});

  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceRaised,
      shape: const CircleBorder(),
      child: InkWell(
        onTap: onPressed,
        customBorder: const CircleBorder(),
        child: SizedBox(
          width: 40,
          height: 40,
          child: Icon(icon, size: 18, color: context.themeColors.onSurface),
        ),
      ),
    );
  }
}
