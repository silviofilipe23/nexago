import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/domain/booking_result.dart';
import 'package:nexago_app/features/arenas/domain/booking_story.dart';
import 'package:nexago_app/features/arenas/domain/booking_story_providers.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_confirmed_athlete.dart';
import 'package:nexago_app/features/arenas/presentation/booking_result_page.dart';
import 'package:nexago_app/features/arenas/presentation/booking_result_score_page.dart';
import 'package:nexago_app/features/arenas/presentation/booking_result_team_page.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/booking_story/booking_result_card.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';

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

Future<void> abrir(
  WidgetTester tester, {
  BookingStorySource? source = galera,
  List<ResultPlayer> busca = const [],
}) async {
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
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: const BookingResultPage(args: args),
      ),
    ),
  );
  await tester.pump();
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
    await tester.tap(find.byKey(const Key('booking-result-save')));
    await navegar(tester);

    expect(inCard(find.text('As brabas')), findsOneWidget);
  });
}
