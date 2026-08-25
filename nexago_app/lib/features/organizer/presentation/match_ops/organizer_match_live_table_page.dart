import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../../data/match_point_write.dart';
import '../../domain/match_ops/match_ops_providers.dart';
import '../../domain/tournament_ops/tournament_ops_providers.dart';
import '../../../tournaments/data/tournament_live_matches_sync.dart';
import '../../../tournaments/domain/tournament_discovery_providers.dart';
import '../../../tournaments/domain/tournament_match.dart';
import '../../../tournaments/domain/tournament_match_point_event.dart';
import '../../../tournaments/domain/tournament_match_set.dart';
import '../../../tournaments/domain/tournament_match_status.dart';
import 'organizer_match_error.dart';
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

  /// Ferramentas extras (Quadra, Tempo, Modo exibição) pro mesário que também
  /// é o próprio árbitro — desligadas por padrão, sem persistência, igual ao
  /// modo exibição do web.
  bool _fullMode = false;
  bool _sidesSwapped = false;
  Map<String, int> _timeouts = const {'A': 0, 'B': 0};
  int? _timeoutsSetIndex;
  bool _presentMode = false;

  /// Overlay do tempo técnico em andamento (null = nenhum rodando). Usa o
  /// mesmo `_clockTimer` de 1s do relógio decorrido em vez de um timer
  /// próprio — `_maybeTickTechnicalTimeout` só age quando `_timeoutSide`
  /// não é nulo e a fase é `running`.
  static const _timeoutDurationSeconds = 60;
  String? _timeoutSide;
  int _timeoutNumber = 0;
  int _timeoutRemainingSeconds = _timeoutDurationSeconds;
  LiveTableTimeoutPhase _timeoutPhase = LiveTableTimeoutPhase.running;

  @override
  void initState() {
    super.initState();
    _clockTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      _maybeTickTechnicalTimeout();
      setState(() {});
    });
  }

  /// Bipe curto nos 3s finais, bipe mais longo (som de alerta) ao chegar a
  /// 0 — só sons de sistema, sem asset/pacote de áudio novo no app.
  void _maybeTickTechnicalTimeout() {
    if (_timeoutSide == null || _timeoutPhase != LiveTableTimeoutPhase.running) {
      return;
    }
    final next = _timeoutRemainingSeconds - 1;
    if (next <= 0) {
      _timeoutRemainingSeconds = 0;
      _timeoutPhase = LiveTableTimeoutPhase.ended;
      SystemSound.play(SystemSoundType.alert);
      return;
    }
    _timeoutRemainingSeconds = next;
    if (next <= 3) {
      SystemSound.play(SystemSoundType.click);
    }
  }

  @override
  void dispose() {
    _clockTimer?.cancel();
    if (_presentMode) {
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
      WakelockPlus.disable();
    }
    super.dispose();
  }

  void _toggleFullMode() => setState(() => _fullMode = !_fullMode);

  void _swapSides() => setState(() => _sidesSwapped = !_sidesSwapped);

  /// Zera os tempos técnicos ao trocar de set — mesma regra do web
  /// (`timeouts` é visual, o doc da partida não tem campo pra isso).
  void _resetTimeoutsIfSetChanged(int currentSetIndex) {
    if (_timeoutsSetIndex == currentSetIndex) return;
    _timeoutsSetIndex = currentSetIndex;
    _timeouts = const {'A': 0, 'B': 0};
  }

  /// Chama o tempo técnico da dupla que está sacando: conta como usado na
  /// hora (mesma regra de vôlei — chamado é chamado, mesmo que o mesário
  /// encerre a contagem antes do minuto acabar) e abre o overlay.
  void _startTechnicalTimeout(TournamentMatch match) {
    final servingId = match.servingTeamId.trim();
    final side = servingId == match.teamAId
        ? 'A'
        : servingId == match.teamBId
            ? 'B'
            : null;
    if (side == null || _timeoutSide != null) return;
    final current = _timeouts[side] ?? 0;
    if (current >= 2) return;
    setState(() {
      _timeouts = {..._timeouts, side: current + 1};
      _timeoutSide = side;
      _timeoutNumber = current + 1;
      _timeoutRemainingSeconds = _timeoutDurationSeconds;
      _timeoutPhase = LiveTableTimeoutPhase.running;
    });
  }

  /// Desconta um tempo técnico lançado por engano — cada painel tem o seu
  /// próprio botão, não depende de quem está sacando como o "Tempo técnico"
  /// da barra de baixo. Só relevante fora do overlay (que já cobre o caso
  /// de "chamei sem querer" via "Encerrar tempo").
  void _removeTimeout(String side) {
    final current = _timeouts[side] ?? 0;
    if (current <= 0) return;
    setState(() => _timeouts = {..._timeouts, side: current - 1});
  }

  void _pauseTechnicalTimeout() {
    if (_timeoutPhase != LiveTableTimeoutPhase.running) return;
    setState(() => _timeoutPhase = LiveTableTimeoutPhase.paused);
  }

  void _resumeTechnicalTimeout() {
    if (_timeoutPhase != LiveTableTimeoutPhase.paused) return;
    setState(() => _timeoutPhase = LiveTableTimeoutPhase.running);
  }

  void _endTechnicalTimeout() => setState(() => _timeoutSide = null);

  Future<void> _enterPresentMode() async {
    setState(() => _presentMode = true);
    await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    await WakelockPlus.enable();
  }

  Future<void> _exitPresentMode() async {
    setState(() => _presentMode = false);
    await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    await WakelockPlus.disable();
  }

  /// Ações que não couberam nos 2 painéis + barra de baixo da mesa do modo
  /// full: formato, placar completo, histórico, modo exibição e sair do
  /// próprio modo full — tudo que a mesa normal já tinha antes.
  Future<void> _showFullModeMoreMenu({
    required TournamentMatch match,
    required LiveTableTeamData teamA,
    required LiveTableTeamData teamB,
  }) async {
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: context.themeColors.surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!match.isCompleted)
              ListTile(
                leading: const Icon(Icons.tune_rounded),
                title: const Text('Alterar formato'),
                onTap: () {
                  Navigator.pop(sheetContext);
                  _showFormatSheet(match);
                },
              ),
            ListTile(
              leading: const Icon(Icons.edit_note_rounded),
              title: const Text('Placar completo'),
              onTap: () {
                Navigator.pop(sheetContext);
                _openQuickScoreSheet(match: match, teamA: teamA, teamB: teamB);
              },
            ),
            ListTile(
              leading: const Icon(Icons.schedule_rounded),
              title: const Text('Histórico'),
              onTap: () {
                Navigator.pop(sheetContext);
                context.push(
                  organizerMatchSummaryPath(widget.tournamentId, widget.matchId),
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.fullscreen_rounded),
              title: const Text('Modo exibição'),
              onTap: () {
                Navigator.pop(sheetContext);
                _enterPresentMode();
              },
            ),
            ListTile(
              leading: const Icon(Icons.close_rounded),
              title: const Text('Sair do modo full'),
              onTap: () {
                Navigator.pop(sheetContext);
                _toggleFullMode();
              },
            ),
          ],
        ),
      ),
    );
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

  /// O placar sai do doc lido DENTRO da transação ([buildPointWrite]), não do snapshot da tela:
  /// o listener só recebe a versão nova depois da transação resolver, e dois toques dentro dessa
  /// janela gravavam o mesmo placar duas vezes.
  Future<void> _point(String side) async {
    final match = _currentMatch();
    if (match == null || match.isCompleted) return;

    setState(() => _saving = true);
    try {
      final repo = ref.read(tournamentMatchesRepositoryProvider);

      await repo.recordPointTransaction(
        matchId: widget.matchId,
        build: (fresh) => buildPointWrite(fresh, side),
      );
      // Avanço de chave + ranking são propagados pelo trigger
      // onTournamentMatchCompletedAdvance ao concluir a partida (atômico +
      // idempotente), substituindo as chamadas HTTPS sequenciais por ponto.
      await TournamentLiveMatchesSync.syncForTournament(
        FirebaseFirestore.instance,
        widget.tournamentId,
      );
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, friendlyMatchScoreError(e), isError: true);
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _showFormatSheet(TournamentMatch match) async {
    if (match.isCompleted || _saving) return;
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
                      foregroundColor: option == match.bestOf
                          ? AppColors.brand
                          : context.themeColors.onSurface,
                      side: BorderSide(
                        color: option == match.bestOf
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
    if (choice == null || choice == match.bestOf) return;
    await _changeFormat(match, choice);
  }

  Future<void> _changeFormat(TournamentMatch match, int newBestOf) async {
    if (match.isCompleted) return;
    if (newBestOf < match.bestOf &&
        !MatchScoringLogic.canReduceBestOf(match.sets, newBestOf)) {
      if (mounted) {
        showAppSnackBar(
          context,
          'Não dá para mudar para ${matchBestOfLabel(newBestOf)}: '
          'há sets já pontuados.',
          isError: true,
        );
      }
      return;
    }

    final result = MatchScoringLogic.applyBestOfChange(
      sets: match.sets,
      newBestOf: newBestOf,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
    );
    final wins = MatchScoringLogic.setsWon(result.sets, bestOf: newBestOf);

    setState(() => _saving = true);
    try {
      final repo = ref.read(tournamentMatchesRepositoryProvider);
      await repo.updateMatchFields(
        matchId: widget.matchId,
        fields: {
          'bestOf': newBestOf,
          'sets': result.sets.map((s) => s.toMap()).toList(),
          'currentSetIndex': result.currentSetIndex,
          'status': result.completed
              ? TournamentMatchStatus.completed
              : TournamentMatchStatus.inProgress,
          'resultA': '${wins.a}',
          'resultB': '${wins.b}',
          if (result.completed) 'winnerId': result.winnerId,
          if (result.completed) 'matchEndedAt': FieldValue.serverTimestamp(),
          if (!result.completed) 'winnerId': FieldValue.delete(),
          if (!result.completed) 'matchEndedAt': FieldValue.delete(),
        },
      );
      await TournamentLiveMatchesSync.syncForTournament(
        FirebaseFirestore.instance,
        widget.tournamentId,
      );
      if (mounted) {
        showAppSnackBar(
          context,
          'Formato alterado para ${matchBestOfLabel(newBestOf)}.',
        );
      }
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, friendlyMatchScoreError(e), isError: true);
      }
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
    // Locais finais: a promoção de nulidade não atravessa o closure do `build`.
    final undoneSetIndex = lastPoint.setIndex;

    setState(() => _saving = true);
    try {
      final repo = ref.read(tournamentMatchesRepositoryProvider);

      await repo.recordPointTransaction(
        matchId: widget.matchId,
        build: (fresh) => buildUndoWrite(fresh, side, undoneSetIndex),
      );
      await TournamentLiveMatchesSync.syncForTournament(
        FirebaseFirestore.instance,
        widget.tournamentId,
      );
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, friendlyMatchScoreError(e), isError: true);
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _openQuickScoreSheet({
    required TournamentMatch match,
    required LiveTableTeamData teamA,
    required LiveTableTeamData teamB,
  }) async {
    final events = (ref
                .read(organizerMatchPointEventsProvider(widget.matchId))
                .valueOrNull ??
            const [])
        .whereType<TournamentMatchPointEvent>()
        .toList();
    final hasPartialScore = match.sets.any((s) => s.a > 0 || s.b > 0) ||
        events.isNotEmpty;

    if (hasPartialScore && mounted) {
      final replace = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Substituir placar parcial?'),
          content: const Text(
            'A mesa já registrou pontos nesta partida. '
            'O placar completo vai substituir o andamento atual.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text('Continuar'),
            ),
          ],
        ),
      );
      if (replace != true || !mounted) return;
    }

    await showLiveTableQuickScoreSheet(
      context: context,
      match: match,
      teamA: teamA,
      teamB: teamB,
      onSubmit: _submitQuickScore,
      onWalkover: _declareQuickScoreWalkover,
    );
  }

  Future<void> _submitQuickScore(
    List<TournamentMatchSet> sets,
    int bestOf,
  ) async {
    setState(() => _saving = true);
    try {
      await ref.read(organizerMatchScheduleServiceProvider).submitMatchResult(
            matchId: widget.matchId,
            sets: sets.map((s) => {'a': s.a, 'b': s.b}).toList(),
            bestOf: bestOf,
          );
      await TournamentLiveMatchesSync.syncForTournament(
        FirebaseFirestore.instance,
        widget.tournamentId,
      );
      if (mounted) {
        showAppSnackBar(context, 'Placar salvo.');
      }
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, friendlyMatchScoreError(e), isError: true);
      }
      rethrow;
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _declareQuickScoreWalkover(String winnerTeamId) async {
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
      }
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, friendlyMatchScoreError(e), isError: true);
      }
      rethrow;
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  /// Abre o saque na dupla escolhida. Não inicia a partida nem marca ponto: grava só o campo,
  /// como o "Trocar saque" — daí em diante o rally resolve sozinho.
  Future<void> _chooseServe(String side) async {
    final match = _currentMatch();
    if (match == null || _saving || match.isCompleted) return;
    final teamId = side.toUpperCase() == 'A' ? match.teamAId : match.teamBId;
    if (teamId.trim().isEmpty) return;

    setState(() => _saving = true);
    try {
      await ref.read(tournamentMatchesRepositoryProvider).updateMatchFields(
            matchId: widget.matchId,
            fields: {'servingTeamId': teamId},
          );
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, friendlyMatchScoreError(e), isError: true);
      }
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
      if (mounted) {
        showAppSnackBar(context, friendlyMatchScoreError(e), isError: true);
      }
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
                _resetTimeoutsIfSetChanged(setIdx);
                final sets = match.sets;
                final current = sets.length > setIdx
                    ? sets[setIdx]
                    : const TournamentMatchSet(a: 0, b: 0);
                final court = match.effectiveCourtLabel.trim();
                final categoryLabel = MatchOpsLogic.categoryCompactLabel(
                  categoryId: match.categoryId,
                  categories: tournamentCategories,
                );
                final title = liveTableTitleLabel(
                  match: match,
                  categoryLabel: categoryLabel,
                );
                final rules = MatchScoringLogic.setRulesLabel(
                  setIdx,
                  bestOf: match.bestOf,
                );
                final setPoint = MatchScoringLogic.setPointHint(
                  current.a,
                  current.b,
                  setIndex: setIdx,
                  bestOf: match.bestOf,
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

                if (_presentMode) {
                  final (setsWonA, setsWonB) = liveTableSetsWon(match);
                  return LiveTablePresentView(
                    teamA: _sidesSwapped ? teamB : teamA,
                    teamB: _sidesSwapped ? teamA : teamB,
                    scoreA: liveTableCurrentSetScore(
                      match,
                      sideA: !_sidesSwapped,
                    ),
                    scoreB: liveTableCurrentSetScore(
                      match,
                      sideA: _sidesSwapped,
                    ),
                    isServingA: liveTableIsServing(
                      match,
                      sideA: !_sidesSwapped,
                    ),
                    isServingB: liveTableIsServing(
                      match,
                      sideA: _sidesSwapped,
                    ),
                    setsWonA: _sidesSwapped ? setsWonB : setsWonA,
                    setsWonB: _sidesSwapped ? setsWonA : setsWonB,
                    enabled: actionsEnabled,
                    onUndo: _undoLastPoint,
                    onExit: _exitPresentMode,
                  );
                }

                if (_fullMode) {
                  final fullModeEnabled = actionsEnabled && _timeoutSide == null;
                  final needsServe = MatchScoringLogic.needsStartingServe(
                    servingTeamId: match.servingTeamId,
                    status: match.status,
                    teamAId: match.teamAId,
                    teamBId: match.teamBId,
                  );
                  void handleTap(String side) {
                    if (needsServe) {
                      _chooseServe(side);
                    } else {
                      _point(side);
                    }
                  }

                  return LiveTableFullModeMesa(
                    teamA: _sidesSwapped ? teamB : teamA,
                    teamB: _sidesSwapped ? teamA : teamB,
                    scoreA: liveTableCurrentSetScore(
                      match,
                      sideA: !_sidesSwapped,
                    ),
                    scoreB: liveTableCurrentSetScore(
                      match,
                      sideA: _sidesSwapped,
                    ),
                    isServingA: liveTableIsServing(
                      match,
                      sideA: !_sidesSwapped,
                    ),
                    isServingB: liveTableIsServing(
                      match,
                      sideA: _sidesSwapped,
                    ),
                    timeoutsA: _timeouts[_sidesSwapped ? 'B' : 'A'] ?? 0,
                    timeoutsB: _timeouts[_sidesSwapped ? 'A' : 'B'] ?? 0,
                    enabled: fullModeEnabled,
                    onTapA: () => handleTap(_sidesSwapped ? 'B' : 'A'),
                    onTapB: () => handleTap(_sidesSwapped ? 'A' : 'B'),
                    onRemoveTimeoutA: () =>
                        _removeTimeout(_sidesSwapped ? 'B' : 'A'),
                    onRemoveTimeoutB: () =>
                        _removeTimeout(_sidesSwapped ? 'A' : 'B'),
                    onSwapServe: _swapServe,
                    onSwapSides: _swapSides,
                    onAddTimeout: () => _startTechnicalTimeout(match),
                    onUndo: _undoLastPoint,
                    activeTimeout: _timeoutSide == null
                        ? null
                        : LiveTableActiveTimeout(
                            teamLabel:
                                _timeoutSide == 'A' ? teamA.label : teamB.label,
                            timeoutNumber: _timeoutNumber,
                            remainingSeconds: _timeoutRemainingSeconds,
                            totalSeconds: _timeoutDurationSeconds,
                            phase: _timeoutPhase,
                          ),
                    onPauseTimeout: _pauseTechnicalTimeout,
                    onResumeTimeout: _resumeTechnicalTimeout,
                    onEndTimeout: _endTechnicalTimeout,
                    onMore: () => _showFullModeMoreMenu(
                      match: match,
                      teamA: teamA,
                      teamB: teamB,
                    ),
                  );
                }

                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    LiveTableHeader(
                      courtLabel: court.isNotEmpty ? court : '—',
                      titleLabel: title.isNotEmpty ? title : 'Partida',
                      elapsedLabel: _elapsedLabel(match),
                      onBack: () => context.pop(),
                      fullModeActive: _fullMode,
                      onToggleFullMode: _toggleFullMode,
                    ),
                    LiveTableSetStrip(
                      sets: sets,
                      currentSetIndex: setIdx,
                    ),
                    if (MatchScoringLogic.needsStartingServe(
                      servingTeamId: match.servingTeamId,
                      status: match.status,
                      teamAId: match.teamAId,
                      teamBId: match.teamBId,
                    ))
                      LiveTableStartingServe(
                        teamA: teamA,
                        teamB: teamB,
                        enabled: !_saving,
                        onChoose: _chooseServe,
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
                      bestOf: match.bestOf,
                      formatEnabled: !_saving && !match.isCompleted,
                      onChangeFormat: () => _showFormatSheet(match),
                    ),
                    if (!match.isCompleted)
                      LiveTableQuickScoreEntry(
                        enabled: actionsEnabled,
                        onTap: () => _openQuickScoreSheet(
                          match: match,
                          teamA: teamA,
                          teamB: teamB,
                        ),
                      ),
                    LiveTableActionBar(
                      enabled: actionsEnabled,
                      onUndo: _undoLastPoint,
                      onSwapServe: _swapServe,
                      onQuickScore: () => _openQuickScoreSheet(
                        match: match,
                        teamA: teamA,
                        teamB: teamB,
                      ),
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
