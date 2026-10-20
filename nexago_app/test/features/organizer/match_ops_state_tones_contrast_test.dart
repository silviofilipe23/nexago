import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/features/organizer/data/organizer_match_ops_repository.dart';
import 'package:nexago_app/features/organizer/domain/category_ops/category_ops_models.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/match_ops_providers.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/schedule_grid_logic.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/schedule_pick_logic.dart';
import 'package:nexago_app/features/organizer/domain/tournament_ops/tournament_ops_providers.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/mesa_sun/mesa_sun.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/organizer_court_panel_page.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/organizer_koc_table_page.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/organizer_match_call_queue_page.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/organizer_match_center_page.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/organizer_match_check_in_page.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/organizer_match_quick_score_page.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/organizer_match_summary_page.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/widgets/organizer_court_schedule_grid_widgets.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/widgets/organizer_match_card.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/widgets/organizer_match_live_table_mesa.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/widgets/organizer_match_live_table_start_serve.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/widgets/organizer_match_live_table_widgets.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/widgets/organizer_match_validate_widgets.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/widgets/organizer_schedule_pick_widgets.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/widgets/organizer_schedule_time_widgets.dart';
import 'package:nexago_app/features/tournaments/domain/koc/koc_round_providers.dart';
import 'package:nexago_app/features/tournaments/domain/koc/koc_round_state.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_card_view_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

import '../../core/theme/state_tone_screens.dart';

// Texto, ícone e ponto de status em verde, vermelho e âmbar na operação de
// partidas do organizador (mesa ao vivo, Modo Sol, quem saca, check-in, fila
// de chamada, central, painel de quadras, KOC, placar rápido, súmula,
// validação, agendamento e grade), conferidos contra o fundo real nos dois
// temas do app. No claro os crus do AppColors reprovam: são ~1,6–3,5:1 no
// branco.
//
// Fica fora da lista (e no cru, de propósito) o que mora sobre fundo escuro
// FIXO: os véus pretos dos tempos técnico e médico e as pílulas `_nxInk` do
// cabeçalho da mesa em paisagem — ver o grupo "superfícies escuras fixas".

const _tid = 't1';
const _mid = 'm1';

TournamentMatch _match({
  String id = _mid,
  String status = TournamentMatchStatus.scheduled,
  List<TournamentMatchSet> sets = const [],
  String courtId = '',
  DateTime? scheduleTime,
  String queueStatus = '',
  String checkInA = '',
  String checkInB = '',
  int liveElapsedSec = 0,
  String reportStatus = '',
  int matchNumber = 1,
  String teamA = 'Marcos / Victor',
  String teamB = 'Igor / João',
  String resultA = '',
  String resultB = '',
}) {
  return TournamentMatch(
    id: id,
    tournamentId: _tid,
    categoryId: 'masc-open',
    round: 1,
    matchType: 'wb',
    poolId: '',
    teamAId: 'team-a-$id',
    teamBId: 'team-b-$id',
    status: status,
    resultA: resultA,
    resultB: resultB,
    isGroupMatch: false,
    matchNumber: matchNumber,
    teamADescription: teamA,
    teamBDescription: teamB,
    courtId: courtId,
    scheduleTime: scheduleTime,
    queueStatus: queueStatus,
    checkInTeamAStatus: checkInA,
    checkInTeamBStatus: checkInB,
    liveElapsedSec: liveElapsedSec,
    reportStatus: reportStatus,
    sets: sets,
  );
}

LiveTableTeamData _team(String label, String p1, String p2) =>
    LiveTableTeamData(
      label: label,
      player1: OrganizerCategoryPlayerInfo(uid: 'u-$p1', name: p1),
      player2: OrganizerCategoryPlayerInfo(uid: 'u-$p2', name: p2),
    );

final _teamA = _team('Marcos / Victor', 'Marcos', 'Victor');
final _teamB = _team('Igor / João', 'Igor', 'João');

class _SunOn extends MesaSunModeNotifier {
  @override
  bool build() => true;
}

/// Só precisa não tocar no Firestore quando a tela chama
/// `bootstrapOrganizerTournamentCourts` no `initState`.
class _FakeMatchOpsRepository implements OrganizerMatchOpsRepository {
  @override
  Future<void> ensureCourtsInitialized({required String tournamentId}) async {}

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('${invocation.memberName}');
}

/// Providers das telas de partida, com dados fixos.
List<Override> _pageOverrides({
  TournamentMatch? match,
  OrganizerMatchOpsState state = const OrganizerMatchOpsState(),
  List<TournamentMatch> matches = const [],
  List<MatchAuditLogEntry> audit = const [],
}) {
  return [
    organizerMatchOpsRepositoryProvider
        .overrideWithValue(_FakeMatchOpsRepository()),
    if (match != null)
      organizerMatchByIdProvider((tournamentId: _tid, matchId: match.id))
          .overrideWith((ref) => Stream.value(match)),
    if (match != null)
      organizerMatchAuditLogProvider(match.id)
          .overrideWith((ref) => Stream.value(audit)),
    organizerMatchCardsByIdProvider(_tid).overrideWith(
      (ref) => Stream.value(<String, TournamentMatchCardViewModel>{}),
    ),
    organizerMatchOpsConfigProvider(_tid).overrideWith(
      (ref) => Stream.value(const TournamentMatchOpsConfig()),
    ),
    organizerTournamentDetailProvider(_tid).overrideWith(
      (ref) => Stream.value(
        const OrganizerTournamentDetailState(isLoading: false),
      ),
    ),
    organizerTournamentMatchesProvider(_tid)
        .overrideWith((ref) => Stream.value(matches)),
    organizerMatchOpsStateProvider(_tid).overrideWith((ref) => state),
  ];
}

// ── Mesa ao vivo (bloco de saque) ───────────────────────────────────────

const _portrait = Size(390, 780);
const _landscape = Size(844, 390);

LiveTableMesaScreen _mesa({
  LiveTableMesaNet net = const LiveTableMesaNet(interval: 7, total: 3),
  LiveTableMesaSwitchPending? switchPending,
}) {
  return LiveTableMesaScreen(
    courtLabel: 'Q1',
    titleLabel: 'Masc Open · Fase de Grupos',
    elapsedLabel: '06:39',
    setLabel: 'SET 1',
    top: LiveTableMesaTeam(
      label: 'Vinícius / Thiago',
      score: '20',
      isServing: true,
      onTap: () {},
      onMinus: () {},
      servingPlayerName: 'Vinícius',
      onTapServingPlayer: () {},
    ),
    bottom: LiveTableMesaTeam(
      label: 'Daniel / Gabriel',
      score: '6',
      isServing: false,
      onTap: () {},
      onMinus: () {},
    ),
    net: net,
    enabled: true,
    onBack: () {},
    onMore: () {},
    onUndo: () {},
    onTimeout: () {},
    switchPending: switchPending,
  );
}

final _switchPending = LiveTableMesaSwitchPending(
  total: 14,
  number: 2,
  topLabel: 'Vinícius / Thiago',
  bottomLabel: 'Daniel / Gabriel',
  onConfirm: () {},
  onUndo: () {},
);

const _netSwitchNext = LiveTableMesaNet(interval: 7, total: 6);
const _netFinished = LiveTableMesaNet(
  finished: true,
  finishTeam: 'Vinícius / Thiago',
);

/// Mesa como a página monta: dentro do `MesaSunScope`, com o Modo Sol ligado
/// ou não.
Future<void> _pumpMesa(
  WidgetTester tester,
  ThemeData theme,
  Widget mesa, {
  bool sun = false,
  Size size = _portrait,
}) {
  return pumpTonePage(
    tester,
    theme,
    MesaSunScope(child: Scaffold(body: mesa)),
    overrides: [if (sun) mesaSunModeProvider.overrideWith(_SunOn.new)],
    size: size,
  );
}

Widget _startServe() => LiveTableStartServeScreen(
      teamA: _teamA,
      teamB: _teamB,
      courtLabel: 'Q1',
      onBack: () {},
      onConfirm: (_) {},
    );

final _mesaRoot = find.byType(LiveTableMesaScreen);
final _startServeRoot = find.byType(LiveTableStartServeScreen);

// ── Placar completo (folha da mesa) ─────────────────────────────────────

Widget _quickScoreSheet(List<TournamentMatchSet> sets) => SizedBox(
      height: 1100,
      child: LiveTableQuickScoreSheet(
        scrollController: ScrollController(),
        match: _match(status: TournamentMatchStatus.inProgress, sets: sets),
        teamA: _teamA,
        teamB: _teamB,
        onSubmit: (_, __) async {},
        onWalkover: (_) async {},
      ),
    );

const _setsAWins = [
  TournamentMatchSet(a: 21, b: 15),
  TournamentMatchSet(a: 21, b: 18),
];

// ── Check-in, fila e central ────────────────────────────────────────────

OrganizerMatchRow _row(TournamentMatch match) =>
    OrganizerMatchRow(match: match);

final _upcomingRows = [
  _row(_match(
    id: 'm2',
    matchNumber: 2,
    queueStatus: 'waiting',
    checkInA: 'wo',
    teamA: 'André / Gabriel',
    teamB: 'Felipe / Mateus',
  )),
  _row(_match(
    id: 'm3',
    matchNumber: 3,
    queueStatus: 'waiting',
    checkInA: 'present',
    checkInB: 'present',
    teamA: 'Pedro / Lucas',
    teamB: 'Bruno / Caio',
  )),
  _row(_match(
    id: 'm4',
    matchNumber: 4,
    queueStatus: 'on_deck',
    checkInA: 'present',
    teamA: 'Rafa / Leo',
    teamB: 'Duda / Nina',
  )),
];

final _liveMatch = _match(
  status: TournamentMatchStatus.inProgress,
  courtId: 'Q1',
  scheduleTime: DateTime(2026, 6, 16, 9),
  liveElapsedSec: 1450,
  sets: const [TournamentMatchSet(a: 12, b: 9)],
);

final _finishedMatch = _match(
  id: 'm5',
  status: TournamentMatchStatus.completed,
  courtId: 'Q1',
  scheduleTime: DateTime(2026, 6, 16, 8, 10),
  resultA: '2',
  resultB: '0',
  sets: _setsAWins,
);

final _scheduledMatch = _match(
  id: 'm6',
  courtId: 'Q1',
  scheduleTime: DateTime(2026, 6, 16, 9, 50),
  queueStatus: 'on_deck',
);

// ── KOC ─────────────────────────────────────────────────────────────────

const _kocRound = KocRoundState(
  teamIds: ['k1', 'k2', 'k3', 'k4'],
  kingTeamId: 'k1',
  challengerTeamId: 'k2',
  queue: ['k3', 'k4'],
  points: {'k1': 5, 'k2': 3, 'k3': 3, 'k4': 1},
  crowns: {},
  rallies: 12,
  servingTeamId: 'k2',
  // Pausado: o relógio fica parado em 5:00, sem depender da hora do teste.
  clock: KocClock(
    endsAtMs: 1300000,
    durationSec: 900,
    pausedAtMs: 1000000,
  ),
  standings: [],
  qualifiersPerRound: 2,
  configuredDurationSec: 900,
);

const _kocNames = {
  'k1': 'Ana / Bia',
  'k2': 'Cris / Dani',
  'k3': 'Eva / Fê',
  'k4': 'Gi / Hel',
};

// ── Grade ───────────────────────────────────────────────────────────────

const _gridDay = '2026-06-16';

Widget _gridBody() {
  final slots = ScheduleGridLogic.gridTimeSlotsForDay(dayKey: _gridDay);
  final live = _match(
    status: TournamentMatchStatus.inProgress,
    courtId: 'Q1',
    scheduleTime: slots[4],
    liveElapsedSec: 600,
  );
  return SizedBox(
    height: 900,
    child: ScheduleGridBody(
      courts: const [TournamentCourt(id: 'Q1', name: 'Quadra 1', order: 0)],
      slots: slots,
      gridStart: slots.first,
      matchesByCourt: {
        'Q1': [live],
      },
      categoryLabelsByMatchId: const {},
      categoryAccentByCategoryId: const {},
      categoryMatchesByCategoryId: const {},
      enrichedByMatchId: const {},
      defaultDurationMin: 30,
      selectedDayKey: _gridDay,
      onMatchTap: (_) {},
      onDropMatch: (_, __, ___) async {},
    ),
  );
}

/// [pumpTonePiece] numa tela de tablet: a fonte de teste é mais larga que a
/// do app e estoura, a 402 px, linhas que no aparelho cabem.
Future<void> _pumpWidePiece(
  WidgetTester tester,
  ThemeData theme,
  Widget child, {
  bool onSheet = false,
}) {
  return pumpTonePage(
    tester,
    theme,
    Builder(
      builder: (context) {
        final colors = context.themeColors;
        return Scaffold(
          backgroundColor: colors.canvas,
          body: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: KeyedSubtree(
              key: tonePieceKey,
              child: onSheet
                  ? Material(
                      color: colors.surfaceSheet,
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: child,
                      ),
                    )
                  : child,
            ),
          ),
        );
      },
    ),
    size: _wide,
  );
}

const _wide = Size(800, 1400);

Future<void> _tapAndSettleSheet(WidgetTester tester, String label) async {
  await tester.ensureVisible(find.text(label));
  await tester.pump();
  await tester.tap(find.text(label));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 800));
}

/// Telas e pedaços que pintam os tons de estado, com os dados que os
/// acendem.
final List<ToneScreen> organizerMatchOpsToneScreens = [
  // ── Mesa clássica (widgets) ──
  ToneScreen(
    'Cabeçalho da mesa ao vivo',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      LiveTableHeader(
        courtLabel: 'Q1',
        titleLabel: 'Masc Open · Quartas',
        elapsedLabel: '12:34',
        onBack: () {},
      ),
    ),
    tonePiece,
    const ['MESA AO VIVO', 'Q1', '12:34', 'marca', 'marca'],
  ),
  ToneScreen(
    'Faixa de sets da mesa',
    (tester, theme) => _pumpWidePiece(
      tester,
      theme,
      const LiveTableSetStrip(
        sets: [
          TournamentMatchSet(a: 21, b: 15),
          TournamentMatchSet(a: 12, b: 21),
          TournamentMatchSet(a: 5, b: 3),
        ],
        currentSetIndex: 2,
      ),
    ),
    tonePiece,
    const ['SET 3', '21', '21'],
  ),
  ToneScreen(
    'Barra de ações da mesa (tempo médico)',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      LiveTableActionBar(
        onUndo: () {},
        onSwapServe: () {},
        onMedicalTimeout: () {},
      ),
    ),
    tonePiece,
    const [Icons.medical_services_outlined],
  ),
  ToneScreen(
    'Seletor do tempo médico',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      SizedBox(
        height: 700,
        child: LiveTableMedicalTimeoutPicker(
          options: const [
            LiveTableMedicalOption(
              side: 'A',
              slot: 1,
              playerName: 'Marcos',
              teamLabel: 'Marcos / Victor',
              used: false,
            ),
            LiveTableMedicalOption(
              side: 'B',
              slot: 1,
              playerName: 'Igor',
              teamLabel: 'Igor / João',
              used: true,
            ),
          ],
          onPick: (_) {},
        ),
      ),
    ),
    tonePiece,
    const ['disponível'],
  ),
  ToneScreen(
    'Placar completo (folha): sets vencidos',
    (tester, theme) => _pumpWidePiece(
      tester,
      theme,
      _quickScoreSheet(_setsAWins),
      onSheet: true,
    ),
    tonePiece,
    const ['2'],
  ),
  ToneScreen(
    'Placar completo (folha): erro no set',
    (tester, theme) async {
      await _pumpWidePiece(
        tester,
        theme,
        _quickScoreSheet(const [TournamentMatchSet(a: 21, b: 21)]),
        onSheet: true,
      );
      await tester.tap(find.text('Confirmar placar'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 800));
    },
    tonePiece,
    const ['Set 1: não pode terminar empatado.'],
  ),
  ToneScreen(
    'Placar completo (folha): W.O.',
    (tester, theme) async {
      await _pumpWidePiece(
        tester,
        theme,
        _quickScoreSheet(_setsAWins),
        onSheet: true,
      );
      await _tapAndSettleSheet(tester, 'Encerrar por W.O. ou abandono');
    },
    find.byType(BottomSheet),
    const ['Marcos / Victor — W.O.', 'Igor / João — W.O.'],
  ),

  // ── Mesa bloco de saque e "quem saca" ──
  ToneScreen(
    'Mesa (retrato): cabeçalho e contador de troca',
    (tester, theme) => _pumpMesa(tester, theme, _mesa()),
    _mesaRoot,
    const ['● AO VIVO · Q1 · SET 1 · ', 'marca', 'marca', 'marca'],
  ),
  ToneScreen(
    'Mesa (retrato): troca no próximo ponto',
    (tester, theme) => _pumpMesa(tester, theme, _mesa(net: _netSwitchNext)),
    _mesaRoot,
    const ['⇄ TROCA NO PRÓXIMO PONTO'],
  ),
  ToneScreen(
    'Mesa (retrato): fim do jogo',
    (tester, theme) => _pumpMesa(tester, theme, _mesa(net: _netFinished)),
    _mesaRoot,
    const ['FIM DO JOGO · VINÍCIUS / THIAGO'],
  ),
  ToneScreen(
    'Mesa: modal de troca de lado',
    (tester, theme) =>
        _pumpMesa(tester, theme, _mesa(switchPending: _switchPending)),
    _mesaRoot,
    const ['14 PONTOS · TROCA Nº 2', Icons.swap_horiz_rounded],
  ),
  ToneScreen(
    'Mesa (paisagem): troca na coluna da rede',
    (tester, theme) => _pumpMesa(
      tester,
      theme,
      _mesa(net: _netSwitchNext),
      size: _landscape,
    ),
    _mesaRoot,
    // A pílula do relógio é `_nxInk` fixo: o vermelho cru continua legível.
    const ['⇄ TROCA', '● Q1 · SET 1 · 06:39'],
  ),
  ToneScreen(
    'Mesa (paisagem): fim do jogo na pílula escura',
    (tester, theme) => _pumpMesa(
      tester,
      theme,
      _mesa(net: _netFinished),
      size: _landscape,
    ),
    _mesaRoot,
    const ['Fim do jogo · Vinícius / Thiago'],
  ),
  ToneScreen(
    'Mesa (Modo Sol, retrato): nada sai dos tokens do Sol',
    (tester, theme) =>
        _pumpMesa(tester, theme, _mesa(net: _netSwitchNext), sun: true),
    _mesaRoot,
    const [],
  ),
  ToneScreen(
    'Mesa (Modo Sol): modal de troca de lado',
    (tester, theme) => _pumpMesa(
      tester,
      theme,
      _mesa(switchPending: _switchPending),
      sun: true,
    ),
    _mesaRoot,
    const [],
  ),
  ToneScreen(
    'Mesa (Modo Sol, paisagem)',
    (tester, theme) => _pumpMesa(
      tester,
      theme,
      _mesa(net: _netSwitchNext),
      sun: true,
      size: _landscape,
    ),
    _mesaRoot,
    const [],
  ),
  ToneScreen(
    'Quem começa sacando: cabeçalho',
    (tester, theme) => _pumpMesa(tester, theme, _startServe()),
    _startServeRoot,
    const ['● ANTES DO SET · Q1'],
  ),
  ToneScreen(
    'Quem começa sacando (Modo Sol)',
    (tester, theme) => _pumpMesa(tester, theme, _startServe(), sun: true),
    _startServeRoot,
    const [],
  ),

  // ── Check-in ──
  ToneScreen(
    'Check-in: presente, W.O. e próximas chamadas',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const OrganizerMatchCheckInPage(tournamentId: _tid, matchId: _mid),
      overrides: _pageOverrides(
        match: _match(courtId: 'Q1', checkInA: 'present', checkInB: 'wo'),
        state: OrganizerMatchOpsState(callQueue: _upcomingRows),
      ),
    ),
    find.byType(OrganizerMatchCheckInPage),
    const [
      'Tolerância: 15 min',
      Icons.schedule_rounded,
      '1 / 2 prontas',
      'Presente · desfazer',
      Icons.check_rounded,
      'W.O.',
      Icons.close_rounded,
      'W.O.',
      Icons.close_rounded,
      'Pronto',
      Icons.check_rounded,
      '1/2',
      Icons.schedule_rounded,
    ],
  ),
  ToneScreen(
    'Check-in: tolerância esgotada',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const OrganizerMatchCheckInPage(tournamentId: _tid, matchId: _mid),
      overrides: _pageOverrides(
        match: _match(courtId: 'Q1', scheduleTime: DateTime(2020, 1, 1, 9)),
      ),
    ),
    find.byType(OrganizerMatchCheckInPage),
    const [
      'Prazo de tolerância esgotado',
      Icons.flag_rounded,
      Icons.close_rounded,
      Icons.close_rounded,
    ],
  ),

  // ── Fila de chamada ──
  ToneScreen(
    'Fila de chamada: check-in pendente',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const OrganizerMatchCallQueuePage(tournamentId: _tid),
      overrides: _pageOverrides(
        state: OrganizerMatchOpsState(
          callQueue: [_row(_scheduledMatch)],
        ),
      ),
    ),
    find.byType(OrganizerMatchCallQueuePage),
    const [
      '1 check-in',
      'AGENDADA',
      'Check-in pendente',
      Icons.schedule_rounded
    ],
  ),

  // ── Card de partida ──
  ToneScreen(
    'Card de partida: ao vivo',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      OrganizerMatchCard(row: _row(_liveMatch)),
      overrides: _pageOverrides(),
    ),
    tonePiece,
    const ['AO VIVO', '24:10', 'marca', 'marca'],
  ),
  ToneScreen(
    'Card de partida: encerrada',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      OrganizerMatchCard(row: _row(_finishedMatch)),
      overrides: _pageOverrides(),
    ),
    tonePiece,
    const ['ENCERRADA', '2'],
  ),
  ToneScreen(
    'Card de partida: agendada',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      OrganizerMatchCard(row: _row(_scheduledMatch)),
      overrides: _pageOverrides(),
    ),
    tonePiece,
    const ['AGENDADA'],
  ),

  // ── Central de partidas ──
  ToneScreen(
    'Central de partidas: ao vivo',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const OrganizerMatchCenterPage(tournamentId: _tid),
      overrides: _pageOverrides(
        matches: [_liveMatch],
        state: OrganizerMatchOpsState(
          sections: OrganizerMatchCenterSections(live: [_row(_liveMatch)]),
        ),
      ),
    ),
    find.byType(OrganizerMatchCenterPage),
    // Cabeçalho, filtros "Ao vivo" e "Em quadra", seção e o card (selo e
    // cronômetro).
    const ['marca', 'marca', 'marca', 'marca', 'marca', 'marca', 'AO VIVO'],
  ),

  // ── Painel de quadras ──
  ToneScreen(
    'Painel de quadras: quadra livre',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const OrganizerCourtPanelPage(tournamentId: _tid),
      overrides: _pageOverrides(
        state: const OrganizerMatchOpsState(
          courtSummaries: [
            CourtSummary(
              court: TournamentCourt(id: 'Q1', name: 'Quadra 1', order: 0),
            ),
          ],
        ),
      ),
    ),
    find.byType(OrganizerCourtPanelPage),
    const ['LIVRE'],
  ),

  // ── KOC ──
  ToneScreen(
    'Mesa KOC: empate na vaga',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const OrganizerKocTablePage(
        tournamentId: _tid,
        categoryId: 'masc-open',
        matchId: _mid,
      ),
      overrides: [
        kocRoundProvider(_mid).overrideWith((ref) => Stream.value(_kocRound)),
        kocRosterNamesProvider(_mid).overrideWith((ref) async => _kocNames),
        organizerCategoryRegistrationsProvider(
          const OrganizerCategoryKey(
            tournamentId: _tid,
            categoryId: 'masc-open',
          ),
        ).overrideWith(
          (ref) => Stream.value(const <OrganizerCategoryTeamRow>[]),
        ),
      ],
    ),
    find.byType(OrganizerKocTablePage),
    const [
      'Empate na vaga de classificação — bola de ouro entre as empatadas.',
      'VENCEU A BOLA DE OURO',
      'empate',
      'empate',
    ],
  ),

  // ── Lançamento rápido (página) ──
  ToneScreen(
    'Lançamento rápido: sets e games vencidos',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const OrganizerMatchQuickScorePage(tournamentId: _tid, matchId: _mid),
      overrides: _pageOverrides(
        match: _match(
          status: TournamentMatchStatus.inProgress,
          sets: const [TournamentMatchSet(a: 21, b: 15)],
        ),
      ),
      size: _wide,
    ),
    find.byType(OrganizerMatchQuickScorePage),
    const ['1', '21'],
  ),
  ToneScreen(
    'Lançamento rápido: W.O.',
    (tester, theme) async {
      await pumpTonePage(
        tester,
        theme,
        const OrganizerMatchQuickScorePage(tournamentId: _tid, matchId: _mid),
        overrides: _pageOverrides(
          match: _match(status: TournamentMatchStatus.inProgress),
        ),
        size: _wide,
      );
      await _tapAndSettleSheet(tester, 'Encerrar por W.O. ou abandono');
    },
    find.byType(BottomSheet),
    const ['Marcos / Victor — W.O.', 'Igor / João — W.O.'],
  ),

  // ── Súmula ──
  ToneScreen(
    'Súmula: validada, sets e histórico',
    (tester, theme) => pumpTonePage(
      tester,
      theme,
      const OrganizerMatchSummaryPage(tournamentId: _tid, matchId: _mid),
      overrides: _pageOverrides(
        match: _match(
          status: TournamentMatchStatus.completed,
          courtId: 'Q1',
          reportStatus: 'validated',
          sets: _setsAWins,
        ),
        audit: [
          MatchAuditLogEntry(
            id: 'a1',
            type: 'result_validated',
            at: DateTime(2026, 6, 16, 10, 40),
            byUid: 'org',
          ),
          MatchAuditLogEntry(
            id: 'a2',
            type: 'set_corrected',
            at: DateTime(2026, 6, 16, 10, 30),
            byUid: 'org',
          ),
          MatchAuditLogEntry(
            id: 'a3',
            type: 'match_started',
            at: DateTime(2026, 6, 16, 9, 50),
            byUid: 'mesa',
          ),
        ],
      ),
      size: _wide,
    ),
    find.byType(OrganizerMatchSummaryPage),
    const [
      'VALIDADA',
      Icons.check_rounded,
      '2',
      '21',
      '21',
      Icons.check_rounded,
      Icons.edit_rounded,
      Icons.circle,
    ],
  ),

  // ── Validação ──
  ToneScreen(
    'Validação: placar',
    (tester, theme) => _pumpWidePiece(
      tester,
      theme,
      ValidateScoreCard(
        match: _match(status: TournamentMatchStatus.completed),
        categoryMeta: 'MASC OPEN · QUARTAS',
        teamA: _teamA,
        teamB: _teamB,
        setsWonA: 2,
        setsWonB: 0,
        sets: _setsAWins,
      ),
    ),
    tonePiece,
    const ['2', '21', '21'],
  ),
  ToneScreen(
    'Validação: confirmação das duplas',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const ValidateTeamConfirmationRow(
        teamALabel: 'Marcos / Victor',
        teamBLabel: 'Igor / João',
        teamAConfirmed: true,
        teamBConfirmed: false,
      ),
    ),
    tonePiece,
    const [Icons.check_circle_rounded, 'confirmou'],
  ),

  // ── Agendamento ──
  ToneScreen(
    'Agendar: abas',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      SchedulePickTabRow(
        activeTab: SchedulePickTab.unscheduled,
        counts: const SchedulePickTabCounts(
          unscheduled: 8,
          ready: 3,
          blocked: 5,
        ),
        onTabChanged: (_) {},
      ),
    ),
    tonePiece,
    const ['3'],
  ),
  ToneScreen(
    'Agendar: cabeçalho das prontas',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const SchedulePickSectionHeader(activeTab: SchedulePickTab.ready),
    ),
    tonePiece,
    const ['marca', 'toque para escolher'],
  ),
  ToneScreen(
    'Agendar: partida pronta',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      SchedulePickMatchCard(
        match: _match(),
        categoryLabel: 'MASC OPEN',
        teamA: _teamA,
        teamB: _teamB,
        suggestionLabel: null,
        selected: false,
        selectable: true,
        onTap: () {},
      ),
    ),
    tonePiece,
    const ['PRONTA'],
  ),
  ToneScreen(
    'Agendar: partida sem quadra',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      SchedulePickMatchCard(
        match: _match(scheduleTime: DateTime(2026, 6, 16, 9)),
        categoryLabel: 'MASC OPEN',
        teamA: _teamA,
        teamB: _teamB,
        suggestionLabel: null,
        selected: false,
        selectable: true,
        onTap: () {},
      ),
    ),
    tonePiece,
    const ['FALTA QUADRA'],
  ),
  ToneScreen(
    'Horário: aviso de conflito',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const ScheduleTimeConflictCard(
        title: 'Conflito de horário',
        message: 'Marcos joga em outra quadra neste horário.',
      ),
    ),
    tonePiece,
    const [Icons.notifications_none_rounded, 'Conflito de horário'],
  ),

  // ── Grade de quadras ──
  ToneScreen(
    'Grade: alertas no cabeçalho',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      ScheduleGridHeader(
        programLabel: 'PROGRAMAÇÃO · DIA 1',
        onBack: () {},
        alertCount: 2,
      ),
    ),
    tonePiece,
    const ['marca', '2'],
  ),
  ToneScreen(
    'Grade: linha do agora',
    (tester, theme) => pumpTonePiece(
      tester,
      theme,
      const ScheduleGridNowLine(timeLabel: '14:30'),
    ),
    tonePiece,
    const ['14:30', 'marca'],
  ),
  ToneScreen(
    'Grade: partida ao vivo',
    (tester, theme) => pumpTonePiece(tester, theme, _gridBody()),
    tonePiece,
    const ['marca'],
  ),
];

/// Cor do trecho de texto [text], onde quer que esteja (Text ou Text.rich).
Color? _spanColor(WidgetTester tester, String text) {
  Color? found;
  for (final rich in tester.widgetList<RichText>(find.byType(RichText))) {
    void visit(InlineSpan span, Color? inherited) {
      if (span is! TextSpan) return;
      final color = span.style?.color ?? inherited;
      if (span.text == text) found = color;
      for (final child in span.children ?? const <InlineSpan>[]) {
        visit(child, color);
      }
    }

    visit(rich.text, null);
  }
  return found;
}

void main() {
  stateToneScreensTests(organizerMatchOpsToneScreens);

  // O Modo Sol tem tokens próprios (spec "Placar · Modo Sol"): nos dois temas
  // do app a mesa com Sol ligado continua pintando exatamente eles.
  group('Modo Sol mantém os próprios tokens', () {
    for (final (label, theme) in [
      ('claro', AppTheme.light),
      ('escuro', AppTheme.dark),
    ]) {
      testWidgets('app $label: cabeçalho, rede e marcas', (tester) async {
        await _pumpMesa(tester, theme, _mesa(), sun: true);
        expect(_spanColor(tester, '● AO VIVO · Q1 · SET 1 · '), MesaSun.live);

        final marks = tester
            .widgetList<Container>(
              find.byWidgetPredicate(
                (w) =>
                    w is Container &&
                    w.constraints?.maxWidth == 18 &&
                    w.constraints?.maxHeight == 8,
              ),
            )
            .map((c) => (c.decoration! as BoxDecoration).color)
            .toSet();
        expect(marks, {MesaSun.ink, MesaSun.markEmpty});
      });

      testWidgets('app $label: troca no próximo ponto e fim do jogo', (
        tester,
      ) async {
        await _pumpMesa(tester, theme, _mesa(net: _netSwitchNext), sun: true);
        expect(_spanColor(tester, '⇄ TROCA NO PRÓXIMO PONTO'), MesaSun.ink);

        await _pumpMesa(tester, theme, _mesa(net: _netFinished), sun: true);
        expect(
          _spanColor(tester, 'FIM DO JOGO · VINÍCIUS / THIAGO'),
          MesaSun.ink,
        );
      });

      testWidgets('app $label: modal de troca de lado', (tester) async {
        await _pumpMesa(
          tester,
          theme,
          _mesa(switchPending: _switchPending),
          sun: true,
        );
        expect(_spanColor(tester, '14 PONTOS · TROCA Nº 2'), MesaSun.ink);
        expect(
          tester.widget<Icon>(find.byIcon(Icons.swap_horiz_rounded)).color,
          MesaSun.ink,
        );
      });

      testWidgets('app $label: paisagem', (tester) async {
        await _pumpMesa(
          tester,
          theme,
          _mesa(net: _netSwitchNext),
          sun: true,
          size: _landscape,
        );
        expect(_spanColor(tester, '⇄ TROCA'), MesaSun.ink);
        expect(_spanColor(tester, '● Q1 · SET 1 · 06:39'), MesaSun.live);
      });

      testWidgets('app $label: quem começa sacando', (tester) async {
        await _pumpMesa(tester, theme, _startServe(), sun: true);
        expect(_spanColor(tester, '● ANTES DO SET · Q1'), MesaSun.live);
      });

      // Sem token próprio do Sol, o widget segue o tema — e o tema do Sol é
      // o claro: o verde sai escurecido, legível no cartão quase branco.
      testWidgets('app $label: seletor do tempo médico herda o tom claro', (
        tester,
      ) async {
        await _pumpMesa(
          tester,
          theme,
          SizedBox(
            height: 700,
            child: LiveTableMedicalTimeoutPicker(
              options: const [
                LiveTableMedicalOption(
                  side: 'A',
                  slot: 1,
                  playerName: 'Marcos',
                  teamLabel: 'Marcos / Victor',
                  used: false,
                ),
              ],
              onPick: (_) {},
            ),
          ),
          sun: true,
        );
        expect(_spanColor(tester, 'disponível'), AppColors.winLight);
      });
    }
  });

  // Fundo escuro FIXO, que não segue o tema do app: o tom do tema escureceria
  // o texto sobre ele no claro. Fica o cru.
  group('superfícies escuras fixas ficam no cru', () {
    for (final (label, theme) in [
      ('claro', AppTheme.light),
      ('escuro', AppTheme.dark),
    ]) {
      testWidgets('app $label: véu do tempo técnico', (tester) async {
        await pumpTonePiece(
          tester,
          theme,
          const SizedBox(
            height: 700,
            child: LiveTableTechnicalTimeoutOverlay(
              timeout: LiveTableActiveTimeout(
                teamLabel: 'Marcos / Victor',
                timeoutNumber: 1,
                remainingSeconds: 0,
                totalSeconds: 60,
                phase: LiveTableTimeoutPhase.ended,
              ),
            ),
          ),
        );
        expect(_spanColor(tester, 'TEMPO ENCERRADO'), AppColors.win);
        expect(_spanColor(tester, '0:00'), AppColors.win);
      });

      testWidgets('app $label: véu do tempo médico', (tester) async {
        await pumpTonePiece(
          tester,
          theme,
          const SizedBox(
            height: 700,
            child: LiveTableMedicalTimeoutOverlay(
              timeout: LiveTableMedicalTimeoutView(
                playerName: 'Marcos',
                teamLabel: 'Marcos / Victor',
                remainingSeconds: 20,
                totalSeconds: 300,
                ended: false,
              ),
            ),
          ),
        );
        expect(_spanColor(tester, 'TEMPO MÉDICO · 5 MINUTOS'), AppColors.live);
        expect(_spanColor(tester, '0:20'), AppColors.live);
        expect(
          tester
              .widget<Icon>(find.byIcon(Icons.medical_services_rounded))
              .color,
          AppColors.live,
        );
      });

      testWidgets('app $label: pílula do relógio da mesa em paisagem', (
        tester,
      ) async {
        await _pumpMesa(
          tester,
          theme,
          _mesa(net: _netFinished),
          size: _landscape,
        );
        expect(_spanColor(tester, '● Q1 · SET 1 · 06:39'), AppColors.live);
        expect(
          _spanColor(tester, 'Fim do jogo · Vinícius / Thiago'),
          AppColors.win,
        );
      });
    }
  });

  // O valor digitado mora num `EditableText`, que o conferidor de contraste
  // não lê: confere a cor direto.
  group('campo de games do placar completo', () {
    for (final (label, theme) in [
      ('claro', AppTheme.light),
      ('escuro', AppTheme.dark),
    ]) {
      testWidgets('app $label: games vencidos no tom do tema', (tester) async {
        await _pumpWidePiece(
          tester,
          theme,
          _quickScoreSheet(_setsAWins),
          onSheet: true,
        );
        final colors = AppThemeColors(theme.colorScheme);
        final winning = tester
            .widgetList<EditableText>(find.byType(EditableText))
            .where((e) => e.controller.text == '21')
            .toList();
        expect(winning, hasLength(2));
        for (final field in winning) {
          expect(field.style.color, colors.win);
        }
      });
    }
  });
}
