import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/sports/sport_catalog.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../../data/games_point_write.dart';
import '../../data/match_point_write.dart';
import '../../data/match_sanction_write.dart';
import '../../domain/match_ops/live_point_replay.dart';
import '../../domain/match_ops/match_medical_timeout_logic.dart';
import '../../domain/match_ops/match_ops_providers.dart';
import '../../domain/match_ops/match_serving_player_logic.dart';
import '../../domain/tournament_ops/tournament_ops_providers.dart';
import '../../../tournaments/data/tournament_live_matches_sync.dart';
import '../../../tournaments/data/tournament_matches_repository.dart';
import '../../../tournaments/domain/tournament_discovery_providers.dart';
import '../../../tournaments/domain/tournament_match.dart';
import '../../../tournaments/domain/tournament_match_display.dart';
import '../../../tournaments/domain/tournament_match_card_view_model.dart';
import '../../../tournaments/domain/tournament_match_kit_color.dart';
import '../../../tournaments/domain/tournament_match_point_event.dart';
import '../../../tournaments/domain/tournament_match_sanction.dart';
import '../../../tournaments/domain/tournament_match_serving_players.dart';
import '../../../tournaments/domain/tournament_match_set.dart';
import '../../../tournaments/domain/tournament_match_status.dart';
import 'organizer_match_error.dart';
import 'organizer_match_navigation.dart';
import 'mesa_sun/mesa_sun.dart';
import 'widgets/organizer_match_kit_color_widgets.dart';
import 'widgets/organizer_match_live_table_mesa.dart';
import 'widgets/organizer_match_live_table_sanction_sheet.dart';
import 'widgets/organizer_match_live_table_start_serve.dart';
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
  static const _timeoutDurationSeconds = technicalTimeoutSeconds;
  bool _timeoutPickerOpen = false;
  String? _timeoutSide;
  int _timeoutNumber = 0;
  int _timeoutRemainingSeconds = _timeoutDurationSeconds;
  LiveTableTimeoutPhase _timeoutPhase = LiveTableTimeoutPhase.running;

  /// Tempo médico é o contrário do técnico: mora no DOC da partida (quem está sendo atendido,
  /// desde quando e quem já usou a cota), então aqui só fica o que é de tela — o seletor aberto
  /// e a marca do atendimento que já tocou o alerta de fim.
  bool _medicalPickerOpen = false;
  String? _medicalAlertedKey;

  /// Lido no `initState`: o `dispose` encerra o tempo técnico em andamento, e o Riverpod não
  /// deixa usar `ref` depois que o widget saiu da árvore — sair da mesa no meio do tempo
  /// lançava `Bad state` e o overlay da transmissão ficava preso no tempo técnico.
  late final TournamentMatchesRepository _matchesRepository;

  @override
  void initState() {
    super.initState();
    _matchesRepository = ref.read(tournamentMatchesRepositoryProvider);
    // Tela ligada enquanto a partida está aberta na mesa.
    unawaited(WakelockPlus.enable().catchError((Object _) {}));
    _clockTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      _maybeTickTechnicalTimeout();
      _maybeAlertMedicalTimeoutEnd();
      setState(() {});
    });
  }

  /// Bipe curto nos 3s finais, bipe mais longo (som de alerta) ao chegar a
  /// 0 — só sons de sistema, sem asset/pacote de áudio novo no app.
  void _maybeTickTechnicalTimeout() {
    if (_timeoutSide == null ||
        _timeoutPhase != LiveTableTimeoutPhase.running) {
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

  /// O tempo médico não tem contagem local pra tocar bipe a cada segundo (o relógio é derivado
  /// do carimbo do servidor). O que a mesa precisa é do alerta de FIM — uma vez só por
  /// atendimento, marcado pelo `startedAt` pra não repetir a cada tique.
  void _maybeAlertMedicalTimeoutEnd() {
    final timeout = _currentMatch()?.medicalTimeout;
    if (timeout == null) {
      _medicalAlertedKey = null;
      return;
    }
    final key = timeout.startedAt?.toIso8601String() ?? '';
    if (key.isEmpty || _medicalAlertedKey == key) return;
    if (!MatchMedicalTimeoutLogic.isEnded(timeout, DateTime.now())) return;
    _medicalAlertedKey = key;
    SystemSound.play(SystemSoundType.alert);
  }

  @override
  void dispose() {
    _clockTimer?.cancel();
    if (_timeoutSide != null) _publishTechnicalTimeoutEnd();
    if (_presentMode) {
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    }
    unawaited(WakelockPlus.disable().catchError((Object _) {}));
    super.dispose();
  }

  void _toggleFullMode() => setState(() => _fullMode = !_fullMode);

  void _swapSides() => setState(() => _sidesSwapped = !_sidesSwapped);

  /// Troca de lado já confirmada pela mesa: (set, total de pontos). Enquanto o par atual
  /// não bate com isto, o modal de troca fica de pé e nenhum ponto entra.
  int? _switchAckSet;
  int? _switchAckTotal;

  void _confirmSideSwitch(int setIdx, int total) => setState(() {
        _switchAckSet = setIdx;
        _switchAckTotal = total;
      });

  /// Último total de pontos em que a troca de quadra já vibrou — evita
  /// repetir a vibração a cada rebuild do mesmo placar.
  int? _courtSwitchBuzzedAt;

  /// Troca de quadra por pontos (vôlei de praia: 7, e 5 no decisivo). Sai do
  /// placar, então desfazer o ponto apaga o aviso. `null` = sem a regra.
  LiveTableCourtSwitch? _courtSwitchOf(TournamentMatch match, int setIdx) {
    if (!match.isInProgress) return null;
    final profile = matchScoringProfile(match);
    final interval = ScoringRules.courtSwitchInterval(profile, setIdx);
    if (interval == null) return null;
    final sets = match.sets;
    final set = setIdx < sets.length ? sets[setIdx] : null;
    final total = (set?.a ?? 0) + (set?.b ?? 0);
    final due = ScoringRules.isCourtSwitchDue(
      profile,
      setIdx,
      ScoreSetValue(set?.a ?? 0, set?.b ?? 0),
    );
    if (due && _courtSwitchBuzzedAt != total) {
      _courtSwitchBuzzedAt = total;
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => HapticFeedback.mediumImpact(),
      );
    } else if (!due) {
      _courtSwitchBuzzedAt = null;
    }
    return LiveTableCourtSwitch(interval: interval, total: total, due: due);
  }

  /// Zera os tempos técnicos ao trocar de set — mesma regra do web
  /// (`timeouts` é visual, o doc da partida não tem campo pra isso).
  void _resetTimeoutsIfSetChanged(int currentSetIndex) {
    if (_timeoutsSetIndex == currentSetIndex) return;
    _timeoutsSetIndex = currentSetIndex;
    _timeouts = const {'A': 0, 'B': 0};
  }

  /// "Tempo técnico" abre o seletor primeiro — o mesário escolhe a equipe
  /// (não é mais inferido de quem está sacando; a tela só mostra isso como
  /// contexto no cartão).
  void _openTimeoutTeamPicker() {
    if (_timeoutSide != null || _timeoutPickerOpen) return;
    setState(() => _timeoutPickerOpen = true);
  }

  void _cancelTimeoutTeamPicker() => setState(() => _timeoutPickerOpen = false);

  /// Conta o tempo como usado na hora da escolha (mesma regra de vôlei —
  /// chamado é chamado, mesmo que o mesário encerre a contagem antes do
  /// minuto acabar) e abre o overlay de contagem pra essa equipe.
  void _chooseTimeoutTeam(String side) {
    final current = _timeouts[side] ?? 0;
    if (current >= 2) return;
    setState(() {
      _timeoutPickerOpen = false;
      _timeouts = {..._timeouts, side: current + 1};
      _timeoutSide = side;
      _timeoutNumber = current + 1;
      _timeoutRemainingSeconds = _timeoutDurationSeconds;
      _timeoutPhase = LiveTableTimeoutPhase.running;
    });
    _publishTechnicalTimeoutStart(side);
  }

  /// Publica o tempo técnico no doc pro overlay de transmissão. Best-effort: a contagem local
  /// manda e a mesa não vê erro nem reverte se a escrita falhar.
  void _publishTechnicalTimeoutStart(String side) {
    _matchesRepository
        .recordPointTransaction(
          matchId: widget.matchId,
          build: (fresh) => buildTechnicalTimeoutStartWrite(fresh, side: side),
        )
        .catchError((Object _) => null);
  }

  void _publishTechnicalTimeoutEnd() {
    _matchesRepository
        .recordPointTransaction(
          matchId: widget.matchId,
          build: buildTechnicalTimeoutEndWrite,
        )
        .catchError((Object _) => null);
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

  void _endTechnicalTimeout() {
    setState(() => _timeoutSide = null);
    _publishTechnicalTimeoutEnd();
  }

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
    bool canSwapServingPlayer = false,
  }) async {
    // A folha sobe no navigator raiz, fora do `MesaSunScope`: leva o tema da mesa junto.
    final baseTheme = Theme.of(context);
    final pageTheme = ref.read(mesaSunModeProvider)
        ? MesaSun.themeFrom(baseTheme)
        : baseTheme;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppThemeColors(pageTheme.colorScheme).surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) {
        final maxHeight = MediaQuery.sizeOf(sheetContext).height * 0.9;
        return Theme(
          data: pageTheme,
          child: SafeArea(
            child: ConstrainedBox(
              constraints: BoxConstraints(maxHeight: maxHeight),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (!_fullMode && !match.isCompleted) ...[
                      ListTile(
                        leading: const Icon(Icons.sync_alt_rounded),
                        title: const Text('Trocar saque'),
                        enabled:
                            !MatchServingPlayerLogic.isServeOrderLocked(match),
                        onTap: () {
                          Navigator.pop(sheetContext);
                          _swapServe();
                        },
                      ),
                      if (canSwapServingPlayer)
                        ListTile(
                          leading: const Icon(Icons.person_outline_rounded),
                          title: const Text('Trocar atleta no saque'),
                          onTap: () {
                            Navigator.pop(sheetContext);
                            _swapServingPlayer();
                          },
                        ),
                      ListTile(
                        leading: const Icon(Icons.swap_horiz_rounded),
                        title: const Text('Trocar lados da tela'),
                        onTap: () {
                          Navigator.pop(sheetContext);
                          _swapSides();
                        },
                      ),
                    ],
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
                        _openQuickScoreSheet(
                          match: match,
                          teamA: teamA,
                          teamB: teamB,
                        );
                      },
                    ),
                    if (!match.isCompleted)
                      ListTile(
                        leading: Icon(
                          Icons.medical_services_outlined,
                          color: AppThemeColors(pageTheme.colorScheme).live,
                        ),
                        title: const Text('Tempo médico'),
                        subtitle: const Text(
                          'Atendimento de 5 min — um por atleta',
                        ),
                        enabled: match.medicalTimeout == null,
                        onTap: () {
                          Navigator.pop(sheetContext);
                          _openMedicalPicker();
                        },
                      ),
                    Consumer(
                      builder: (_, ref, __) => SwitchListTile(
                        key: const ValueKey('mesa-sun-menu-item'),
                        secondary: const Icon(Icons.wb_sunny_rounded),
                        title: const Text('Modo sol'),
                        subtitle:
                            const Text('Alto contraste pra ler sob sol forte'),
                        value: ref.watch(mesaSunModeProvider),
                        onChanged: (_) {
                          ref.read(mesaSunModeProvider.notifier).toggle();
                          Navigator.pop(sheetContext);
                        },
                      ),
                    ),
                    if (!match.isCompleted)
                      ListTile(
                        leading: const Icon(Icons.palette_outlined),
                        title: const Text('Editar cores'),
                        subtitle: const Text('Cor da camisa de cada dupla'),
                        onTap: () {
                          Navigator.pop(sheetContext);
                          _openKitColorSheet(
                            match: match,
                            teamA: teamA,
                            teamB: teamB,
                            theme: pageTheme,
                          );
                        },
                      ),
                    ListTile(
                      leading: const Icon(Icons.style_rounded),
                      title: const Text('Cartão'),
                      subtitle: const Text('Amarelo ou vermelho na súmula'),
                      onTap: () {
                        Navigator.pop(sheetContext);
                        _openSanctionSheet(
                            match: match, teamA: teamA, teamB: teamB);
                      },
                    ),
                    ListTile(
                      leading: const Icon(Icons.schedule_rounded),
                      title: const Text('Histórico'),
                      onTap: () {
                        Navigator.pop(sheetContext);
                        context.push(
                          organizerMatchSummaryPath(
                            widget.tournamentId,
                            widget.matchId,
                          ),
                        );
                      },
                    ),
                    // ListTile(
                    //   leading: const Icon(Icons.fullscreen_rounded),
                    //   title: const Text('Modo exibição'),
                    //   onTap: () {
                    //     Navigator.pop(sheetContext);
                    //     _enterPresentMode();
                    //   },
                    // ),
                    ListTile(
                      leading: Icon(
                        _fullMode
                            ? Icons.close_rounded
                            : Icons.view_column_rounded,
                      ),
                      title:
                          Text(_fullMode ? 'Sair do modo full' : 'Modo full'),
                      onTap: () {
                        Navigator.pop(sheetContext);
                        _toggleFullMode();
                      },
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
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
        build: (fresh) =>
            buildPointWrite(fresh, side, rosterSizes: _rosterSizes()),
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

  /// "Editar cores" no meio do jogo: grava a cor na hora e não mexe no placar nem no saque.
  Future<void> _openKitColorSheet({
    required TournamentMatch match,
    required LiveTableTeamData teamA,
    required LiveTableTeamData teamB,
    required ThemeData theme,
  }) {
    return showKitColorEditSheet(
      context,
      theme: theme,
      labelA: teamA.label,
      labelB: teamB.label,
      kitA: KitColors.forSide(
        'A',
        idA: match.kitColorA,
        idB: match.kitColorB,
      ),
      kitB: KitColors.forSide(
        'B',
        idA: match.kitColorA,
        idB: match.kitColorB,
      ),
      onChanged: (a, b) async {
        try {
          await ref.read(tournamentMatchesRepositoryProvider).updateMatchFields(
            matchId: widget.matchId,
            fields: {'kitColorA': a.id, 'kitColorB': b.id},
          );
        } catch (e) {
          if (mounted) {
            showAppSnackBar(context, friendlyMatchScoreError(e), isError: true);
          }
        }
      },
    );
  }

  Future<void> _openSanctionSheet({
    required TournamentMatch match,
    required LiveTableTeamData teamA,
    required LiveTableTeamData teamB,
  }) {
    return showMatchSanctionSheet(
      context,
      teamA: teamA,
      teamB: teamB,
      sanctions: match.sanctions,
      onConfirm: _recordSanction,
      onRemove: _removeSanction,
    );
  }

  /// Vermelho vira ponto do adversário na MESMA transação do cartão — ver [buildSanctionWrite].
  Future<void> _recordSanction(SanctionChoice choice) async {
    final match = _currentMatch();
    if (match == null || match.isCompleted) return;

    // Um id por lançamento, fora do `build`: a transação pode repetir o build.
    final sanctionId = FirebaseFirestore.instance.collection('_').doc().id;
    setState(() => _saving = true);
    try {
      final written = await ref
          .read(tournamentMatchesRepositoryProvider)
          .recordPointTransaction(
            matchId: widget.matchId,
            build: (fresh) => buildSanctionWrite(
              fresh,
              sanctionId: sanctionId,
              card: choice.card,
              side: choice.side,
              playerSlot: choice.slot,
              playerName: choice.playerName,
              reason: choice.reason,
              rosterSizes: _rosterSizes(),
            ),
          );
      if (written == null) {
        if (mounted) {
          showAppSnackBar(
            context,
            'Não foi possível lançar o cartão — a partida já foi encerrada.',
            isError: true,
          );
        }
      } else if (choice.card == MatchSanctionCard.red) {
        await TournamentLiveMatchesSync.syncForTournament(
          FirebaseFirestore.instance,
          widget.tournamentId,
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

  Future<void> _removeSanction(String sanctionId) async {
    setState(() => _saving = true);
    try {
      await ref
          .read(tournamentMatchesRepositoryProvider)
          .recordPointTransaction(
            matchId: widget.matchId,
            build: (fresh) => buildSanctionRemovalWrite(fresh, sanctionId),
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
                            : context.themeColors.onSurfaceMuted.withValues(
                                alpha: 0.3,
                              ),
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
    // Troca de formato é regra de pontos (`applyBestOfChange`); em games só
    // antes do 1º ponto.
    if (gamesProfileOf(match) != null &&
        (match.sets.any((s) => s.a > 0 || s.b > 0) ||
            match.currentGame.a + match.currentGame.b > 0)) {
      if (mounted) {
        showAppSnackBar(
          context,
          'Em partida de games o formato só muda antes do primeiro ponto.',
          isError: true,
        );
      }
      return;
    }
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
    final lastPoint = _lastUndoablePoint(match, events);
    if (lastPoint == null) {
      if (mounted) {
        showAppSnackBar(context, 'Nenhum ponto para desfazer.', isError: true);
      }
      return;
    }

    final side = lastPoint.side ?? 'A';
    // Locais finais: a promoção de nulidade não atravessa o closure do `build`.
    final undoneSetIndex = lastPoint.setIndex;
    final undonePrev = lastPoint.prev;
    final undoneLanded = (
      scoreA: lastPoint.scoreA,
      scoreB: lastPoint.scoreB,
      gameA: lastPoint.gameA,
      gameB: lastPoint.gameB,
    );

    setState(() => _saving = true);
    try {
      final repo = ref.read(tournamentMatchesRepositoryProvider);

      final written = await repo.recordPointTransaction(
        matchId: widget.matchId,
        build: (fresh) => buildUndoWrite(
          fresh,
          side,
          undoneSetIndex,
          prev: undonePrev,
          landed: undoneLanded,
          rosterSizes: _rosterSizes(),
        ),
      );
      if (written == null) {
        if (mounted) {
          showAppSnackBar(
            context,
            'Não deu para desfazer: o placar mudou desde este ponto. '
            'Confira a mesa e tente de novo.',
            isError: true,
          );
        }
        return;
      }
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
    final hasPartialScore =
        match.sets.any((s) => s.a > 0 || s.b > 0) || events.isNotEmpty;

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
            sets: [
              for (final s in sets)
                <String, Object>{
                  'a': s.a,
                  'b': s.b,
                  if (s.tb != null) 'tb': {'a': s.tb!.a, 'b': s.tb!.b},
                },
            ],
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
      await ref
          .read(organizerMatchScheduleServiceProvider)
          .declareMatchWalkover(
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
  Future<void> _chooseServe(String side, {int? slot}) async {
    final match = _currentMatch();
    if (match == null || _saving || match.isCompleted) return;
    final teamId = side.toUpperCase() == 'A' ? match.teamAId : match.teamBId;
    if (teamId.trim().isEmpty) return;

    setState(() => _saving = true);
    try {
      await ref.read(tournamentMatchesRepositoryProvider).updateMatchFields(
            matchId: widget.matchId,
            fields: slot == null
                ? servingTeamFields(
                    match,
                    teamId,
                    rosterSizes: _rosterSizes(),
                  )
                : startingServeFields(
                    match,
                    side.toUpperCase(),
                    slot,
                    rosterSizes: _rosterSizes(),
                  ),
          );
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, friendlyMatchScoreError(e), isError: true);
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  /// Última abertura confirmada nesta sessão (set + escolhas): os sets seguintes chegam
  /// pré-preenchidos com o saque invertido. O tie-break nunca herda — sorteio novo.
  int? _lastStartSet;
  LiveTableStartConfig? _lastStart;

  LiveTableStartConfig? _startPrefill(int setIdx, int bestOf) {
    final last = _lastStart;
    final lastSet = _lastStartSet;
    if (last == null || lastSet == null || setIdx <= lastSet) return null;
    final isTieBreak = bestOf >= 3 && setIdx >= 2;
    if (isTieBreak) return null;
    String other(String side) => side == 'A' ? 'B' : 'A';
    return LiveTableStartConfig(
      servingSide: other(last.servingSide),
      slotA: last.slotA,
      slotB: last.slotB,
      leftSide: other(last.leftSide),
      kitA: last.kitA,
      kitB: last.kitB,
    );
  }

  Future<void> _startSet(LiveTableStartConfig config, int setIdx) async {
    final match = _currentMatch();
    if (match == null || _saving || match.isCompleted) return;
    final teamId = config.servingSide == 'A' ? match.teamAId : match.teamBId;
    if (teamId.trim().isEmpty) return;
    setState(() => _saving = true);
    try {
      await ref.read(tournamentMatchesRepositoryProvider).updateMatchFields(
        matchId: widget.matchId,
        fields: {
          ...startingSetFields(
            match,
            config.servingSide,
            slotA: config.slotA,
            slotB: config.slotB,
            rosterSizes: _rosterSizes(),
          ),
          // A cor da camisa vai no mesmo update da abertura do set.
          'kitColorA': config.kitA.id,
          'kitColorB': config.kitB.id,
        },
      );
      if (mounted) {
        setState(() {
          _lastStartSet = setIdx;
          _lastStart = config;
          _sidesSwapped = config.leftSide == 'B';
          _switchAckSet = null;
          _switchAckTotal = null;
        });
      }
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

    // Depois do 1º ponto do set a ordem de saque não se mexe (ver `isServeOrderLocked`).
    if (MatchServingPlayerLogic.isServeOrderLocked(match)) return;

    final current = match.servingTeamId.trim();
    final next = current.isEmpty || current == match.teamBId
        ? match.teamAId
        : match.teamBId;
    if (next.trim().isEmpty) return;

    setState(() => _saving = true);
    try {
      await ref.read(tournamentMatchesRepositoryProvider).updateMatchFields(
            matchId: widget.matchId,
            fields: servingTeamFields(
              match,
              next,
              rosterSizes: _rosterSizes(),
            ),
          );
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, friendlyMatchScoreError(e), isError: true);
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  /// Elenco de cada lado (1 individual, 2 dupla, 3–5 equipe), do enriquecimento que a tela já
  /// carregou. O doc da partida não sabe o elenco; enquanto as equipes não chegam, dupla —
  /// mesma regra das mesas web (`withRosterSizes`).
  MatchRosterSizes _rosterSizes() {
    final card = ref
        .read(organizerMatchCardsByIdProvider(widget.tournamentId))
        .valueOrNull?[widget.matchId];
    return MatchRosterSizes(
      a: card?.teamA.rosterSize ?? 2,
      b: card?.teamB.rosterSize ?? 2,
    );
  }

  /// Declara qual atleta da dupla no saque vai à linha (posição no elenco). Não marca
  /// ponto nem inicia nada — a partir daí o rodízio resolve sozinho a cada virada de saque.
  Future<void> _chooseServingPlayer(int slot) async {
    final match = _currentMatch();
    if (match == null || _saving || match.isCompleted) return;
    final side = MatchServingPlayerLogic.sideOfTeam(
      teamId: match.servingTeamId,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
    );
    if (side == null) return;

    setState(() => _saving = true);
    try {
      await ref.read(tournamentMatchesRepositoryProvider).updateMatchFields(
            matchId: widget.matchId,
            fields: servingPlayerFields(
              match,
              side,
              slot,
              rosterSizes: _rosterSizes(),
            ),
          );
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, friendlyMatchScoreError(e), isError: true);
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  /// Troca o sacador DENTRO da dupla que está com o saque — o conserto de mão pro caso em que
  /// o rodízio saiu do lugar (um desfazer que caiu numa virada de saque, por exemplo).
  ///
  /// Com a dupla ainda sem ordem declarada o toque DECLARA o primeiro atleta em vez de não
  /// fazer nada: no modo full o selo do saque é o único caminho pra isso (a faixa "Quem saca
  /// por…?" não cabe lá), e tocar de novo passa pro parceiro.
  Future<void> _swapServingPlayer() async {
    final match = _currentMatch();
    if (match == null || _saving || match.isCompleted) return;
    final side = MatchServingPlayerLogic.sideOfTeam(
      teamId: match.servingTeamId,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
    );
    if (side == null) return;
    final current = match.servingPlayers.slotForSide(side);
    if (current == 0) {
      await _chooseServingPlayer(1);
      return;
    }
    if (MatchServingPlayerLogic.isServeOrderLocked(match)) return;
    // Próximo do elenco: dupla alterna, equipe roda, individual fica no 1.
    final next = MatchServingPlayerLogic.swappedSlots(
      slots: match.servingPlayers,
      servingTeamId: match.servingTeamId,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
      rosterSizes: _rosterSizes(),
    ).slotForSide(side);
    await _chooseServingPlayer(next);
  }

  void _openMedicalPicker() {
    final match = _currentMatch();
    if (match == null || match.isCompleted || match.medicalTimeout != null) {
      return;
    }
    setState(() => _medicalPickerOpen = true);
  }

  void _cancelMedicalPicker() => setState(() => _medicalPickerOpen = false);

  /// Abre o atendimento no doc: a partida PARA (o overlay cobre a mesa em todas as
  /// superfícies) e a cota daquele atleta some. A escrita passa pela mesma transação do ponto
  /// porque o chamado também vira evento na timeline — é o que sobra de auditoria depois que o
  /// atendimento termina e o campo sai do doc.
  Future<void> _startMedicalTimeout(LiveTableMedicalOption option) async {
    setState(() {
      _medicalPickerOpen = false;
      _saving = true;
    });
    try {
      final written = await ref
          .read(tournamentMatchesRepositoryProvider)
          .recordPointTransaction(
            matchId: widget.matchId,
            build: (fresh) => buildMedicalTimeoutStartWrite(
              fresh,
              side: option.side,
              playerSlot: option.slot,
              playerName: option.playerName,
            ),
          );
      if (written == null && mounted) {
        showAppSnackBar(
          context,
          'Não foi possível abrir o tempo médico — o atleta já usou o dele nesta partida.',
          isError: true,
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

  Future<void> _endMedicalTimeout() async {
    setState(() => _saving = true);
    try {
      await ref
          .read(tournamentMatchesRepositoryProvider)
          .recordPointTransaction(
            matchId: widget.matchId,
            build: buildMedicalTimeoutEndWrite,
          );
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, friendlyMatchScoreError(e), isError: true);
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  /// Ponto que o "desfazer" tira. Partida de games usa o replay da timeline
  /// (o `prev` do evento repõe o estado; dois desfazer seguidos não podem
  /// mirar o mesmo ponto). Pontos segue com o último `point` cru, como sempre.
  TournamentMatchPointEvent? _lastUndoablePoint(
    TournamentMatch match,
    List<TournamentMatchPointEvent> events,
  ) {
    if (gamesProfileOf(match) != null) return lastUndoablePoint(events);
    for (final event in events.reversed) {
      if (event.isPoint) return event;
    }
    return null;
  }

  Future<void> _undoIfSide(String side) async {
    final eventsAsync = ref.read(
      organizerMatchPointEventsProvider(widget.matchId),
    );
    final events = (eventsAsync.valueOrNull ?? const [])
        .whereType<TournamentMatchPointEvent>()
        .toList();
    final match = _currentMatch();
    final lastPoint = match == null ? null : _lastUndoablePoint(match, events);
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

  /// Nome do atleta que está sacando — vem da POSIÇÃO gravada no doc (1 ou 2) resolvida na
  /// dupla que está com o saque. Vazio enquanto a dupla não declarou a ordem dela no set.
  String _servingPlayerName(
    TournamentMatch match,
    LiveTableTeamData teamA,
    LiveTableTeamData teamB,
  ) {
    final side = MatchServingPlayerLogic.sideOfTeam(
      teamId: match.servingTeamId,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
    );
    if (side == null) return '';
    final team = side == 'A' ? teamA : teamB;
    return team.nameForSlot(match.servingPlayerSlot);
  }

  /// A dupla que está com o saque — quem a faixa "Quem saca por…?" pergunta.
  LiveTableTeamData? _servingTeamData(
    TournamentMatch match,
    LiveTableTeamData teamA,
    LiveTableTeamData teamB,
  ) {
    final side = MatchServingPlayerLogic.sideOfTeam(
      teamId: match.servingTeamId,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
    );
    if (side == null) return null;
    return side == 'A' ? teamA : teamB;
  }

  /// Os atletas da partida (o elenco de cada lado), com a cota de atendimento de cada um.
  List<LiveTableMedicalOption> _medicalOptions(
    TournamentMatch match,
    LiveTableTeamData teamA,
    LiveTableTeamData teamB,
  ) {
    final options = <LiveTableMedicalOption>[];
    for (final entry in [('A', teamA), ('B', teamB)]) {
      for (final slot in entry.$2.slots) {
        options.add(
          LiveTableMedicalOption(
            side: entry.$1,
            slot: slot,
            playerName: entry.$2.nameForSlot(slot),
            teamLabel: entry.$2.label,
            used: MatchMedicalTimeoutLogic.hasUsed(
              match.medicalTimeoutPlayers,
              entry.$1,
              slot,
            ),
          ),
        );
      }
    }
    return options;
  }

  /// Instantâneo do atendimento em andamento. A contagem é DERIVADA do carimbo do servidor —
  /// o `_clockTimer` só repinta a tela, não guarda relógio nenhum.
  LiveTableMedicalTimeoutView? _medicalView(
    TournamentMatch match,
    LiveTableTeamData teamA,
    LiveTableTeamData teamB,
  ) {
    final timeout = match.medicalTimeout;
    if (timeout == null) return null;
    final team = timeout.side == 'A' ? teamA : teamB;
    final name = timeout.playerName.isNotEmpty
        ? timeout.playerName
        : team.nameForSlot(timeout.playerSlot);
    final remaining = MatchMedicalTimeoutLogic.remainingSeconds(
      timeout,
      DateTime.now(),
    );
    return LiveTableMedicalTimeoutView(
      playerName: name,
      teamLabel: team.label,
      remainingSeconds: remaining,
      totalSeconds: timeout.durationSec,
      ended: remaining <= 0,
    );
  }

  /// O que cobre a mesa por causa do tempo médico: o seletor de quem vai ser atendido ou o
  /// atendimento em andamento. Nulo quando não há nem um nem outro.
  ///
  /// Fica FORA do `matchAsync.when` de propósito: vale nos dois modos da mesa (normal e full),
  /// e o modo full desenha a própria árvore.
  Widget? _medicalOverlay(
    TournamentMatch? match,
    TournamentMatchCardViewModel? enrichedCard,
  ) {
    if (match == null) return null;
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

    final medical = _medicalView(match, teamA, teamB);
    if (medical != null) {
      return LiveTableMedicalTimeoutOverlay(
        timeout: medical,
        onEnd: _saving ? null : _endMedicalTimeout,
      );
    }
    if (!_medicalPickerOpen) return null;
    return LiveTableMedicalTimeoutPicker(
      options: _medicalOptions(match, teamA, teamB),
      onPick: _startMedicalTimeout,
      onCancel: _cancelMedicalPicker,
    );
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
    final matchAsync = ref.watch(
      organizerMatchByIdProvider((
        tournamentId: widget.tournamentId,
        matchId: widget.matchId,
      )),
    );
    // Mantém o stream vivo: desfazer lê os eventos com `ref.read`, que sozinho deixaria o
    // provider autodispose descartar o histórico.
    ref.watch(organizerMatchPointEventsProvider(widget.matchId));
    final enrichedCard = ref
        .watch(organizerMatchCardsByIdProvider(widget.tournamentId))
        .valueOrNull?[widget.matchId];
    final tournamentCategories = ref
            .watch(organizerTournamentDetailProvider(widget.tournamentId))
            .valueOrNull
            ?.categories ??
        const [];

    final medicalOverlay = _medicalOverlay(
      matchAsync.valueOrNull,
      enrichedCard,
    );

    // O Modo Sol troca só o tema da mesa; o `Builder` faz o `context` de baixo já enxergá-lo.
    return MesaSunScope(
      child: Builder(
        builder: (context) => Scaffold(
          backgroundColor: context.themeColors.canvas,
          body: Stack(
            children: [
              SafeArea(
                child: matchAsync.when(
                  loading: () =>
                      const Center(child: CircularProgressIndicator()),
                  error: (e, _) => Center(child: Text('$e')),
                  data: (match) {
                    if (match == null) {
                      return const Center(
                          child: Text('Partida não encontrada'));
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
                    final gamesView = liveTableGamesView(match);
                    final setPoint = gamesView != null
                        ? gamesView.hint
                        : MatchScoringLogic.setPointHint(
                            current.a,
                            current.b,
                            setIndex: setIdx,
                            bestOf: match.bestOf,
                          );
                    final labelA = gamesView?.labelA;
                    final labelB = gamesView?.labelB;
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
                    final medical = _medicalView(match, teamA, teamB);
                    final servingPlayerName = _servingPlayerName(
                      match,
                      teamA,
                      teamB,
                    );
                    final servingTeam = _servingTeamData(match, teamA, teamB);
                    // Atendimento em andamento PARA a partida: nada de ponto, desfazer ou troca de
                    // saque enquanto o overlay está no ar — nas três mesas, porque a guarda sai do
                    // doc, não da tela.
                    final actionsEnabled =
                        !_saving && !match.isCompleted && medical == null;

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
                        scoreLabelA: _sidesSwapped ? labelB : labelA,
                        scoreLabelB: _sidesSwapped ? labelA : labelB,
                        isServingA: liveTableIsServing(
                          match,
                          sideA: !_sidesSwapped,
                        ),
                        isServingB:
                            liveTableIsServing(match, sideA: _sidesSwapped),
                        setsWonA: _sidesSwapped ? setsWonB : setsWonA,
                        setsWonB: _sidesSwapped ? setsWonA : setsWonB,
                        enabled: actionsEnabled,
                        onUndo: _undoLastPoint,
                        onExit: _exitPresentMode,
                      );
                    }

                    if (_fullMode) {
                      final fullModeEnabled = actionsEnabled &&
                          _timeoutSide == null &&
                          !_timeoutPickerOpen &&
                          !_medicalPickerOpen;
                      final needsServe = MatchScoringLogic.needsStartingServe(
                        servingTeamId: match.servingTeamId,
                        status: match.status,
                        teamAId: match.teamAId,
                        teamBId: match.teamBId,
                      );
                      final serveLocked =
                          MatchServingPlayerLogic.isServeOrderLocked(match);
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
                        scoreLabelA: _sidesSwapped ? labelB : labelA,
                        scoreLabelB: _sidesSwapped ? labelA : labelB,
                        isServingA: liveTableIsServing(
                          match,
                          sideA: !_sidesSwapped,
                        ),
                        isServingB:
                            liveTableIsServing(match, sideA: _sidesSwapped),
                        timeoutsA: _timeouts[_sidesSwapped ? 'B' : 'A'] ?? 0,
                        timeoutsB: _timeouts[_sidesSwapped ? 'A' : 'B'] ?? 0,
                        enabled: fullModeEnabled,
                        onTapA: () => handleTap(_sidesSwapped ? 'B' : 'A'),
                        onTapB: () => handleTap(_sidesSwapped ? 'A' : 'B'),
                        onRemoveTimeoutA: () =>
                            _removeTimeout(_sidesSwapped ? 'B' : 'A'),
                        onRemoveTimeoutB: () =>
                            _removeTimeout(_sidesSwapped ? 'A' : 'B'),
                        servingPlayerName: servingPlayerName,
                        // Individual não tem parceiro pra trocar (igual ao modo normal).
                        onSwapServingPlayer:
                            (servingTeam?.rosterSize ?? 2) == 1 || serveLocked
                                ? null
                                : _swapServingPlayer,
                        onSwapServe: serveLocked ? null : _swapServe,
                        onSwapSides: _swapSides,
                        onAddTimeout: _openTimeoutTeamPicker,
                        onUndo: _undoLastPoint,
                        activeTimeout: _timeoutSide == null
                            ? null
                            : LiveTableActiveTimeout(
                                teamLabel: _timeoutSide == 'A'
                                    ? teamA.label
                                    : teamB.label,
                                timeoutNumber: _timeoutNumber,
                                remainingSeconds: _timeoutRemainingSeconds,
                                totalSeconds: _timeoutDurationSeconds,
                                phase: _timeoutPhase,
                              ),
                        onPauseTimeout: _pauseTechnicalTimeout,
                        onResumeTimeout: _resumeTechnicalTimeout,
                        onEndTimeout: _endTechnicalTimeout,
                        timeoutPickerOpen: _timeoutPickerOpen,
                        onPickTimeoutTeamA: () =>
                            _chooseTimeoutTeam(_sidesSwapped ? 'B' : 'A'),
                        onPickTimeoutTeamB: () =>
                            _chooseTimeoutTeam(_sidesSwapped ? 'A' : 'B'),
                        onCancelTimeoutPicker: _cancelTimeoutTeamPicker,
                        onMore: () => _showFullModeMoreMenu(
                          match: match,
                          teamA: teamA,
                          teamB: teamB,
                        ),
                      );
                    }

                    final needsServe = MatchScoringLogic.needsStartingServe(
                      servingTeamId: match.servingTeamId,
                      status: match.status,
                      teamAId: match.teamAId,
                      teamBId: match.teamBId,
                    );
                    final profile = matchScoringProfile(match);
                    final switchInterval = ScoringRules.courtSwitchInterval(
                      profile,
                      setIdx,
                    );
                    final switchTotal = current.a + current.b;
                    final courtSwitch = _courtSwitchOf(match, setIdx);
                    final due = courtSwitch?.due ?? false;
                    if (!due) _switchAckTotal = null;
                    final switchPending = due &&
                        !(_switchAckSet == setIdx &&
                            _switchAckTotal == switchTotal);
                    // Lados = floor(total / intervalo) % 2, sem contar a troca que ainda não foi
                    // confirmada. Derivado do placar: desfazer o ponto desfaz a troca sozinho.
                    final autoFlips = switchInterval == null
                        ? 0
                        : switchTotal ~/ switchInterval -
                            (switchPending ? 1 : 0);
                    final swapped = _sidesSwapped != autoFlips.isOdd;
                    final topSideA = !swapped;

                    // Sem trocar o sacador depois do 1º ponto; declarar quem ainda não foi
                    // declarado (slot 0) segue livre — é o que a faixa "Quem saca por…?" faz.
                    final servingPlayerEnabled = (servingTeam?.rosterSize ??
                                2) !=
                            1 &&
                        (!MatchServingPlayerLogic.isServeOrderLocked(match) ||
                            match.servingPlayerSlot == 0);
                    LiveTableMesaTeam mesaTeam(bool sideA) {
                      final side = sideA ? 'A' : 'B';
                      final team = sideA ? teamA : teamB;
                      final isServing = liveTableIsServing(match, sideA: sideA);
                      return LiveTableMesaTeam(
                        label: team.label,
                        score: (sideA ? labelA : labelB) ??
                            '${liveTableCurrentSetScore(match, sideA: sideA)}',
                        isServing: isServing,
                        onTap: () => _point(side),
                        onMinus: () => _undoIfSide(side),
                        kit: KitColors.forSide(
                          side,
                          idA: match.kitColorA,
                          idB: match.kitColorB,
                        ),
                        servingPlayerName: isServing ? servingPlayerName : null,
                        servingPlayerPhotoUrl: isServing
                            ? servingTeam
                                ?.playerForSlot(match.servingPlayerSlot)
                                ?.profilePhotoUrl
                            : null,
                        onTapServingPlayer: isServing && servingPlayerEnabled
                            ? _swapServingPlayer
                            : null,
                      );
                    }

                    final topTeam = topSideA ? teamA : teamB;
                    final bottomTeam = topSideA ? teamB : teamA;
                    final leaderLabel = current.a == current.b
                        ? null
                        : (current.a > current.b ? teamA.label : teamB.label);
                    final leaderKit = current.a == current.b
                        ? null
                        : KitColors.forSide(
                            current.a > current.b ? 'A' : 'B',
                            idA: match.kitColorA,
                            idB: match.kitColorB,
                          );
                    final atSetPoint = gamesView == null &&
                        setPoint == 'set point em 1' &&
                        !match.isCompleted;

                    return LiveTableMesaScreen(
                      courtLabel: court,
                      titleLabel: title.isNotEmpty ? title : 'Partida',
                      elapsedLabel: _elapsedLabel(match),
                      setLabel: match.bestOf > 1 ? 'SET ${setIdx + 1}' : null,
                      top: mesaTeam(topSideA),
                      bottom: mesaTeam(!topSideA),
                      net: LiveTableMesaNet(
                        finished: match.isCompleted,
                        finishTeam: leaderLabel,
                        finishKit: leaderKit,
                        setPointTeam: atSetPoint ? leaderLabel : null,
                        setPointKit: atSetPoint ? leaderKit : null,
                        interval: match.isCompleted ? null : switchInterval,
                        total: switchTotal,
                      ),
                      enabled: actionsEnabled &&
                          !needsServe &&
                          _timeoutSide == null &&
                          !_timeoutPickerOpen &&
                          !_medicalPickerOpen,
                      onBack: () => context.pop(),
                      onUndo: _undoLastPoint,
                      onTimeout: _openTimeoutTeamPicker,
                      onMore: () => _showFullModeMoreMenu(
                        match: match,
                        teamA: teamA,
                        teamB: teamB,
                        canSwapServingPlayer: servingPlayerEnabled &&
                            match.servingPlayerSlot != 0,
                      ),
                      onValidate: match.isCompleted
                          ? () => context.push(
                                organizerMatchValidatePath(
                                  widget.tournamentId,
                                  widget.matchId,
                                ),
                              )
                          : null,
                      switchPending: switchPending
                          ? LiveTableMesaSwitchPending(
                              total: switchTotal,
                              number: switchInterval == null
                                  ? 1
                                  : switchTotal ~/ switchInterval,
                              topLabel: topTeam.label,
                              bottomLabel: bottomTeam.label,
                              topKit: KitColors.forSide(
                                topSideA ? 'A' : 'B',
                                idA: match.kitColorA,
                                idB: match.kitColorB,
                              ),
                              bottomKit: KitColors.forSide(
                                topSideA ? 'B' : 'A',
                                idA: match.kitColorA,
                                idB: match.kitColorB,
                              ),
                              onConfirm: () =>
                                  _confirmSideSwitch(setIdx, switchTotal),
                              onUndo: _undoLastPoint,
                            )
                          : null,
                      overlays: [
                        if (needsServe)
                          LiveTableStartServeScreen(
                            // Recria a tela a cada set: o pré-preenchimento só vale na abertura.
                            key: ValueKey('start-serve-$setIdx'),
                            teamA: teamA,
                            teamB: teamB,
                            courtLabel: court,
                            enabled: !_saving,
                            initial: _startPrefill(setIdx, match.bestOf),
                            initialKitA: KitColors.byId(match.kitColorA),
                            initialKitB: KitColors.byId(match.kitColorB),
                            onBack: () => context.pop(),
                            onConfirm: (config) => _startSet(config, setIdx),
                          ),
                        if (_timeoutPickerOpen)
                          LiveTableTimeoutTeamPicker(
                            teamA: topTeam,
                            teamB: bottomTeam,
                            isServingA:
                                liveTableIsServing(match, sideA: topSideA),
                            isServingB:
                                liveTableIsServing(match, sideA: !topSideA),
                            timeoutsA: _timeouts[topSideA ? 'A' : 'B'] ?? 0,
                            timeoutsB: _timeouts[topSideA ? 'B' : 'A'] ?? 0,
                            onPickA: () =>
                                _chooseTimeoutTeam(topSideA ? 'A' : 'B'),
                            onPickB: () =>
                                _chooseTimeoutTeam(topSideA ? 'B' : 'A'),
                            onCancel: _cancelTimeoutTeamPicker,
                          )
                        else if (_timeoutSide != null)
                          LiveTableTechnicalTimeoutOverlay(
                            timeout: LiveTableActiveTimeout(
                              teamLabel: _timeoutSide == 'A'
                                  ? teamA.label
                                  : teamB.label,
                              timeoutNumber: _timeoutNumber,
                              remainingSeconds: _timeoutRemainingSeconds,
                              totalSeconds: _timeoutDurationSeconds,
                              phase: _timeoutPhase,
                            ),
                            onPause: _pauseTechnicalTimeout,
                            onResume: _resumeTechnicalTimeout,
                            onEnd: _endTechnicalTimeout,
                          ),
                      ],
                    );
                  },
                ),
              ),
              // Acima dos dois modos da mesa (normal e full): o atendimento médico para a
              // partida inteira, então o overlay cobre a tela toda e come o toque — em vez de
              // cada modo desabilitar os próprios botões.
              if (medicalOverlay != null)
                Positioned.fill(child: medicalOverlay),
              if (_saving)
                const Positioned.fill(
                  child: ColoredBox(
                    color: Color(0x44000000),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
