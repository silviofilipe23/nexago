import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/core/profiles/users_repository.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/data/pelada_live_draft_store.dart';
import 'package:nexago_app/features/arenas/domain/booking_result.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_record.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_record_providers.dart';
import 'package:nexago_app/features/arenas/domain/booking_social_unlock.dart';
import 'package:nexago_app/features/arenas/domain/booking_story.dart';
import 'package:nexago_app/features/arenas/domain/booking_story_providers.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_confirmed_athlete.dart';
import 'package:nexago_app/features/arenas/domain/pelada_live/pelada_live_match.dart';
import 'package:nexago_app/features/arenas/domain/pelada_live/pelada_live_rules.dart';
import 'package:nexago_app/features/arenas/domain/pelada_live/pelada_live_session.dart';
import 'package:nexago_app/features/arenas/presentation/lancar_placar/lancar_placar_page.dart';
import 'package:nexago_app/features/arenas/presentation/lancar_placar/placar_digitado_page.dart';
import 'package:nexago_app/features/arenas/presentation/lancar_placar/placar_enviado_page.dart';
import 'package:nexago_app/features/arenas/presentation/pelada_live/pelada_live_page.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';

import 'fake_booking_result_repository.dart';

/// Caso de teste CT-PLACAR-AOVIVO-01 (fluxo proposto, fase 1): marcar ao
/// vivo durante a reserva e enviar no apito final, sem passar pelo editor.

class _MemoryStore implements PeladaLiveDraftStore {
  final drafts = <String, PeladaLiveSession>{};
  @override
  Future<void> clear(String key) async => drafts.remove(key);
  @override
  Future<PeladaLiveSession?> load(String key) async => drafts[key];
  @override
  Future<void> save(String key, PeladaLiveSession session) async =>
      drafts[key] = session;
  @override
  Future<PeladaLiveRules?> lastRules(String sportKey) async => null;
  @override
  Future<void> saveRules(String sportKey, PeladaLiveRules rules) async {}
}

const _args = BookingStoryArgs(
  bookingId: 'b1',
  arenaName: 'Arena Teste',
  courtName: 'Quadra 1',
  dateKey: '2026-11-13',
  startTime: '09:00',
  endTime: '10:30',
);

/// A reserva de [_args] é 09:00–10:30 de 13/11 (São Paulo).
DateTime _depoisDoJogo() => DateTime.parse('2026-11-13T12:00:00-03:00');
DateTime _duranteOJogo() => DateTime.parse('2026-11-13T09:40:00-03:00');

Future<(FakeBookingResultRepository, _MemoryStore)> _abrir(
  WidgetTester tester, {
  String uid = 'u1',
  _MemoryStore? store,
  LancarPlacarMode mode = LancarPlacarMode.live,
  FakeBookingResultRepository? repo,
  bool ownerInConfirmed = true,
  DateTime Function() clock = _depoisDoJogo,
  bool searchResults = false,
}) async {
  repo ??= FakeBookingResultRepository();
  final drafts = store ?? _MemoryStore();
  tester.view.physicalSize = const Size(390 * 3, 844 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        athleteProfileProvider.overrideWith(
          (ref) => Stream.value(
            AthleteProfile(
              id: uid,
              name: uid == 'u1' ? 'Maria Alves' : 'Rafael Souza',
              sport: '',
              level: '',
              city: '',
            ),
          ),
        ),
        bookingStorySourceProvider('b1').overrideWith(
          (ref) => BookingStorySource(
            sport: 'beachVolleyball',
            ownerUid: 'u1',
            confirmed: [
              if (ownerInConfirmed)
                const MyBookingConfirmedAthlete(
                    userId: 'u1', displayName: 'Maria Alves'),
              const MyBookingConfirmedAthlete(
                  userId: 'u2', displayName: 'Enzo Lima'),
              const MyBookingConfirmedAthlete(
                  userId: 'u3', displayName: 'Rafael Souza'),
              const MyBookingConfirmedAthlete(
                  userId: 'u4', displayName: 'Lia Martins'),
            ],
          ),
        ),
        bookingSocialUnlockProvider('b1').overrideWith(
          (ref) => const BookingSocialUnlock(
            unlocked: true,
            appPaidReais: 120,
            totalReais: 120,
          ),
        ),
        bookingResultPlayerSearchProvider.overrideWith(
          (ref, q) async => searchResults
              ? [
                  for (var i = 0; i < 6; i++)
                    ResultPlayer(id: 'b$i', name: '$q Atleta $i'),
                ]
              : [],
        ),
        bookingResultRepositoryProvider.overrideWithValue(repo),
        bookingResultUidProvider.overrideWithValue(uid),
        peladaLiveDraftStoreProvider.overrideWithValue(drafts),
        appUserPublicProfileProvider.overrideWith(
          (ref, id) async => id == 'u1'
              ? const AppUserProfile(uid: 'u1', fullName: 'Maria Alves')
              : null,
        ),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: LancarPlacarPage(args: _args, mode: mode, clock: clock),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return (repo, drafts);
}

Future<void> _pontos(WidgetTester tester, LiveSide side, int n) async {
  final half = find.byKey(Key('pelada-live-half-${side.name}'));
  for (var i = 0; i < n; i++) {
    // Toque no meio da metade (o aviso de troca de lado cobre o centro).
    await tester.tapAt(tester.getTopLeft(half) + const Offset(40, 60));
    await tester.pump();
  }
}

/// Fecha um set de vôlei de praia 21–0 para [side].
Future<void> _setPara(WidgetTester tester, LiveSide side) async {
  await _pontos(tester, side, 21);
  await tester.pumpAndSettle();
}

/// Quantos jogadores o time da posição [i] tem (a linha compacta do passo 1).
String _teamCount(WidgetTester tester, int i) =>
    tester.widget<Text>(find.byKey(Key('lancar-team-$i-count'))).data!;

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  testWidgets(
      'CT-01: confirmar times, marcar ao vivo com as regras do esporte e '
      'enviar no apito final', (tester) async {
    final (repo, drafts) = await _abrir(tester);

    // Passo 1: Quem jogou? com a galera da reserva já nos times.
    expect(find.text('Quem jogou?'), findsOneWidget);
    expect(find.text('Começar a marcar'), findsOneWidget);
    // Enzo (A) troca com Rafael (B) — um toque cada.
    await tester.tap(find.byKey(const Key('lancar-assign-u2-1')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('lancar-assign-u3-0')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('lancar-placar-next')));
    await tester.pumpAndSettle();

    // Começa direto, sem tela de regras: as do vôlei de praia num chip.
    expect(find.byType(PeladaLivePage), findsOneWidget);
    expect(
      find.text('melhor de 3 · até 21 · decisivo 15'),
      findsOneWidget,
    );
    expect(find.text('Set 1 · até 21'), findsOneWidget);

    await _setPara(tester, LiveSide.a);
    expect(find.text('Set 2 · até 21'), findsOneWidget);
    expect(drafts.drafts['b1'], isNotNull);
    await _setPara(tester, LiveSide.a);

    // Fim de jogo: enviar direto, sem passar pelo editor.
    // Confirmam todos menos quem envia, na ordem dos times.
    expect(find.text('Enviar para Rafael, Lia e Enzo'), findsOneWidget);
    await tester.tap(find.byKey(const Key('pelada-live-send')));
    await tester.pumpAndSettle();

    expect(find.byType(PlacarEnviadoPage), findsOneWidget);
    final saved = repo.saves.single.$2;
    expect(saved.games.length, 2);
    expect([for (final p in saved.teams[0].players) p.id], ['u1', 'u3']);
    expect(saved.games.every((g) => g.scoreA == 21 && g.scoreB == 0), isTrue);
    // Marcação enviada: o rascunho some.
    expect(drafts.drafts, isEmpty);
  });

  testWidgets('"Revisar placar" leva o ao vivo para o placar digitado', (
    tester,
  ) async {
    final (repo, _) = await _abrir(tester);
    await tester.tap(find.byKey(const Key('lancar-placar-next')));
    await tester.pumpAndSettle();
    await _setPara(tester, LiveSide.b);
    await _setPara(tester, LiveSide.b);

    await tester.tap(find.byKey(const Key('pelada-live-review')));
    await tester.pumpAndSettle();
    expect(find.byType(PlacarDigitadoPage), findsOneWidget);
    expect(find.text('Rafael & Lia vencem 2–0'), findsOneWidget);
    await tester.tap(find.byKey(const Key('placar-submit')));
    await tester.pumpAndSettle();
    expect(find.byType(PlacarEnviadoPage), findsOneWidget);
    expect(repo.saves.single.$2.games.length, 2);
  });

  testWidgets('marcação guardada: abre direto no placar onde parou', (
    tester,
  ) async {
    final store = _MemoryStore();
    var session = PeladaLiveSession.start(
      BookingResult(
        teams: [
          const ResultTeam(id: 0, players: [
            ResultPlayer(id: 'u1', name: 'Maria Alves'),
            ResultPlayer(id: 'u2', name: 'Enzo Lima'),
          ]),
          const ResultTeam(id: 1, players: [
            ResultPlayer(id: 'u3', name: 'Rafael Souza'),
            ResultPlayer(id: 'u4', name: 'Lia Martins'),
          ]),
        ],
        games: const [ResultGame(teamA: 0, teamB: 1)],
      ),
      PeladaLiveRules.forSport('beachVolleyball'),
      now: DateTime(2026, 11, 13),
    );
    for (var i = 0; i < 5; i++) {
      session = session.point(LiveSide.a, now: DateTime(2026, 11, 13));
    }
    store.drafts['b1'] = session;

    await _abrir(tester, store: store);

    expect(find.byType(PeladaLivePage), findsOneWidget);
    expect(
      tester.widget<Text>(find.byKey(const Key('pelada-live-score-a'))).data,
      '5',
    );
  });

  testWidgets('"Mudar" no chip troca as regras antes do primeiro ponto', (
    tester,
  ) async {
    await _abrir(tester);
    await tester.tap(find.byKey(const Key('lancar-placar-next')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('pelada-live-rules-change')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('pelada-live-bestof-0')));
    await tester.pump();
    expect(find.text('Aplicar regras'), findsOneWidget);
    await tester.tap(find.byKey(const Key('pelada-live-start')));
    await tester.pumpAndSettle();

    expect(find.byType(PeladaLivePage), findsOneWidget);
    expect(find.text('1 set · até 21'), findsOneWidget);
  });

  testWidgets('convidado marca ao vivo e o fim manda para quem reservou enviar',
      (
    tester,
  ) async {
    final (repo, _) = await _abrir(tester, uid: 'u3');
    await tester.tap(find.byKey(const Key('lancar-placar-next')));
    await tester.pumpAndSettle();
    await _setPara(tester, LiveSide.a);
    await _setPara(tester, LiveSide.a);

    expect(find.text('Mandar para Maria conferir'), findsOneWidget);
    expect(
      find.text('Maria confere e envia para todos confirmarem.'),
      findsOneWidget,
    );
    await tester.tap(find.byKey(const Key('pelada-live-send')));
    await tester.pumpAndSettle();
    expect(find.byType(PlacarEnviadoPage), findsOneWidget);
    expect(find.text('Placar mandado'), findsOneWidget);
    expect(repo.saves, isEmpty);
    expect(repo.suggestions.single.$2.games.length, 2);
  });

  testWidgets('convidado vê quem reservou na lista, já num time', (
    tester,
  ) async {
    await _abrir(
      tester,
      uid: 'u3',
      mode: LancarPlacarMode.typed,
      ownerInConfirmed: false,
    );
    expect(find.byKey(const Key('lancar-player-u1')), findsOneWidget);
    expect(find.text('reservou a quadra'), findsOneWidget);
    expect(_teamCount(tester, 0), '2');
    expect(_teamCount(tester, 1), '2');
  });

  testWidgets('quem reservou abre com o placar que o convidado mandou e envia',
      (
    tester,
  ) async {
    final repo = FakeBookingResultRepository()
      ..suggestion = const BookingResultSuggestion(
        bookingId: 'b1',
        suggestedBy: 'u3',
        suggestedByName: 'Rafael Souza',
        result: BookingResult(
          teams: [
            ResultTeam(id: 0, players: [
              ResultPlayer(id: 'u1', name: 'Maria Alves'),
              ResultPlayer(id: 'u3', name: 'Rafael Souza'),
            ]),
            ResultTeam(id: 1, players: [
              ResultPlayer(id: 'u2', name: 'Enzo Lima'),
              ResultPlayer(id: 'u4', name: 'Lia Martins'),
            ]),
          ],
          games: [ResultGame(teamA: 0, teamB: 1, scoreA: 21, scoreB: 17)],
        ),
      );
    await _abrir(tester, mode: LancarPlacarMode.typed, repo: repo);

    expect(find.byKey(const Key('lancar-placar-suggested')), findsOneWidget);
    expect(find.textContaining('Rafael marcou o placar'), findsOneWidget);
    // Os times vêm da sugestão: Rafael no A.
    expect(_teamCount(tester, 0), '2');
    await tester.tap(find.byKey(const Key('lancar-placar-next')));
    await tester.pumpAndSettle();
    expect(find.text('Maria & Rafael vencem 1–0'), findsOneWidget);
    await tester.tap(find.byKey(const Key('placar-submit')));
    await tester.pumpAndSettle();
    expect(repo.saves.single.$2.games.single.scoreB, 17);
    expect(find.text('Placar enviado'), findsOneWidget);
  });

  testWidgets('quem reservou vê "Convidar quem não tem conta"', (tester) async {
    await _abrir(tester, mode: LancarPlacarMode.typed);
    await tester.scrollUntilVisible(
      find.byKey(const Key('lancar-placar-invite')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Convidar quem não tem conta'), findsOneWidget);
  });

  testWidgets('placar digitado: alternar para ao vivo no passo 1', (
    tester,
  ) async {
    await _abrir(tester, mode: LancarPlacarMode.typed);
    expect(find.text('Próximo: placar'), findsOneWidget);
    await tester.tap(find.byKey(const Key('lancar-placar-switch-mode')));
    await tester.pump();
    expect(find.text('Começar a marcar'), findsOneWidget);
  });

  group('passo 1 v2 (sequência e times compactos)', () {
    testWidgets('durante o horário pergunta "Quem vai jogar?"', (tester) async {
      await _abrir(tester, clock: _duranteOJogo);
      expect(find.text('Quem vai jogar?'), findsOneWidget);
      expect(find.text('Quem jogou?'), findsNothing);
      await tester.tap(find.byKey(const Key('lancar-placar-add-team')));
      await tester.pump();
      expect(find.text('Falta escolher quem joga no Time C'), findsOneWidget);
      expect(find.text('Toque C ao lado de quem joga'), findsOneWidget);
    });

    testWidgets('depois do horário volta a ser "Quem jogou?"', (tester) async {
      await _abrir(tester);
      expect(find.text('Quem jogou?'), findsOneWidget);
    });

    testWidgets(
        'rei da quadra mostra a ordem de entrada e, com muitos times, os '
        'botões vão para baixo do nome', (tester) async {
      await _abrir(tester, mode: LancarPlacarMode.typed);
      expect(find.byKey(const Key('lancar-team-order')), findsNothing);
      for (var i = 0; i < 4; i++) {
        await tester.tap(find.byKey(const Key('lancar-placar-add-team')));
        await tester.pump();
      }
      expect(find.text('A × B abrem · quem vence fica'), findsOneWidget);
      expect(find.text('Fila: C → D → E → F'), findsOneWidget);
      expect(find.byKey(const Key('lancar-team-5-drag')), findsOneWidget);
      // Nada estoura com 6 times, e o nome fica acima dos botões.
      expect(tester.takeException(), isNull);
      final name = tester.getBottomLeft(find.text('Maria Alves'));
      final button =
          tester.getTopLeft(find.byKey(const Key('lancar-assign-u1-5')));
      expect(button.dy, greaterThan(name.dy));
    });
  });

  testWidgets(
      'digitar na busca com o campo fora da tela não estoura (Null check em '
      'getOffsetToReveal)', (tester) async {
    await _abrir(tester, mode: LancarPlacarMode.typed, searchResults: true);
    for (var i = 0; i < 4; i++) {
      await tester.tap(find.byKey(const Key('lancar-placar-add-team')));
      await tester.pump();
    }
    final page = find.byType(Scrollable).first;
    final field = find.byKey(const Key('lancar-placar-search'));
    // Teclado aberto, como no aparelho.
    tester.view.viewInsets = const FakeViewPadding(bottom: 336 * 3);
    await tester.pump();
    await tester.dragUntilVisible(field, page, const Offset(0, -150));
    await tester.pumpAndSettle();
    await tester.showKeyboard(field);
    tester.testTextInput.enterText('Gabi');
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    // O campo sai da tela (rolou para cima) e o atleta segue digitando: a
    // busca filtra as linhas de cima e o cursor tenta aparecer.
    for (final dy in [600.0, 3000.0]) {
      await tester.drag(page, Offset(0, dy));
      await tester.pumpAndSettle();
      for (final q in ['Ma', 'Gabi', '']) {
        tester.testTextInput.enterText(q);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
        expect(tester.takeException(), isNull,
            reason: 'rolou $dy, digitou "$q"');
      }
    }
  });
}
