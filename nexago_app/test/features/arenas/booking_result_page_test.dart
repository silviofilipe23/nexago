import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/domain/booking_result.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_record.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_record_providers.dart';
import 'package:nexago_app/features/arenas/domain/booking_story.dart';
import 'package:nexago_app/features/arenas/domain/booking_story_providers.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_confirmed_athlete.dart';
import 'package:nexago_app/features/arenas/presentation/booking_result_page.dart';
import 'package:nexago_app/features/arenas/presentation/booking_result_score_page.dart';
import 'package:nexago_app/features/arenas/presentation/booking_result_team_page.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/booking_story/booking_result_card.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';

import 'fake_booking_result_repository.dart';

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
}) async {
  final repo = FakeBookingResultRepository(salvos);
  tester.view.physicalSize = const Size(400, 1400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        athleteProfileProvider.overrideWith((ref) => Stream.value(maria)),
        bookingStorySourceProvider('b1').overrideWith((ref) => source),
        bookingResultPlayerSearchProvider.overrideWith(
          (ref, query) async => busca,
        ),
        bookingResultRepositoryProvider.overrideWithValue(repo),
        bookingResultUidProvider.overrideWithValue('u1'),
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

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
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

  testWidgets('lança o placar: o resumo e a arte mostram os sets', (
    tester,
  ) async {
    await abrir(tester);

    await tester.tap(find.byKey(const Key('booking-result-edit')));
    await navegar(tester);
    expect(find.byType(BookingResultScorePage), findsOneWidget);

    // Três toques seguidos sem quadro no meio: nenhum pode se perder.
    for (var i = 0; i < 3; i++) {
      await tester.tap(find.byKey(const Key('SET 1-a-plus')));
    }
    await tester.tap(find.byKey(const Key('SET 1-b-plus')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('booking-result-save')));
    await navegar(tester);

    expect(find.byType(BookingResultPage), findsOneWidget);
    expect(find.text('1–0'), findsOneWidget);
    expect(find.text('3–1'), findsOneWidget);
    expect(find.text('VITÓRIA'), findsOneWidget);
    expect(cardResult(tester).games.single.scoreA, 3);
  });

  testWidgets('chip "Sets" desligado tira os sets; "Placar" tira o bloco', (
    tester,
  ) async {
    await abrir(tester);

    // Os dois times mostram o 0 do set + o 0 de sets vencidos.
    expect(inCard(find.text('0')), findsNWidgets(4));
    await tester.tap(find.byKey(const Key('booking-result-info-sets')));
    await tester.pump();
    expect(inCard(find.text('0')), findsNWidgets(2));

    await tester.tap(find.byKey(const Key('booking-result-info-score')));
    await tester.pump();
    expect(inCard(find.text('Maria & Enzo')), findsNothing);
  });

  testWidgets('sozinho na reserva: o outro lado é "Adversários"', (
    tester,
  ) async {
    await abrir(tester, source: null);

    expect(inCard(find.text('Maria')), findsOneWidget);
    expect(inCard(find.text('Adversários')), findsOneWidget);
  });

  testWidgets(
    'terceira dupla com avulsos vira rotação: classificação, jogos e sem Sets',
    (tester) async {
      await abrir(tester);

      await tester.tap(find.byKey(const Key('booking-result-edit')));
      await navegar(tester);
      await tester.tap(find.byKey(const Key('booking-result-add-team')));
      await navegar(tester);
      expect(find.byType(BookingResultTeamPage), findsOneWidget);
      expect(find.text('Escolha mais 2'), findsOneWidget);

      for (final nome in ['Bruno', 'Carol']) {
        await tester.enterText(
          find.byKey(const Key('booking-result-team-search')),
          nome,
        );
        await tester.pump();
        await tester.tap(find.byKey(const Key('booking-result-add-guest')));
        await tester.pump();
      }
      expect(find.text('Bruno & Carol'), findsOneWidget);
      await tester.tap(find.byKey(const Key('booking-result-team-done')));
      await navegar(tester);

      expect(find.text('CLASSIFICAÇÃO'), findsOneWidget);
      expect(find.text('JOGOS'), findsOneWidget);
      // Placar zerado não grava: o servidor recusaria.
      await tester.tap(find.byKey(const Key('JOGO 1-a-plus')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('booking-result-save')));
      await navegar(tester);

      expect(cardResult(tester).isRotation, isTrue);
      expect(find.byKey(const Key('booking-result-info-sets')), findsNothing);
      expect(inCard(find.text('Bruno & Carol')), findsOneWidget);
    },
  );

  testWidgets('montar time: quem já joga em outro time não dá para escolher', (
    tester,
  ) async {
    await abrir(tester);

    await tester.tap(find.byKey(const Key('booking-result-edit')));
    await navegar(tester);
    await tester.tap(find.byKey(const Key('booking-result-add-team')));
    await navegar(tester);

    expect(find.text('Já em Maria & Enzo'), findsNWidgets(2));
    await tester.tap(find.byKey(const Key('booking-result-player-u2')));
    await tester.pump();
    expect(find.text('Escolha mais 2'), findsOneWidget);
  });

  testWidgets('montar time: busca de atletas do app entra na lista', (
    tester,
  ) async {
    await abrir(
      tester,
      busca: const [ResultPlayer(id: 'u9', name: 'Gabi Rocha')],
    );

    await tester.tap(find.byKey(const Key('booking-result-edit')));
    await navegar(tester);
    await tester.tap(find.byKey(const Key('booking-result-add-team')));
    await navegar(tester);

    await tester.enterText(
      find.byKey(const Key('booking-result-team-search')),
      'Gab',
    );
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump();

    expect(find.text('Gabi Rocha'), findsOneWidget);
    expect(find.text('Atleta nexaGO'), findsOneWidget);
  });

  testWidgets('editar um time pela classificação e renomear', (tester) async {
    await abrir(tester);

    await tester.tap(find.byKey(const Key('booking-result-edit')));
    await navegar(tester);
    await tester.tap(find.byKey(const Key('booking-result-team-1')));
    await navegar(tester);
    expect(find.text('Editar time'), findsOneWidget);

    await tester.tap(find.byKey(const Key('booking-result-team-rename')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('booking-result-team-name-field')),
      'As brabas',
    );
    await tester.tap(find.text('Salvar'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('booking-result-team-done')));
    await navegar(tester);
    await tester.tap(find.byKey(const Key('SET 1-b-plus')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('booking-result-save')));
    await navegar(tester);

    expect(inCard(find.text('As brabas')), findsOneWidget);
  });

  group('placar salvo', () {
    testWidgets('o aviso cita quem confirma e o Salvar grava o placar', (
      tester,
    ) async {
      final repo = await abrir(tester);

      await tester.tap(find.byKey(const Key('booking-result-edit')));
      await navegar(tester);
      // Galera com conta: Rafael e Lia (u3, u4) estão no outro time.
      expect(
        rich('Rafael e Lia recebem o placar para confirmar. Só depois ele '
            'conta no seu histórico.'),
        findsOneWidget,
      );

      await tester.tap(find.byKey(const Key('SET 1-a-plus')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('booking-result-save')));
      await navegar(tester);

      expect(find.byType(BookingResultPage), findsOneWidget);
      expect(repo.saves.single.$1, 'b1');
      expect(repo.saves.single.$2.games.single.scoreA, 1);
      expect(
        [for (final p in repo.saves.single.$2.teams[1].players) p.id],
        ['u3', 'u4'],
      );
    });

    testWidgets('avulso do outro lado: o aviso diz que não conta', (
      tester,
    ) async {
      await abrir(tester, source: null);

      await tester.tap(find.byKey(const Key('booking-result-edit')));
      await navegar(tester);
      expect(rich('Ninguém do outro lado tem conta no nexaGO'), findsOneWidget);
    });

    testWidgets('placar zerado não grava e a tela fica', (tester) async {
      final repo = await abrir(tester);

      await tester.tap(find.byKey(const Key('booking-result-edit')));
      await navegar(tester);
      await tester.tap(find.byKey(const Key('booking-result-save')));
      await tester.pump();

      expect(repo.saves, isEmpty);
      expect(find.byType(BookingResultScorePage), findsOneWidget);
      expect(find.text('Lance o placar de pelo menos um set.'), findsOneWidget);
    });

    testWidgets('erro do servidor mantém o editor aberto com a mensagem', (
      tester,
    ) async {
      final repo = await abrir(tester);
      repo.saveError = 'O placar abre quando a partida começar.';

      await tester.tap(find.byKey(const Key('booking-result-edit')));
      await navegar(tester);
      await tester.tap(find.byKey(const Key('SET 1-a-plus')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('booking-result-save')));
      await tester.pump();

      expect(find.byType(BookingResultScorePage), findsOneWidget);
      expect(find.text('O placar abre quando a partida começar.'), findsOneWidget);
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
      expect(find.text('Aguardando Rafael confirmar'), findsOneWidget);
      expect(inCard(find.text('Maria & Enzo')), findsOneWidget);
    });

    testWidgets('confirmado: mostra quem confirmou e não edita mais', (
      tester,
    ) async {
      await abrir(tester, salvos: [
        savedResult(
          status: BookingResultStatus.confirmed,
          respondedByName: 'Rafael Souza',
        ),
      ]);
      await tester.pump();

      expect(
        find.text('Confirmado por Rafael · já conta no seu histórico'),
        findsOneWidget,
      );
      expect(find.byKey(const Key('booking-result-edit')), findsNothing);
      await tester.tap(find.text('2–1'));
      await tester.pump();
      expect(find.byType(BookingResultScorePage), findsNothing);
      expect(find.text('Placar confirmado: ele não muda mais.'), findsOneWidget);
    });

    testWidgets('contestado: avisa quem contestou e reabre o editor', (
      tester,
    ) async {
      await abrir(tester, salvos: [
        savedResult(
          status: BookingResultStatus.disputed,
          respondedByName: 'Rafael Souza',
        ),
      ]);
      await tester.pump();

      expect(find.text('Rafael contestou · corrija e envie de novo'), findsOneWidget);
      await tester.tap(find.byKey(const Key('booking-result-edit')));
      await navegar(tester);
      expect(find.byType(BookingResultScorePage), findsOneWidget);
      // O editor parte do placar gravado (21–18, 17–21, 15–12).
      expect(find.text('18'), findsOneWidget);
      expect(find.text('SET 3'), findsOneWidget);
    });
  });
}
