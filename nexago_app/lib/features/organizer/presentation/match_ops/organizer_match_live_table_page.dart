import 'dart:async';

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
import '../../../tournaments/domain/tournament_discovery_providers.dart';
import '../../../tournaments/domain/tournament_match.dart';
import '../../../tournaments/domain/tournament_match_point_event.dart';
import '../../../tournaments/domain/tournament_match_set.dart';
import '../../../tournaments/domain/tournament_match_status.dart';
import 'organizer_match_navigation.dart';
import 'widgets/organizer_match_live_table_widgets.dart';

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
  Timer? _clockTimer;

  @override
  void initState() {
    super.initState();
    _clockTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _clockTimer?.cancel();
    super.dispose();
  }

  TournamentMatch? _currentMatch() {
    return ref
        .read(
          organizerMatchByIdProvider((
            tournamentId: widget.tournamentId,
            matchId: widget.matchId,
          )),
        )
        .valueOrNull;
  }

  String _servingTeamIdAfterPoint(TournamentMatch match, String side) {
    return side.toUpperCase() == 'A' ? match.teamAId : match.teamBId;
  }

  Future<void> _point(String side) async {
    final match = _currentMatch();
    if (match == null || match.isCompleted) return;

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
      final servingTeamId = _servingTeamIdAfterPoint(match, side);

      await repo.recordPointTransaction(
        matchId: widget.matchId,
        matchUpdate: {
          'sets': result.sets.map((s) => s.toMap()).toList(),
          'currentSetIndex': result.currentSetIndex,
          'status': result.winnerId != null
              ? TournamentMatchStatus.completed
              : TournamentMatchStatus.inProgress,
          'servingTeamId': servingTeamId,
          if (result.winnerId != null) 'winnerId': result.winnerId,
          if (result.winnerId != null)
            'matchEndedAt': FieldValue.serverTimestamp(),
          if (match.matchStartedAt == null)
            'matchStartedAt': FieldValue.serverTimestamp(),
          'resultA': '${MatchScoringLogic.setsWon(result.sets).a}',
          'resultB': '${MatchScoringLogic.setsWon(result.sets).b}',
        },
        pointEvent: {
          'type': 'point',
          'side': side,
          'setIndex': setIdx,
          'scoreA': current?.a ?? 0,
          'scoreB': current?.b ?? 0,
        },
      );
      // Avanço de chave + ranking são propagados pelo trigger
      // onTournamentMatchCompletedAdvance ao concluir a partida (atômico +
      // idempotente), substituindo as chamadas HTTPS sequenciais por ponto.
      await TournamentLiveMatchesSync.syncForTournament(
        FirebaseFirestore.instance,
        widget.tournamentId,
      );
    } catch (e) {
      if (mounted) showAppSnackBar(context, 'Erro: $e', isError: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _undoLastPoint() async {
    final match = _currentMatch();
    if (match == null || match.isCompleted) return;

    final eventsAsync = ref.read(
      organizerMatchPointEventsProvider(widget.matchId),
    );
    final events = (eventsAsync.valueOrNull ?? const [])
        .whereType<TournamentMatchPointEvent>()
        .toList();
    TournamentMatchPointEvent? lastPoint;
    for (final event in events.reversed) {
      if (event.isPoint) {
        lastPoint = event;
        break;
      }
    }
    if (lastPoint == null) {
      if (mounted) {
        showAppSnackBar(context, 'Nenhum ponto para desfazer.', isError: true);
      }
      return;
    }

    final side = lastPoint.side ?? 'A';
    final result = MatchScoringLogic.undoPoint(
      sets: match.sets,
      currentSetIndex: lastPoint.setIndex,
      side: side,
    );

    setState(() => _saving = true);
    try {
      final repo = ref.read(tournamentMatchesRepositoryProvider);
      final setIdx = result.currentSetIndex;
      final current = result.sets.length > setIdx ? result.sets[setIdx] : null;

      await repo.recordPointTransaction(
        matchId: widget.matchId,
        matchUpdate: {
          'sets': result.sets.map((s) => s.toMap()).toList(),
          'currentSetIndex': result.currentSetIndex,
          'status': TournamentMatchStatus.inProgress,
          'winnerId': FieldValue.delete(),
          'matchEndedAt': FieldValue.delete(),
          'resultA': '${MatchScoringLogic.setsWon(result.sets).a}',
          'resultB': '${MatchScoringLogic.setsWon(result.sets).b}',
        },
        pointEvent: {
          'type': 'undo-point',
          'side': side,
          'setIndex': setIdx,
          'scoreA': current?.a ?? 0,
          'scoreB': current?.b ?? 0,
        },
      );
      await TournamentLiveMatchesSync.syncForTournament(
        FirebaseFirestore.instance,
        widget.tournamentId,
      );
    } catch (e) {
      if (mounted) showAppSnackBar(context, 'Erro: $e', isError: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _swapServe() async {
    final match = _currentMatch();
    if (match == null || match.isCompleted) return;

    final current = match.servingTeamId.trim();
    final next = current.isEmpty || current == match.teamBId
        ? match.teamAId
        : match.teamBId;
    if (next.trim().isEmpty) return;

    setState(() => _saving = true);
    try {
      await ref.read(tournamentMatchesRepositoryProvider).updateMatchFields(
            matchId: widget.matchId,
            fields: {'servingTeamId': next},
          );
    } catch (e) {
      if (mounted) showAppSnackBar(context, 'Erro: $e', isError: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _undoIfSide(String side) async {
    final eventsAsync = ref.read(
      organizerMatchPointEventsProvider(widget.matchId),
    );
    final events = (eventsAsync.valueOrNull ?? const [])
        .whereType<TournamentMatchPointEvent>()
        .toList();
    TournamentMatchPointEvent? lastPoint;
    for (final event in events.reversed) {
      if (event.isPoint) {
        lastPoint = event;
        break;
      }
    }
    if (lastPoint == null) {
      if (mounted) {
        showAppSnackBar(context, 'Nenhum ponto para desfazer.', isError: true);
      }
      return;
    }
    if ((lastPoint.side ?? 'A').toUpperCase() != side.toUpperCase()) {
      if (mounted) {
        showAppSnackBar(
          context,
          'O último ponto não foi desta dupla.',
          isError: true,
        );
      }
      return;
    }
    await _undoLastPoint();
  }

  String _elapsedLabel(TournamentMatch match) {
    if (match.matchStartedAt != null) {
      final sec = MatchScoringLogic.elapsedSecondsFromStart(
        match.matchStartedAt,
        DateTime.now(),
      );
      return MatchScoringLogic.formatElapsedMmSs(sec);
    }
    if (match.liveElapsedSec > 0) {
      return MatchScoringLogic.formatElapsedMmSs(match.liveElapsedSec);
    }
    return '00:00';
  }

  @override
  Widget build(BuildContext context) {
    final matchAsync = ref.watch(organizerMatchByIdProvider((
      tournamentId: widget.tournamentId,
      matchId: widget.matchId,
    )));
    final pointEventsAsync =
        ref.watch(organizerMatchPointEventsProvider(widget.matchId));
    final enrichedCard = ref
        .watch(organizerMatchCardsByIdProvider(widget.tournamentId))
        .valueOrNull?[widget.matchId];
    final tournamentCategories =
        ref
            .watch(organizerTournamentDetailProvider(widget.tournamentId))
            .valueOrNull
            ?.categories ??
        const [];

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: Stack(
        children: [
          SafeArea(
            child: matchAsync.when(
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
                final court = match.effectiveCourtLabel.trim();
                final categoryLabel = MatchOpsLogic.categoryDisplayLabel(
                  categoryId: match.categoryId,
                  categories: tournamentCategories,
                );
                final title = liveTableTitleLabel(
                  match: match,
                  categoryLabel: categoryLabel,
                );
                final rules = MatchScoringLogic.setRulesLabel(setIdx);
                final setPoint = MatchScoringLogic.setPointHint(
                  current.a,
                  current.b,
                  setIndex: setIdx,
                );
                final teamA = liveTableTeamData(
                  match: match,
                  sideA: true,
                  enrichedTeam: enrichedCard?.teamA,
                );
                final teamB = liveTableTeamData(
                  match: match,
                  sideA: false,
                  enrichedTeam: enrichedCard?.teamB,
                );
                final actionsEnabled = !_saving && !match.isCompleted;
                final events = (pointEventsAsync.valueOrNull ?? const [])
                    .whereType<TournamentMatchPointEvent>()
                    .toList();

                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    LiveTableHeader(
                      courtLabel: court.isNotEmpty ? court : '—',
                      titleLabel: title.isNotEmpty ? title : 'Partida',
                      elapsedLabel: _elapsedLabel(match),
                      onBack: () => context.pop(),
                    ),
                    LiveTableSetStrip(
                      sets: sets,
                      currentSetIndex: setIdx,
                    ),
                    LiveTableTeamScoreBoard(
                      teamA: teamA,
                      teamB: teamB,
                      scoreA: liveTableCurrentSetScore(match, sideA: true),
                      scoreB: liveTableCurrentSetScore(match, sideA: false),
                      isServingA: liveTableIsServing(match, sideA: true),
                      isServingB: liveTableIsServing(match, sideA: false),
                      seedA: liveTableTeamSeed(match, sideA: true),
                      seedB: liveTableTeamSeed(match, sideA: false),
                      enabled: actionsEnabled,
                      onAddPointA: () => _point('A'),
                      onAddPointB: () => _point('B'),
                      onSubtractA: () => _undoIfSide('A'),
                      onSubtractB: () => _undoIfSide('B'),
                    ),
                    LiveTableSetRules(
                      rulesLabel: rules,
                      setPointHint: setPoint,
                    ),
                    LiveTableActionBar(
                      enabled: actionsEnabled,
                      onUndo: _undoLastPoint,
                      onSwapServe: _swapServe,
                      onHistory: () => context.push(
                        organizerMatchSummaryPath(
                          widget.tournamentId,
                          widget.matchId,
                        ),
                      ),
                    ),
                    Expanded(
                      child: SingleChildScrollView(
                        child: LiveTablePointFeed(
                          setIndex: setIdx,
                          events: events,
                          teamA: teamA,
                          teamB: teamB,
                        ),
                      ),
                    ),
                    if (match.isCompleted)
                      SafeArea(
                        top: false,
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                          child: FilledButton(
                            onPressed: () => context.push(
                              organizerMatchValidatePath(
                                widget.tournamentId,
                                widget.matchId,
                              ),
                            ),
                            style: FilledButton.styleFrom(
                              backgroundColor: AppColors.brand,
                              foregroundColor: AppColors.black,
                              minimumSize: const Size.fromHeight(48),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14),
                              ),
                              textStyle: AppTypography.soraRegular(
                                fontSize: 14,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            child: const Text('Validar resultado'),
                          ),
                        ),
                      ),
                  ],
                );
              },
            ),
          ),
          if (_saving)
            const Positioned.fill(
              child: ColoredBox(
                color: Color(0x44000000),
                child: Center(child: CircularProgressIndicator()),
              ),
            ),
        ],
      ),
    );
  }
}
