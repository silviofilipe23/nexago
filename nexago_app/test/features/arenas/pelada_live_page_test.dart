import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/data/pelada_live_draft_store.dart';
import 'package:nexago_app/features/arenas/domain/booking_result.dart';
import 'package:nexago_app/features/arenas/domain/pelada_live/pelada_live_match.dart';
import 'package:nexago_app/features/arenas/domain/pelada_live/pelada_live_rules.dart';
import 'package:nexago_app/features/arenas/domain/pelada_live/pelada_live_session.dart';
import 'package:nexago_app/features/arenas/presentation/pelada_live/pelada_live_page.dart';

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

  testWidgets('vôlei de praia: "Troquem de lado" fica até o próximo ponto',
      (tester) async {
    _phone(tester);
    final session = PeladaLiveSession.start(
      _two(),
      PeladaLiveRules.forSport('beachVolleyball'),
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
    final a = find.byKey(const Key('pelada-live-half-a'));
    // 7 pontos somados no set de 21: troca de lado.
    await _tapN(tester, a, 7);
    expect(find.text('Troquem de lado'), findsOneWidget);

    // Sem prazo: a troca leva o tempo que levar.
    await tester.pump(const Duration(seconds: 30));
    expect(find.text('Troquem de lado'), findsOneWidget);

    await tester.tap(find.byKey(const Key('pelada-live-half-b')));
    await tester.pump();
    expect(find.text('Troquem de lado'), findsNothing);
    expect(_score(tester, LiveSide.b), '1');
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
    // Placar com quem venceu (e o número), quem fica × quem entra e a fila.
    final winner = find.byKey(const Key('pelada-live-finish-winner'));
    expect(
      find.descendant(of: winner, matching: find.textContaining('Gui & Théo')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: winner, matching: find.text('1')),
      findsOneWidget,
    );
    expect(find.byKey(const Key('pelada-live-finish-next')), findsOneWidget);
    expect(find.text('Começar o jogo 2'), findsOneWidget);
    expect(find.text('Encerrar e usar no placar · 1 jogo'), findsOneWidget);

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

  testWidgets('rei da quadra: trocar quem entra no próximo jogo', (
    tester,
  ) async {
    _phone(tester);
    final now = DateTime(2026, 11, 12, 18);
    final store = _MemoryStore();
    final four = BookingResult(
      teams: [..._three().teams, _team(3, 'Duda', 'Teo')],
      games: const [ResultGame(teamA: 0, teamB: 1)],
    );
    final session = PeladaLiveSession.start(
      four,
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
    await tester.tap(find.byKey(const Key('pelada-live-half-b')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('pelada-live-half-b')));
    await tester.pumpAndSettle();

    // A vez é de Mateus & Nico; a galera troca para Duda & Teo.
    final next = find.byKey(const Key('pelada-live-finish-next'));
    expect(
      find.descendant(of: next, matching: find.text('Mateus & Nico')),
      findsOneWidget,
    );
    await tester.tap(find.byKey(const Key('pelada-live-swap')));
    await tester.pumpAndSettle();
    expect(find.text('Quem entra no jogo 2?'), findsOneWidget);
    // Quem acabou de perder não aparece para escolher.
    expect(find.byKey(const Key('pelada-live-challenger-0')), findsNothing);
    await tester.tap(find.byKey(const Key('pelada-live-challenger-3')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('pelada-live-challenger-confirm')));
    await tester.pumpAndSettle();
    expect(
      find.descendant(of: next, matching: find.text('Duda & Teo')),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: next,
        matching: find.textContaining('Fila depois: Mateus & Nico'),
      ),
      findsOneWidget,
    );

    await tester.tap(find.byKey(const Key('pelada-live-next')));
    await tester.pumpAndSettle();
    expect({store.drafts['b1']!.teamA, store.drafts['b1']!.teamB}, {1, 3});
    await tester.pumpWidget(const SizedBox());
  });
}
