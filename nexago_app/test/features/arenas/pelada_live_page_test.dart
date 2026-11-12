import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/data/pelada_live_draft_store.dart';
import 'package:nexago_app/features/arenas/domain/booking_result.dart';
import 'package:nexago_app/features/arenas/domain/pelada_live/pelada_live_match.dart';
import 'package:nexago_app/features/arenas/domain/pelada_live/pelada_live_rules.dart';
import 'package:nexago_app/features/arenas/domain/pelada_live/pelada_live_session.dart';
import 'package:nexago_app/features/arenas/presentation/booking_result_score_page.dart';
import 'package:nexago_app/features/arenas/presentation/pelada_live/pelada_live_page.dart';
import 'package:nexago_app/features/arenas/presentation/pelada_live/pelada_live_setup_page.dart';

/// Rascunho em memória (o de verdade é o `SharedPreferences`).
class _MemoryStore implements PeladaLiveDraftStore {
  final drafts = <String, PeladaLiveSession>{};
  final rules = <String, PeladaLiveRules>{};

  @override
  Future<void> clear(String key) async => drafts.remove(key);

  @override
  Future<PeladaLiveSession?> load(String key) async => drafts[key];

  @override
  Future<void> save(String key, PeladaLiveSession session) async =>
      drafts[key] = session;

  @override
  Future<PeladaLiveRules?> lastRules(String sportKey) async => rules[sportKey];

  @override
  Future<void> saveRules(String sportKey, PeladaLiveRules r) async =>
      rules[sportKey] = r;
}

ResultTeam _team(int id, String a, String b) => ResultTeam(
      id: id,
      players: [
        ResultPlayer(id: 'u${id}a', name: a),
        ResultPlayer(id: 'u${id}b', name: b),
      ],
    );

BookingResult _two() => BookingResult(
      teams: [_team(0, 'Maria', 'Enzo'), _team(1, 'Caio', 'Lia')],
      games: const [ResultGame(teamA: 0, teamB: 1)],
    );

BookingResult _three() => BookingResult(
      teams: [
        _team(0, 'Pedro', 'João'),
        _team(1, 'Gui', 'Théo'),
        _team(2, 'Mateus', 'Nico'),
      ],
      games: const [ResultGame(teamA: 0, teamB: 1)],
    );

void _phone(WidgetTester tester) {
  tester.view.physicalSize = const Size(390 * 3, 844 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
}

Future<void> _scorePage(
  WidgetTester tester, {
  required BookingResult initial,
  required String sport,
  required _MemoryStore store,
}) async {
  _phone(tester);
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.dark,
      home: BookingResultScorePage(
        initial: initial,
        candidates: const [],
        ownerPlayerId: 'u0a',
        sport: sport,
        bookingId: 'b1',
        liveStore: store,
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _tapN(WidgetTester tester, Finder f, int n) async {
  for (var i = 0; i < n; i++) {
    await tester.tap(f);
    await tester.pump();
  }
}

String _score(WidgetTester tester, LiveSide side) => tester
    .widget<Text>(find.byKey(Key('pelada-live-score-${side.name}')))
    .data!;

void main() {
  testWidgets(
      'futevôlei: do Editar placar ao placar ao vivo e de volta com o set',
      (tester) async {
    final store = _MemoryStore();
    await _scorePage(tester,
        initial: _two(), sport: 'footvolley', store: store);

    expect(
      find.textContaining('com as regras do futevôlei'),
      findsOneWidget,
    );
    await tester.tap(find.byKey(const Key('pelada-live-open')));
    await tester.pumpAndSettle();
    expect(find.byType(PeladaLiveSetupPage), findsOneWidget);

    // 1 set até 18.
    await tester.tap(find.byKey(const Key('pelada-live-bestof-0')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('pelada-live-start')));
    await tester.pumpAndSettle();
    expect(find.byType(PeladaLivePage), findsOneWidget);
    expect(find.text('Set 1 · até 18'), findsOneWidget);

    await _tapN(tester, find.byKey(const Key('pelada-live-half-b')), 3);
    await _tapN(tester, find.byKey(const Key('pelada-live-half-a')), 17);
    expect(_score(tester, LiveSide.a), '17');
    expect(find.text('SET POINT'), findsOneWidget);
    expect(store.drafts['b1']!.match.current.a, 17);

    // Desfazer tira o último ponto.
    await tester.tap(find.byKey(const Key('pelada-live-undo')));
    await tester.pump();
    expect(_score(tester, LiveSide.a), '16');

    await _tapN(tester, find.byKey(const Key('pelada-live-half-a')), 2);
    await tester.pumpAndSettle();
    expect(
      find.text('Maria & Enzo venceram 18–3'),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const Key('pelada-live-use')));
    await tester.pumpAndSettle();
    expect(find.byType(BookingResultScorePage), findsOneWidget);
    expect(find.text('Salvar placar · 1 set'), findsOneWidget);
    // O rascunho fica até salvar: o card vira "Continuar marcação".
    expect(find.text('Continuar marcação'), findsOneWidget);
    expect(find.text('18'), findsOneWidget);
    expect(find.text('3'), findsWidgets);
  });

  testWidgets('beach tennis: 15/30/40, ponto de ouro e o game na faixa',
      (tester) async {
    _phone(tester);
    final store = _MemoryStore();
    final session = PeladaLiveSession.start(
      _two(),
      PeladaLiveRules.forSport('beachTennis'),
      firstServe: LiveSide.a,
      now: DateTime(2026, 11, 12),
    );
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: PeladaLivePage(
          session: session,
          store: store,
          draftKey: 'b1',
          sportLabel: 'Beach tennis',
          keepAwake: false,
        ),
      ),
    );
    final a = find.byKey(const Key('pelada-live-half-a'));
    final b = find.byKey(const Key('pelada-live-half-b'));
    await tester.tap(a);
    await tester.pump();
    expect(_score(tester, LiveSide.a), '15');
    await _tapN(tester, a, 2);
    await _tapN(tester, b, 3);
    expect(_score(tester, LiveSide.a), '40');
    expect(_score(tester, LiveSide.b), '40');
    expect(find.text('PONTO DE OURO'), findsOneWidget);
    await tester.tap(b);
    await tester.pump();
    expect(_score(tester, LiveSide.b), '0');
    expect(find.text('games 1'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('basquete 3x3: botões +1 e +2, sem tocar na metade',
      (tester) async {
    _phone(tester);
    final session = PeladaLiveSession.start(
      _two(),
      PeladaLiveRules.forSport('basketball').copyWith(minutes: () => null),
      now: DateTime(2026, 11, 12),
    );
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: PeladaLivePage(
          session: session,
          store: _MemoryStore(),
          draftKey: 'b1',
          keepAwake: false,
        ),
      ),
    );
    expect(find.byKey(const Key('pelada-live-half-a')), findsNothing);
    expect(find.byKey(const Key('pelada-live-a-plus3')), findsNothing);
    await tester.tap(find.byKey(const Key('pelada-live-a-plus2')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('pelada-live-b-plus1')));
    await tester.pump();
    expect(_score(tester, LiveSide.a), '2');
    expect(_score(tester, LiveSide.b), '1');
  });

  testWidgets('futebol rei da quadra: cronômetro, gol de ouro e próximo jogo',
      (tester) async {
    _phone(tester);
    var now = DateTime(2026, 11, 12, 18);
    final store = _MemoryStore();
    final session = PeladaLiveSession.start(
      _three(),
      PeladaLiveRules.forSport('football').copyWith(limit: () => 2),
      now: now,
    );
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: PeladaLivePage(
          session: session,
          store: store,
          draftKey: 'b1',
          clock: () => now,
          keepAwake: false,
        ),
      ),
    );
    expect(find.text('Jogo 1 · rei da quadra'), findsOneWidget);
    expect(find.textContaining('Mateus & Nico'), findsOneWidget);
    expect(find.text('10:00'), findsOneWidget);

    now = now.add(const Duration(minutes: 3));
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('07:00'), findsOneWidget);

    // Acaba o tempo empatado: gol de ouro.
    now = now.add(const Duration(minutes: 8));
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('GOL DE OURO'), findsWidgets);
    await tester.tap(find.byKey(const Key('pelada-live-half-b')));
    await tester.pumpAndSettle();
    expect(find.text('Gui & Théo ganharam 1–0'), findsOneWidget);

    await tester.tap(find.byKey(const Key('pelada-live-next')));
    await tester.pumpAndSettle();
    expect(find.text('Jogo 2 · rei da quadra'), findsOneWidget);
    expect(find.text('10:00'), findsOneWidget);
    expect(store.drafts['b1']!.base.games.single.winner, 1);
    expect(
      {store.drafts['b1']!.teamA, store.drafts['b1']!.teamB},
      {1, 2},
    );
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('rascunho guardado: Continuar abre o placar onde parou',
      (tester) async {
    final store = _MemoryStore();
    var session = PeladaLiveSession.start(
      _two(),
      PeladaLiveRules.forSport('beachVolleyball'),
      now: DateTime(2026, 11, 12),
    );
    for (var i = 0; i < 5; i++) {
      session = session.point(LiveSide.a, now: DateTime(2026, 11, 12));
    }
    store.drafts['b1'] = session;
    await _scorePage(
      tester,
      initial: _two(),
      sport: 'beachVolleyball',
      store: store,
    );
    expect(find.text('Continuar marcação'), findsOneWidget);
    expect(find.textContaining('Set 1 · 5–0'), findsOneWidget);
    await tester.tap(find.byKey(const Key('pelada-live-open')));
    await tester.pumpAndSettle();
    expect(find.byType(PeladaLiveSetupPage), findsNothing);
    expect(_score(tester, LiveSide.a), '5');

    // Descartar some com o rascunho e volta ao Editar placar.
    await tester.tap(find.byKey(const Key('pelada-live-menu')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('pelada-live-menu-discard')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('pelada-live-discard-confirm')));
    await tester.pumpAndSettle();
    expect(store.drafts, isEmpty);
    expect(find.text('Marcar ao vivo'), findsOneWidget);
  });

  testWidgets('placar já lançado: pergunta antes de marcar ao vivo por cima',
      (tester) async {
    final store = _MemoryStore();
    await _scorePage(
      tester,
      initial: _two().updateGame(
        0,
        const ResultGame(teamA: 0, teamB: 1, scoreA: 21, scoreB: 15),
      ),
      sport: 'beachVolleyball',
      store: store,
    );
    await tester.tap(find.byKey(const Key('pelada-live-open')));
    await tester.pumpAndSettle();
    expect(find.text('Marcar ao vivo?'), findsOneWidget);
    await tester.tap(find.byKey(const Key('pelada-live-replace-confirm')));
    await tester.pumpAndSettle();
    expect(find.byType(PeladaLiveSetupPage), findsOneWidget);
    // Vôlei de praia: troca de lado e vantagem de 2 ligadas por padrão.
    await tester.scrollUntilVisible(
      find.byKey(const Key('pelada-live-court-switch')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(
      tester
          .widget<SwitchListTile>(
            find.byKey(const Key('pelada-live-court-switch')),
          )
          .value,
      isTrue,
    );
  });
}
