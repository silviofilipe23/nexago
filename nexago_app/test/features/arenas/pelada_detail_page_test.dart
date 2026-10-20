import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_record.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_record_providers.dart';
import 'package:nexago_app/features/arenas/domain/booking_story_providers.dart';
import 'package:nexago_app/features/arenas/presentation/booking_result_page.dart';
import 'package:nexago_app/features/arenas/presentation/booking_result_score_page.dart';
import 'package:nexago_app/features/arenas/presentation/pelada_detail_page.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';

import 'fake_booking_result_repository.dart';

Finder rich(String text) => find.textContaining(text, findRichText: true);

Future<FakeBookingResultRepository> abrir(
  WidgetTester tester, {
  required String uid,
  List<SavedBookingResult> salvos = const [],
}) async {
  final repo = FakeBookingResultRepository(salvos);
  tester.view.physicalSize = const Size(400, 1600);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        bookingResultRepositoryProvider.overrideWithValue(repo),
        bookingResultUidProvider.overrideWithValue(uid),
        athleteProfileProvider.overrideWith((ref) => Stream.value(null)),
        bookingStorySourceProvider('b1').overrideWith((ref) => null),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: const PeladaDetailPage(bookingId: 'b1'),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
  return repo;
}

void main() {
  setUpAll(() async {
    initializeNexagoEventTimezone();
    await initializeDateFormatting('pt_BR');
  });

  testWidgets('rei da quadra confirmado: hero, classificação e seus jogos', (
    tester,
  ) async {
    await abrir(
      tester,
      uid: 'u1',
      salvos: [
        savedResult(
          status: BookingResultStatus.confirmed,
          result: kingOfCourtResult(),
        ),
      ],
    );

    expect(find.text('SEX 22 MAI · 09:00–10:30'), findsOneWidget);
    expect(find.text('● CONFIRMADO'), findsOneWidget);
    expect(
      find.text('Quadra 1 · Vôlei de praia · 4 duplas, rei da quadra'),
      findsOneWidget,
    );
    expect(find.text('Você venceu a pelada'), findsOneWidget);
    expect(find.text('com Enzo · 7 jogos'), findsOneWidget);
    expect(find.text('Você & Enzo'), findsOneWidget);
    expect(find.text('SEUS JOGOS'), findsOneWidget);
    expect(find.text('vs Diego & Fê'), findsNWidgets(2));
    expect(rich('Placar confirmado por 8 de 8 jogadores'), findsOneWidget);
    expect(rich('Lançado por você'), findsOneWidget);
    // Dono da reserva: editar + compartilhar.
    expect(find.byKey(const Key('pelada-edit')), findsOneWidget);
    expect(find.byKey(const Key('pelada-share')), findsOneWidget);
  });

  testWidgets('duplas: o placar vira "A 2 – 1 B" e os sets', (tester) async {
    await abrir(
      tester,
      uid: 'u3',
      salvos: [savedResult(status: BookingResultStatus.confirmed)],
    );

    expect(find.text('SETS'), findsOneWidget);
    expect(find.byKey(const Key('pelada-sets-score')), findsOneWidget);
    expect(find.text('2 – 1'), findsOneWidget);
    expect(find.text('Você ficou em 2º'), findsOneWidget);
    expect(find.text('SEUS JOGOS'), findsNothing);
    // Participante sem ação: só compartilhar.
    expect(find.byKey(const Key('pelada-share')), findsOneWidget);
    expect(find.byKey(const Key('pelada-edit')), findsNothing);
  });

  testWidgets('pendente para mim: confirmar manda a versão que eu vi', (
    tester,
  ) async {
    final repo = await abrir(
      tester,
      uid: 'u3',
      salvos: [savedResult(version: 4)],
    );

    expect(find.text('◐ AGUARDANDO 3'), findsOneWidget);
    await tester.tap(find.byKey(const Key('pelada-confirm')));
    await tester.pump();
    await tester.pump();

    expect(repo.responses.single, ('b1', true, 4, null));
    expect(find.text('Placar confirmado.'), findsOneWidget);
  });

  testWidgets('contestar exige motivo: chip ou texto', (tester) async {
    final repo = await abrir(tester, uid: 'u3', salvos: [savedResult()]);

    await tester.tap(find.byKey(const Key('pelada-dispute')));
    await tester.pumpAndSettle();
    final send = find.byKey(const Key('pelada-dispute-send'));
    expect(tester.widget<FilledButton>(send).onPressed, isNull);

    await tester.tap(
      find.byKey(const Key('pelada-dispute-reason-Dupla errada')),
    );
    await tester.pump();
    await tester.enterText(
      find.byKey(const Key('pelada-dispute-text')),
      'o Rafael jogou com a Bia',
    );
    await tester.pump();
    await tester.tap(send);
    await tester.pumpAndSettle();

    expect(repo.responses.single.$2, isFalse);
    expect(
      repo.responses.single.$4,
      'Dupla errada: o Rafael jogou com a Bia',
    );
  });

  testWidgets('contestado: faixa com o motivo e "Revisar placar" para o dono', (
    tester,
  ) async {
    await abrir(
      tester,
      uid: 'u1',
      salvos: [
        savedResult(
          status: BookingResultStatus.disputed,
          disputedBy: 'u3',
          disputeReason: 'Placar errado',
        ),
      ],
    );

    expect(find.byKey(const Key('pelada-dispute-banner')), findsOneWidget);
    expect(rich('Rafael contestou: Placar errado'), findsOneWidget);
    await tester.tap(find.byKey(const Key('pelada-review')));
    await tester.pumpAndSettle();
    expect(find.byType(BookingResultScorePage), findsOneWidget);
  });

  testWidgets('quem não jogou vê a confirmada sem reserva nem ação', (
    tester,
  ) async {
    await abrir(
      tester,
      uid: 'u9',
      salvos: [
        savedResult(
          status: BookingResultStatus.confirmed,
          result: kingOfCourtResult(),
        ),
      ],
    );

    expect(find.text('Vitória de Maria & Enzo'), findsOneWidget);
    expect(find.text('SEUS JOGOS'), findsNothing);
    expect(find.byKey(const Key('pelada-booking-link')), findsNothing);
    expect(find.byKey(const Key('pelada-share')), findsOneWidget);
    expect(find.byKey(const Key('pelada-edit')), findsNothing);

    await tester.tap(find.byKey(const Key('pelada-share')));
    await tester.pumpAndSettle();
    expect(find.byType(BookingResultPage), findsOneWidget);
    // Só compartilhar: a arte não oferece "Editar placar".
    expect(find.byKey(const Key('booking-result-edit')), findsNothing);
  });

  testWidgets('reserva com o valor por pessoa para quem jogou', (
    tester,
  ) async {
    await abrir(
      tester,
      uid: 'u2',
      salvos: [savedResult(status: BookingResultStatus.confirmed)],
    );
    expect(rich('#NXG-B1'), findsOneWidget);
    expect(rich('30 por pessoa'), findsOneWidget);
  });

  testWidgets('sem doc (ou sem acesso): "Pelada não encontrada"', (
    tester,
  ) async {
    await abrir(tester, uid: 'u1');
    expect(find.byKey(const Key('pelada-missing')), findsOneWidget);
  });
}
