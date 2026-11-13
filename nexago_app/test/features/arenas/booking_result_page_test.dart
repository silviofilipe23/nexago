import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/data/booking_arena_art.dart';
import 'package:nexago_app/features/arenas/data/pelada_live_draft_store.dart';
import 'package:nexago_app/features/arenas/domain/pelada_live/pelada_live_rules.dart';
import 'package:nexago_app/features/arenas/domain/pelada_live/pelada_live_session.dart';
import 'package:nexago_app/features/arenas/domain/booking_result.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_record.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_record_providers.dart';
import 'package:nexago_app/features/arenas/domain/booking_story.dart';
import 'package:nexago_app/features/arenas/domain/booking_social_unlock.dart';
import 'package:nexago_app/features/arenas/domain/booking_story_providers.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_confirmed_athlete.dart';
import 'package:nexago_app/features/arenas/presentation/booking_result_page.dart';
import 'package:nexago_app/features/arenas/presentation/lancar_placar/lancar_placar_page.dart';
import 'package:nexago_app/features/arenas/presentation/lancar_placar/placar_digitado_page.dart';
import 'package:nexago_app/features/arenas/presentation/lancar_placar/placar_enviado_page.dart';
import 'package:nexago_app/features/arenas/presentation/pelada_detail_page.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/booking_story/booking_result_card.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';

import 'fake_booking_result_repository.dart';

/// PNG 1×1: capa e logo de mentira da arena.
final pixel = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
);

const args = BookingStoryArgs(
  bookingId: 'b1',
  arenaName: 'Arena CFC',
  courtName: 'Quadra 1',
  dateKey: '2026-05-22',
  startTime: '09:00',
  endTime: '10:30',
);

const maria = AthleteProfile(
  id: 'u1',
  name: 'Maria Alves',
  sport: '',
  level: '',
  city: '',
);

const galera = BookingStorySource(
  sport: 'beachVolleyball',
  ownerUid: 'u1',
  confirmed: [
    MyBookingConfirmedAthlete(userId: 'u2', displayName: 'Enzo Lima'),
    MyBookingConfirmedAthlete(userId: 'u3', displayName: 'Rafael Souza'),
    MyBookingConfirmedAthlete(userId: 'u4', displayName: 'Lia Martins'),
  ],
);

const liberada = BookingSocialUnlock(
  unlocked: true,
  appPaidReais: 120,
  totalReais: 120,
);

/// Sem marcação ao vivo guardada (o de verdade é o `SharedPreferences`).
class _SemRascunho implements PeladaLiveDraftStore {
  @override
  Future<void> clear(String key) async {}
  @override
  Future<PeladaLiveSession?> load(String key) async => null;
  @override
  Future<void> save(String key, PeladaLiveSession session) async {}
  @override
  Future<PeladaLiveRules?> lastRules(String sportKey) async => null;
  @override
  Future<void> saveRules(String sportKey, PeladaLiveRules rules) async {}
}

Finder rich(String text) => find.textContaining(text, findRichText: true);

Finder inCard(Finder f) =>
    find.descendant(of: find.byType(BookingResultCard), matching: f);

BookingResult cardResult(WidgetTester tester) =>
    tester.widget<BookingResultCard>(find.byType(BookingResultCard)).result;

Future<FakeBookingResultRepository> abrir(
  WidgetTester tester, {
  BookingStorySource? source = galera,
  List<ResultPlayer> busca = const [],
  List<SavedBookingResult> salvos = const [],
  String uid = 'u1',
  BookingSocialUnlock? unlock = liberada,
  BookingArenaArt? arena,
}) async {
  final repo = FakeBookingResultRepository(salvos);
  tester.view.physicalSize = const Size(400, 1400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        athleteProfileProvider.overrideWith((ref) => Stream.value(maria)),
        bookingStorySourceProvider('b1').overrideWith(
          (ref) => arena == null || source == null
              ? source
              : BookingStorySource(
                  sport: source.sport,
                  ownerUid: source.ownerUid,
                  confirmed: source.confirmed,
                  arenaId: 'a1',
                ),
        ),
        if (arena != null)
          bookingArenaArtProvider('a1').overrideWith((ref) async => arena),
        bookingSocialUnlockProvider('b1').overrideWith((ref) => unlock),
        peladaLiveDraftStoreProvider.overrideWithValue(_SemRascunho()),
        bookingResultPlayerSearchProvider.overrideWith(
          (ref, query) async => busca,
        ),
        bookingResultRepositoryProvider.overrideWithValue(repo),
        bookingResultUidProvider.overrideWithValue(uid),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: const BookingResultPage(args: args),
      ),
    ),
  );
  await tester.pump();
  return repo;
}

/// Espera a transição de rota terminar: tocar durante a saída de uma tela
/// cai na barreira dela. Estas telas não têm animação infinita.
Future<void> navegar(WidgetTester tester) => tester.pumpAndSettle();

/// Pós-jogo → "Lançar placar" (passo 1, Quem jogou?).
Future<void> lancar(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('booking-result-edit')));
  await navegar(tester);
  expect(find.byType(LancarPlacarPage), findsOneWidget);
}

/// Passo 1 → passo 2 (placar digitado).
Future<void> proximo(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('lancar-placar-next')));
  await navegar(tester);
  expect(find.byType(PlacarDigitadoPage), findsOneWidget);
}

/// Digita [valor] no teclado aberto e confirma.
Future<void> teclar(WidgetTester tester, int valor) async {
  for (final d in '$valor'.split('')) {
    await tester.tap(find.byKey(Key('placar-keypad-$d')));
    await tester.pump();
  }
  await tester.tap(find.byKey(const Key('placar-keypad-ok')));
  await navegar(tester);
}

/// O placar do jogo [i]: o lado de cima e, com o teclado que abre sozinho
/// para o outro lado, o de baixo.
Future<void> placar(WidgetTester tester, int i, int a, int b) async {
  await tester.tap(find.byKey(Key('placar-box-$i-a')));
  await navegar(tester);
  await teclar(tester, a);
  await teclar(tester, b);
}

Future<void> enviar(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('placar-submit')));
  await navegar(tester);
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  group('reserva sem metade paga pelo app', () {
    const naArena = BookingSocialUnlock(
      unlocked: false,
      appPaidReais: 0,
      totalReais: 120,
    );

    testWidgets('dono vê como liberar, sem editor nem arte', (tester) async {
      await abrir(tester, unlock: naArena);

      expect(find.byKey(const Key('booking-social-locked')), findsOneWidget);
      expect(
          find.text('Pague pelo app para registrar o placar'), findsOneWidget);
      expect(
        find.textContaining(RegExp(r'0,00 de R\$.120,00 foram pagos pelo app')),
        findsOneWidget,
      );
      expect(find.byType(BookingResultCard), findsNothing);
      expect(find.byKey(const Key('booking-result-edit')), findsNothing);
    });

    testWidgets('convidado sabe que depende de quem reservou', (tester) async {
      await abrir(tester, unlock: naArena, uid: 'u2');

      expect(find.text('Resultado ainda não liberado'), findsOneWidget);
      expect(find.textContaining('quem reservou paga'), findsOneWidget);
    });

    testWidgets('carregando a reserva não mostra o editor', (tester) async {
      await abrir(tester, unlock: null);

      expect(find.byType(BookingResultCard), findsNothing);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });
  });

  testWidgets('abre com a galera da reserva dividida em duas duplas', (
    tester,
  ) async {
    await abrir(tester);

    expect(inCard(find.text('Jogaço\nna areia.')), findsOneWidget);
    expect(inCard(find.text('Maria & Enzo')), findsOneWidget);
    expect(inCard(find.text('Rafael & Lia')), findsOneWidget);
    expect(inCard(find.text('FIM DE JOGO')), findsOneWidget);
    expect(inCard(find.text('1h30')), findsOneWidget);
    expect(inCard(find.text('SEX · 22 MAI')), findsOneWidget);
    expect(find.text('Toque para lançar o placar'), findsOneWidget);
  });

  testWidgets('lança o placar em 2 passos: digita, envia e a arte mostra o set',
      (
    tester,
  ) async {
    final repo = await abrir(tester);

    await lancar(tester);
    // A galera da reserva já vem nos times, com você no A.
    expect(find.text('TIME A · 2'), findsOneWidget);
    expect(find.text('TIME B · 2'), findsOneWidget);
    await proximo(tester);
    expect(find.text('Falta o placar do set 1'), findsOneWidget);

    await placar(tester, 0, 21, 18);
    expect(find.text('Maria & Enzo vencem 1–0'), findsOneWidget);
    expect(find.text('Enviar para Enzo, Rafael e Lia'), findsOneWidget);
    await enviar(tester);

    expect(find.byType(PlacarEnviadoPage), findsOneWidget);
    expect(repo.saves.single.$2.games.single.scoreA, 21);
    expect(repo.saves.single.$2.games.single.scoreB, 18);
    await tester.tap(find.byKey(const Key('placar-enviado-story')));
    await navegar(tester);

    expect(find.byType(BookingResultPage), findsOneWidget);
    expect(find.text('21–18'), findsWidgets);
    expect(cardResult(tester).games.single.scoreA, 21);
  });

  testWidgets('chip "Sets" desligado tira os sets; "Placar" tira o bloco', (
    tester,
  ) async {
    await abrir(tester);

    // Sem placar lançado não há set para mostrar: nem chip, nem colunas —
    // só o 0 de sets vencidos de cada time.
    expect(find.byKey(const Key('booking-result-info-sets')), findsNothing);
    expect(inCard(find.text('0')), findsNWidgets(2));

    await lancar(tester);
    await proximo(tester);
    await placar(tester, 0, 1, 0);
    await enviar(tester);
    await tester.tap(find.byKey(const Key('placar-enviado-story')));
    await navegar(tester);

    // O set 1×0 entra em colunas ao lado dos nomes.
    expect(inCard(find.text('0')), findsNWidgets(2));
    expect(inCard(find.text('1')), findsNWidgets(2));
    await tester.tap(find.byKey(const Key('booking-result-info-sets')));
    await tester.pump();
    expect(inCard(find.text('0')), findsOneWidget);
    expect(inCard(find.text('1')), findsOneWidget);

    await tester.tap(find.byKey(const Key('booking-result-info-score')));
    await tester.pump();
    expect(inCard(find.text('Maria & Enzo')), findsNothing);
  });

  testWidgets(
      'arena com capa e logo: abre em Brasa com o logo ao lado do nome; '
      '"Foto da arena" põe a capa de fundo', (tester) async {
    await abrir(tester, arena: BookingArenaArt(cover: pixel, logo: pixel));
    await tester.pumpAndSettle();

    BookingResultCard card() =>
        tester.widget<BookingResultCard>(find.byType(BookingResultCard));
    // A capa não vira o fundo sozinha.
    expect(card().theme, BookingStoryTheme.ember);
    expect(card().photo, isNull);
    expect(
      inCard(find.byKey(const Key('booking-result-arena-logo'))),
      findsOneWidget,
    );

    // "Foto" sem foto abre a folha; a capa é a primeira opção.
    await tester.tap(find.byKey(const Key('booking-story-theme-photo')));
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const ValueKey('booking-story-photo-source-arena')),
    );
    await tester.pumpAndSettle();
    expect(card().theme, BookingStoryTheme.photo);
    expect(card().photo, same(pixel));
  });

  testWidgets('arena sem capa nem logo: segue em Brasa, sem logo', (
    tester,
  ) async {
    await abrir(tester, arena: BookingArenaArt.none);
    await tester.pumpAndSettle();

    final card =
        tester.widget<BookingResultCard>(find.byType(BookingResultCard));
    expect(card.theme, BookingStoryTheme.ember);
    expect(
      inCard(find.byKey(const Key('booking-result-arena-logo'))),
      findsNothing,
    );
  });

  testWidgets('sozinho na reserva: o outro lado é "Adversários"', (
    tester,
  ) async {
    await abrir(tester, source: null);

    expect(inCard(find.text('Maria')), findsOneWidget);
    expect(inCard(find.text('Adversários')), findsOneWidget);
  });

  testWidgets(
    'terceiro time pela busca vira rei da quadra: classificação e chip Jogos',
    (tester) async {
      final repo = await abrir(
        tester,
        busca: const [
          ResultPlayer(id: 'u5', name: 'Bruno Lima'),
          ResultPlayer(id: 'u6', name: 'Carol Dias'),
        ],
      );

      await lancar(tester);
      await tester.tap(find.byKey(const Key('lancar-placar-add-team')));
      await tester.pump();
      expect(find.text('Falta escolher quem jogou no Time C'), findsOneWidget);

      await tester.enterText(
        find.byKey(const Key('lancar-placar-search')),
        'Bru',
      );
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump();
      // Pelada não tem avulso: só atleta com conta.
      expect(find.textContaining('avulso'), findsNothing);
      await tester.tap(find.byKey(const Key('lancar-assign-u5-2')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('lancar-assign-u6-2')));
      await tester.pump();
      expect(find.text('TIME C · 2'), findsOneWidget);

      await proximo(tester);
      expect(find.text('JOGO 1'), findsOneWidget);
      await placar(tester, 0, 1, 0);
      await enviar(tester);
      expect(repo.saves.single.$2.isRotation, isTrue);
      await tester.tap(find.byKey(const Key('placar-enviado-story')));
      await navegar(tester);

      expect(cardResult(tester).isRotation, isTrue);
      // No rei da quadra o chip vira "Jogos": a grade com o placar de cada um.
      expect(
        find.descendant(
          of: find.byKey(const Key('booking-result-info-sets')),
          matching: find.text('Jogos'),
        ),
        findsOneWidget,
      );
      expect(
        inCard(find.byKey(const Key('booking-result-games-grid'))),
        findsOneWidget,
      );
      expect(inCard(find.text('Bruno & Carol')), findsOneWidget);
    },
  );

  testWidgets('trocar um jogador de time é um toque (sem "Já em …")', (
    tester,
  ) async {
    final repo = await abrir(tester);

    await lancar(tester);
    // Enzo (A) troca com Rafael (B).
    await tester.tap(find.byKey(const Key('lancar-assign-u2-1')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('lancar-assign-u3-0')));
    await tester.pump();
    expect(find.text('TIME A · 2'), findsOneWidget);
    expect(find.text('TIME B · 2'), findsOneWidget);
    expect(find.textContaining('Já em'), findsNothing);

    await proximo(tester);
    await placar(tester, 0, 21, 15);
    await enviar(tester);
    final teams = repo.saves.single.$2.teams;
    expect([for (final p in teams[0].players) p.id], ['u1', 'u3']);
    expect([for (final p in teams[1].players) p.id], ['u4', 'u2']);
  });

  testWidgets('tocar o time em que o jogador já está o tira do placar', (
    tester,
  ) async {
    await abrir(tester);

    await lancar(tester);
    await tester.tap(find.byKey(const Key('lancar-assign-u3-1')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('lancar-assign-u4-1')));
    await tester.pump();
    expect(find.text('TIME B · 0'), findsOneWidget);
    expect(find.text('Falta escolher quem jogou no Time B'), findsOneWidget);
    final next = tester.widget<FilledButton>(
      find.byKey(const Key('lancar-placar-next')),
    );
    expect(next.onPressed, isNull);
  });

  testWidgets('busca de atletas do app entra na lista com os times', (
    tester,
  ) async {
    await abrir(
      tester,
      busca: const [ResultPlayer(id: 'u7', name: 'Gabi Rocha')],
    );

    await lancar(tester);
    await tester.enterText(
      find.byKey(const Key('lancar-placar-search')),
      'Gab',
    );
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump();
    expect(find.text('Gabi Rocha'), findsOneWidget);
    expect(find.text('no nexaGO'), findsOneWidget);
    await tester.tap(find.byKey(const Key('lancar-assign-u7-0')));
    await tester.pump();
    expect(find.text('TIME A · 3'), findsOneWidget);
  });

  testWidgets('renomear um time pelo cabeçalho vai para a arte', (
    tester,
  ) async {
    await abrir(tester);

    await lancar(tester);
    await tester.tap(find.byKey(const Key('lancar-team-1-rename')));
    await navegar(tester);
    await tester.enterText(
      find.byKey(const Key('lancar-team-name-field')),
      'As brabas',
    );
    await tester.tap(find.byKey(const Key('lancar-team-name-save')));
    await navegar(tester);
    expect(find.text('As brabas'), findsOneWidget);

    await proximo(tester);
    await placar(tester, 0, 18, 21);
    await enviar(tester);
    await tester.tap(find.byKey(const Key('placar-enviado-story')));
    await navegar(tester);

    expect(inCard(find.text('As brabas')), findsOneWidget);
  });

  group('convidado da reserva (entra pela Agenda desde o #779)', () {
    testWidgets(
        'convidado marca e manda para quem reservou enviar (não grava o '
        'placar)', (tester) async {
      final repo = await abrir(tester, uid: 'u3');

      await lancar(tester);
      // Só quem reservou convida quem não tem conta.
      expect(find.byKey(const Key('lancar-placar-invite')), findsNothing);
      await proximo(tester);
      expect(
        find.text('Quem reservou confere e envia para todos confirmarem.'),
        findsOneWidget,
      );
      await placar(tester, 0, 21, 19);
      expect(find.text('Mandar para quem reservou'), findsOneWidget);
      await enviar(tester);

      expect(repo.saves, isEmpty);
      expect(repo.suggestions.single.$2.games.single.scoreA, 21);
      expect(find.byType(PlacarEnviadoPage), findsOneWidget);
      expect(find.text('Placar mandado'), findsOneWidget);
      expect(
        rich('Mandamos para quem reservou a quadra conferir e enviar'),
        findsOneWidget,
      );
      await tester.tap(find.byKey(const Key('placar-enviado-story')));
      await navegar(tester);
      expect(find.byType(BookingResultPage), findsOneWidget);
      expect(cardResult(tester).games.single.scoreA, 21);
    });

    testWidgets('adversário com placar pendente vê o atalho para conferir', (
      tester,
    ) async {
      await abrir(tester, uid: 'u3', salvos: [savedResult()]);
      await tester.pump();

      expect(find.textContaining('Falta a sua confirmação'), findsOneWidget);
      await tester.tap(find.byKey(const Key('booking-result-open-review')));
      await navegar(tester);
      expect(find.byType(PeladaDetailPage), findsOneWidget);
      expect(find.byKey(const Key('pelada-confirm')), findsOneWidget);
    });
  });

  group('placar salvo', () {
    testWidgets('o botão diz para quem vai e a tela final cita quem confirma',
        (tester) async {
      final repo = await abrir(tester);

      await lancar(tester);
      await proximo(tester);
      await placar(tester, 0, 1, 0);
      expect(find.text('Enviar para Enzo, Rafael e Lia'), findsOneWidget);
      await enviar(tester);

      expect(repo.saves.single.$1, 'b1');
      expect(repo.saves.single.$2.games.single.scoreA, 1);
      expect(
        [for (final p in repo.saves.single.$2.teams[1].players) p.id],
        ['u3', 'u4'],
      );
      // Todo mundo do placar confirma, companheiro também.
      expect(
        rich('Enzo, Rafael +1 recebem o placar para confirmar. Sem '
            'contestação em 48h, ele confirma sozinho.'),
        findsOneWidget,
      );
      await tester.tap(find.byKey(const Key('placar-enviado-close')));
      await navegar(tester);
      expect(find.byType(BookingResultPage), findsOneWidget);
    });

    testWidgets('sozinho na reserva: o passo 1 pede o outro time', (
      tester,
    ) async {
      final repo = await abrir(tester, source: null);

      await lancar(tester);
      expect(find.text('Falta escolher quem jogou no Time B'), findsOneWidget);
      await tester.tap(find.byKey(const Key('lancar-placar-next')));
      await navegar(tester);
      expect(find.byType(PlacarDigitadoPage), findsNothing);
      expect(repo.saves, isEmpty);
    });

    testWidgets('set sem placar ou empatado: o botão diz o que falta', (
      tester,
    ) async {
      final repo = await abrir(tester);

      await lancar(tester);
      await proximo(tester);
      expect(find.text('Falta o placar do set 1'), findsOneWidget);
      await placar(tester, 0, 5, 5);
      expect(find.text('O set 1 está empatado'), findsOneWidget);
      await tester.tap(find.byKey(const Key('placar-submit')));
      await navegar(tester);
      expect(repo.saves, isEmpty);
      expect(find.byType(PlacarDigitadoPage), findsOneWidget);
    });

    testWidgets('mais um set e o atalho do esporte no teclado', (tester) async {
      final repo = await abrir(tester);

      await lancar(tester);
      await proximo(tester);
      await placar(tester, 0, 21, 18);
      await tester.tap(find.byKey(const Key('placar-add-game')));
      await tester.pump();
      // Vôlei de praia: o teclado oferece 21 como atalho.
      await tester.tap(find.byKey(const Key('placar-box-1-b')));
      await navegar(tester);
      await tester.tap(find.byKey(const Key('placar-keypad-quick-21')));
      await navegar(tester);
      await teclar(tester, 17);
      expect(find.text('Enviar para Enzo, Rafael e Lia'), findsOneWidget);
      await enviar(tester);
      final games = repo.saves.single.$2.games;
      expect(games.length, 2);
      expect((games[1].scoreA, games[1].scoreB), (17, 21));
    });

    testWidgets('erro do servidor mantém o placar aberto com a mensagem', (
      tester,
    ) async {
      final repo = await abrir(tester);
      repo.saveError = 'O placar abre quando a partida começar.';

      await lancar(tester);
      await proximo(tester);
      await placar(tester, 0, 1, 0);
      await enviar(tester);

      expect(find.byType(PlacarDigitadoPage), findsOneWidget);
      expect(
          find.text('O placar abre quando a partida começar.'), findsOneWidget);
    });

    testWidgets('abre com o placar gravado e o estado pendente', (
      tester,
    ) async {
      await abrir(tester, salvos: [savedResult()]);
      await tester.pump();

      expect(find.text('2–1'), findsOneWidget);
      expect(
        find.byKey(const Key('booking-result-status-pending')),
        findsOneWidget,
      );
      expect(find.text('Aguardando Enzo, Rafael +1 confirmar'), findsOneWidget);
      expect(inCard(find.text('Maria & Enzo')), findsOneWidget);
    });

    testWidgets(
        'confirmado: editar pergunta antes, porque todos confirmam de novo', (
      tester,
    ) async {
      final repo = await abrir(tester, salvos: [
        savedResult(status: BookingResultStatus.confirmed),
      ]);
      await tester.pump();

      expect(find.text('Confirmado por todos os jogadores'), findsOneWidget);
      await lancar(tester);
      await proximo(tester);
      await tester.tap(find.byKey(const Key('placar-box-0-a')));
      await navegar(tester);
      await teclar(tester, 22);
      await tester.tap(find.byKey(const Key('placar-submit')));
      // O botão fica girando enquanto a pergunta está aberta: sem settle.
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(
        find.text(
            'Os jogadores vão receber o placar para confirmar novamente.'),
        findsOneWidget,
      );
      expect(repo.saves, isEmpty);
      await tester.tap(find.byKey(const Key('lancar-placar-resave-confirm')));
      await navegar(tester);
      expect(repo.saves.single.$2.games.first.scoreA, 22);
    });

    testWidgets('contestado: avisa quem contestou e reabre o editor', (
      tester,
    ) async {
      await abrir(tester, salvos: [
        savedResult(
          status: BookingResultStatus.disputed,
          disputedBy: 'u3',
          disputeReason: 'Dupla errada',
        ),
      ]);
      await tester.pump();

      expect(find.text('Rafael contestou: Dupla errada'), findsOneWidget);
      await lancar(tester);
      await proximo(tester);
      // O placar parte do gravado (21–18, 17–21, 15–12).
      expect(find.text('18'), findsOneWidget);
      expect(find.text('SET 3'), findsOneWidget);
    });
  });
}
