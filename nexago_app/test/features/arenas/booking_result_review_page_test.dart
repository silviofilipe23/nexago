import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_record.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_record_providers.dart';
import 'package:nexago_app/features/arenas/presentation/booking_result_review_page.dart';

import 'fake_booking_result_repository.dart';

Future<FakeBookingResultRepository> abrir(
  WidgetTester tester, {
  required String uid,
  List<SavedBookingResult> salvos = const [],
}) async {
  tester.view.physicalSize = const Size(400, 1000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  final repo = FakeBookingResultRepository(salvos);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        bookingResultRepositoryProvider.overrideWithValue(repo),
        bookingResultUidProvider.overrideWithValue(uid),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: const BookingResultReviewPage(bookingId: 'b1'),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
  return repo;
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  testWidgets('adversário vê o placar e confirma a versão que viu', (
    tester,
  ) async {
    final repo =
        await abrir(tester, uid: 'u3', salvos: [savedResult(version: 4)]);

    expect(find.text('Maria Alves lançou o placar'), findsOneWidget);
    expect(find.text('Rafael & Lia (você)'), findsOneWidget);
    expect(find.text('21–18'), findsOneWidget);
    expect(find.text('SET 3'), findsOneWidget);
    expect(find.textContaining('Com a sua confirmação'), findsOneWidget);

    await tester.tap(find.byKey(const Key('booking-result-confirm')));
    await tester.pump();

    expect(repo.responses.single, ('b1', true, 4));
    expect(find.text('Placar confirmado.'), findsOneWidget);
  });

  testWidgets('contestar pede confirmação antes de enviar', (tester) async {
    final repo = await abrir(tester, uid: 'u3', salvos: [savedResult()]);

    await tester.tap(find.byKey(const Key('booking-result-dispute')));
    await tester.pumpAndSettle();
    expect(find.text('Contestar o placar?'), findsOneWidget);
    expect(find.textContaining('Maria recebe o aviso'), findsOneWidget);

    await tester.tap(find.text('Voltar'));
    await tester.pumpAndSettle();
    expect(repo.responses, isEmpty);

    await tester.tap(find.byKey(const Key('booking-result-dispute')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('booking-result-dispute-confirm')));
    await tester.pumpAndSettle();
    expect(repo.responses.single, ('b1', false, 1));
  });

  testWidgets('erro da callable aparece e os botões voltam', (tester) async {
    final repo = await abrir(tester, uid: 'u3', salvos: [savedResult()]);
    repo.respondError = 'O placar mudou. Confira de novo antes de responder.';

    await tester.tap(find.byKey(const Key('booking-result-confirm')));
    await tester.pump();

    expect(find.text('O placar mudou. Confira de novo antes de responder.'),
        findsOneWidget);
    expect(find.text('Confirmar placar'), findsOneWidget);
  });

  testWidgets('a resposta de outro adversário chega ao vivo e tira os botões', (
    tester,
  ) async {
    final repo = await abrir(tester, uid: 'u3', salvos: [savedResult()]);
    expect(find.byKey(const Key('booking-result-confirm')), findsOneWidget);

    repo.emit([
      savedResult(
          status: BookingResultStatus.confirmed,
          respondedByName: 'Rafael Souza'),
    ]);
    await tester.pump();
    await tester.pump();

    expect(find.byKey(const Key('booking-result-confirm')), findsNothing);
    // Quem confirmou foi o próprio Rafael (u3).
    expect(
      find.text('Você confirmou · conta no histórico de quem jogou'),
      findsOneWidget,
    );
  });

  testWidgets('companheiro de time só acompanha', (tester) async {
    await abrir(tester, uid: 'u2', salvos: [savedResult()]);

    expect(find.byKey(const Key('booking-result-confirm')), findsNothing);
    expect(find.byKey(const Key('booking-result-dispute')), findsNothing);
    expect(find.text('Aguardando Rafael confirmar'), findsOneWidget);
  });

  testWidgets('quem lançou vê o contestado e pode editar', (tester) async {
    await abrir(tester, uid: 'u1', salvos: [
      savedResult(
          status: BookingResultStatus.disputed,
          respondedByName: 'Rafael Souza'),
    ]);

    expect(find.text('Você lançou o placar'), findsOneWidget);
    expect(find.text('Rafael contestou · corrija e envie de novo'),
        findsOneWidget);
    expect(find.byKey(const Key('booking-result-review-edit')), findsOneWidget);
  });

  testWidgets('confirmado não tem botão nem para quem lançou', (tester) async {
    await abrir(tester, uid: 'u1', salvos: [
      savedResult(
          status: BookingResultStatus.confirmed,
          respondedByName: 'Rafael Souza'),
    ]);

    expect(find.byKey(const Key('booking-result-review-edit')), findsNothing);
    expect(find.byKey(const Key('booking-result-confirm')), findsNothing);
  });

  testWidgets('placar que não está na lista do atleta', (tester) async {
    await abrir(tester, uid: 'u9');

    expect(
        find.byKey(const Key('booking-result-review-missing')), findsOneWidget);
  });
}
