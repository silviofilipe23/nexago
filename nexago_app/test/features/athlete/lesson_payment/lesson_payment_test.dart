import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/domain/lesson_payment/lesson_payment.dart';
import 'package:nexago_app/features/athlete/domain/lesson_payment/lesson_payment_providers.dart';
import 'package:nexago_app/features/athlete/presentation/lesson_payment/lesson_payment_confirmed_page.dart';
import 'package:nexago_app/features/athlete/presentation/lesson_payment/lesson_payment_receipt_page.dart';
import 'package:nexago_app/features/professor_mode/domain/professor_lessons.dart';

/// 21/10/2026 10:32 em São Paulo.
final _paidAt = DateTime.utc(2026, 10, 21, 13, 32);

Map<String, Object?> _doc({
  String status = 'paid',
  String? billingType = 'PIX',
  Map<String, Object?>? receipt,
  bool recurring = true,
}) =>
    {
      'professorUid': 'prof1',
      'professorName': 'Thiago Mendes',
      'athleteId': 'u1',
      'studentName': 'Marcelo Albuquerque',
      'description': 'Mensal 8 aulas',
      'amountReais': 880,
      'dueDate': '2026-11-10',
      'period': '2026-11',
      'recurring': recurring,
      'status': status,
      'billingType': billingType,
      'paymentId': 'pay_e2e8x0q47c21',
      'paidAt': Timestamp.fromDate(_paidAt),
      if (receipt != null) 'receipt': receipt,
    };

LessonPayment _payment({
  String status = 'paid',
  String? billingType = 'PIX',
  Map<String, Object?>? receipt,
  bool recurring = true,
}) =>
    LessonPayment.fromMap(
      'c1',
      _doc(
        status: status,
        billingType: billingType,
        receipt: receipt,
        recurring: recurring,
      ),
    );

ProfessorLesson _lesson(String date, String start, {String id = 'b1'}) =>
    ProfessorLesson.fromMap(id, {
      'bookingId': id,
      'athleteId': 'u1',
      'arenaName': 'Arena Norte',
      'courtName': 'Quadra 2',
      'date': date,
      'startTime': start,
      'endTime': '20:00',
    });

Future<void> _pump(
  WidgetTester tester,
  Widget page, {
  LessonPayment? payment,
  LessonPaymentRecurrence? recurrence,
  ProfessorLesson? next,
}) async {
  tester.view.physicalSize = const Size(1206, 2622);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        lessonPaymentProvider.overrideWith((ref, id) => Stream.value(payment)),
        lessonPaymentRecurrenceProvider
            .overrideWith((ref, id) async => recurrence),
        lessonPaymentNextLessonProvider.overrideWith((ref, id) async => next),
      ],
      child: MaterialApp(
          theme: AppTheme.dark, debugShowCheckedModeBanner: false, home: page),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  setUpAll(() => initializeDateFormatting('pt_BR'));

  group('rótulos', () {
    test('título leva o mês de referência', () {
      expect(lessonPaymentTitle(_payment()), 'Mensal 8 aulas · novembro');
    });

    test('forma de pagamento: Pix, cartão com final e bandeira', () {
      expect(lessonPaymentMethodLabel(_payment()), 'Pix');
      expect(lessonPaymentMethodHint(_payment()), 'Compensado na hora');
      final card = _payment(
        billingType: 'CREDIT_CARD',
        receipt: {'cardLast4': '4471', 'cardBrand': 'VISA'},
      );
      expect(lessonPaymentMethodLabel(card), 'Cartão •••• 4471');
      expect(lessonPaymentMethodHint(card), 'Visa · crédito');
      expect(lessonPaymentMethodLabel(_payment(billingType: null)), 'Online');
    });

    test('data no fuso do evento (paidAt chega em UTC)', () {
      expect(lessonPaymentShortDate(_paidAt), '21 out · 10:32');
      expect(lessonPaymentLongDate(_paidAt), '21 out 2026 · 10:32');
    });

    test('id encurtado sem o prefixo do Asaas', () {
      expect(lessonPaymentShortId('pay_e2e8x0q47c21'), 'E2E···7C21');
      expect(lessonPaymentFullId('pay_e2e8x0q47c21'), 'E2E8X0Q47C21');
      expect(lessonPaymentShortId(null), '—');
    });

    test('valor: inteiro sem centavos, quebrado com', () {
      expect(lessonPaymentAmount(880), r'R$ 880');
      expect(lessonPaymentAmount(1120), r'R$ 1.120');
      expect(lessonPaymentAmount(373.33), r'R$ 373,33');
    });

    test(
        'próxima cobrança: mês seguinte ao último gerado, no dia da '
        'recorrência', () {
      final p = _payment();
      expect(
        lessonPaymentNextChargeLabel(
          p,
          const LessonPaymentRecurrence(dueDay: 10, lastPeriod: '2026-11'),
        ),
        '10 dez',
      );
      // Já gerou dezembro: a próxima é janeiro.
      expect(
        lessonPaymentNextChargeLabel(
          p,
          const LessonPaymentRecurrence(dueDay: 31, lastPeriod: '2027-01'),
        ),
        '28 fev',
      );
      expect(lessonPaymentNextChargeLabel(p, null), isNull);
    });

    test('recorrência lida do registro na carteira', () {
      expect(
          LessonPaymentRecurrence.fromStudentMap({'recurring': null}), isNull);
      final r = LessonPaymentRecurrence.fromStudentMap({
        'recurring': {'dueDay': 10, 'lastPeriod': '2026-11'},
      });
      expect(r?.dueDay, 10);
    });

    test('recibo só aceita https', () {
      expect(_payment(receipt: {'receiptUrl': 'http://x.test'}).receiptUrl,
          isNull);
      expect(
        _payment(receipt: {'receiptUrl': 'https://asaas.test/r'}).receiptUrl,
        'https://asaas.test/r',
      );
    });

    test('próxima aula: só daqui pra frente, em ordem; rótulo', () {
      final now = DateTime.utc(2026, 10, 21, 13, 32); // 10:32 em SP
      final upcoming = lessonPaymentUpcoming([
        _lesson('2026-11-04', '19:00', id: 'b3'),
        _lesson('2026-10-21', '08:00', id: 'b1'),
        _lesson('2026-10-21', '18:00', id: 'b2'),
      ], now);
      expect(upcoming.map((l) => l.bookingId), ['b2', 'b3']);
      expect(
        lessonPaymentLessonLabel(_lesson('2026-11-04', '19:00')),
        'Qua, 04 nov · 19:00 · Quadra 2',
      );
    });
  });

  group('B17 · Pagamento confirmado', () {
    testWidgets('mostra valor, professor, próxima aula e detalhes',
        (tester) async {
      await _pump(
        tester,
        const LessonPaymentConfirmedPage(chargeId: 'c1'),
        payment: _payment(),
        recurrence:
            const LessonPaymentRecurrence(dueDay: 10, lastPeriod: '2026-11'),
        next: _lesson('2026-11-04', '19:00'),
      );
      expect(find.text('Pagamento confirmado'), findsOneWidget);
      expect(
        find.textContaining(r'R$ 880 pagos para Thiago Mendes',
            findRichText: true),
        findsOneWidget,
      );
      expect(find.text('Mensal 8 aulas · novembro'), findsOneWidget);
      expect(find.text('Qua, 04 nov · 19:00 · Quadra 2'), findsOneWidget);
      expect(find.text('Pix'), findsOneWidget);
      expect(find.text('21 out · 10:32'), findsOneWidget);
      expect(find.text('10 dez'), findsOneWidget);
      expect(find.text('E2E···7C21'), findsOneWidget);
      expect(find.text('Ver minhas aulas'), findsOneWidget);
      expect(find.text('Ver comprovante'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('sem recorrência e sem aula marcada: some as linhas',
        (tester) async {
      await _pump(
        tester,
        const LessonPaymentConfirmedPage(chargeId: 'c1'),
        payment: _payment(recurring: false),
      );
      expect(find.text('Próxima cobrança'), findsNothing);
      expect(find.text('PRÓXIMA AULA'), findsNothing);
    });

    testWidgets('webhook ainda não deu baixa: espera confirmando',
        (tester) async {
      await _pump(
        tester,
        const LessonPaymentConfirmedPage(chargeId: 'c1'),
        payment: _payment(status: 'open'),
      );
      expect(find.text('Confirmando pagamento'), findsOneWidget);
      expect(find.text('Pagamento confirmado'), findsNothing);
    });

    testWidgets('cobrança que não é do atleta: não encontrado', (tester) async {
      await _pump(tester, const LessonPaymentConfirmedPage(chargeId: 'c1'));
      expect(find.text('Pagamento não encontrado'), findsOneWidget);
    });
  });

  group('B19 · Comprovante', () {
    testWidgets('cartão com recibo: PDF e compartilhar', (tester) async {
      await _pump(
        tester,
        const LessonPaymentReceiptPage(chargeId: 'c1'),
        payment: _payment(
          billingType: 'CREDIT_CARD',
          receipt: {
            'cardLast4': '4471',
            'cardBrand': 'MASTERCARD',
            'receiptUrl': 'https://asaas.test/r',
            'invoiceNumber': '082417',
          },
        ),
      );
      expect(find.text('Comprovante'), findsOneWidget);
      expect(find.text(r'R$ 880'), findsOneWidget);
      expect(find.text('21 out 2026 · 10:32'), findsOneWidget);
      expect(find.text('Cartão •••• 4471'), findsOneWidget);
      expect(find.text('Marcelo Albuquerque'), findsOneWidget);
      expect(find.text('Thiago Mendes'), findsOneWidget);
      expect(find.text('E2E8X0Q47C21'), findsOneWidget);
      expect(find.text('082417'), findsOneWidget);
      expect(find.text('Baixar PDF'), findsOneWidget);
      expect(find.text('Compartilhar'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('sem recibo do Asaas: só compartilhar', (tester) async {
      await _pump(
        tester,
        const LessonPaymentReceiptPage(chargeId: 'c1'),
        payment: _payment(),
      );
      expect(find.text('Baixar PDF'), findsNothing);
      expect(find.text('Compartilhar'), findsOneWidget);
    });

    testWidgets('ainda em aberto: comprovante indisponível', (tester) async {
      await _pump(
        tester,
        const LessonPaymentReceiptPage(chargeId: 'c1'),
        payment: _payment(status: 'open'),
      );
      expect(find.text('Comprovante indisponível'), findsOneWidget);
    });
  });
}
