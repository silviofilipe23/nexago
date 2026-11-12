import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/class_agreements/domain/class_agreements.dart';

import 'class_agreements_test_support.dart';

const _signupPath = '/aulas/contratar/arena-sul';

Finder _key(String k) => find.byKey(Key(k));

Future<void> _signTwoX(WidgetTester tester) async {
  await tapKey(tester, 'class-plan-mensal-2x');
  await tapKey(tester, 'class-signup-next-plan');
  await tapKey(tester, 'class-teacher-t1');
  await tapKey(tester, 'class-signup-next-teacher');
  await tapKey(tester, 'class-slot-c1:1');
  await tapKey(tester, 'class-slot-c2:2');
  await tapKey(tester, 'class-signup-next-days');
  await tester.drag(_key('class-contract-scroll'), const Offset(0, -5000));
  await settle(tester);
  await tapKey(tester, 'class-signup-sign');
  await tapKey(tester, 'class-sign-agree');
  await tapKey(tester, 'class-sign-confirm');
}

void main() {
  setUpAll(loadClassAgreementFonts);

  test('contagem da vaga segurada', () {
    final now = DateTime.utc(2026, 11, 12, 15, 0, 0);
    expect(countdownLabel(DateTime.utc(2026, 11, 12, 15, 28, 41), now), '28:41');
    expect(countdownLabel(DateTime.utc(2026, 11, 12, 14, 0), now), '00:00');
    expect(countdownLabel(null, now), '');
  });

  test('resultado e pagamento leem o servidor', () {
    final r = ClassEnrollmentResult.fromMap({
      'enrollmentId': 'e1',
      'agreementId': 'a1',
      'pendingPayment': {'until': '2026-11-12T15:30:00Z', 'amountReais': 104, 'paymentForm': 'card'},
    });
    expect(r.pendingPayment!.enrollmentId, 'e1');
    expect(r.pendingPayment!.paymentForm, 'card');
    expect(ClassEnrollmentResult.fromMap({'enrollmentId': 'e1'}).pendingPayment, isNull);
    final p = ClassEnrollmentPayment.fromMap({
      'state': 'ready',
      'amountReais': 104,
      'pix': {'qrCode': '000201', 'qrCodeBase64': 'iVBOR'},
    });
    expect(p.pixCode, '000201');
    expect(ClassEnrollmentPayment.fromMap({'state': 'expired'}).isOver, isTrue);
  });

  testWidgets('Pix: assinar leva ao pagamento; pago confirma a matrícula com a recorrência',
      (tester) async {
    final repo = FakeClassAgreementsRepository()
      ..enrollPendingPayment = {
        'until': DateTime.now().add(const Duration(minutes: 30)).toUtc().toIso8601String(),
        'amountReais': 104,
        'paymentForm': 'pix',
      }
      ..paymentResponses = const [
        {'state': 'preparing', 'amountReais': 104},
        {'state': 'ready', 'amountReais': 104, 'pix': {'qrCode': '00020126pix', 'qrCodeBase64': ''}},
        {'state': 'paid', 'amountReais': 104},
      ];
    await pumpClassAgreementsApp(tester, location: _signupPath, repo: repo, size: const Size(400, 2200));
    await _signTwoX(tester);

    expect(_key('class-signup-payment'), findsOneWidget);
    expect(_key('class-signup-pay-timer'), findsOneWidget);
    expect(_key('class-signup-pay-preparing'), findsOneWidget);
    expect(repo.paymentCalls.first, {'enrollmentId': 'enr-1', 'method': 'pix'});

    await tester.pump(const Duration(seconds: 4));
    await tester.pump();
    expect(find.textContaining('Pix', findRichText: true), findsWidgets);
    expect(_key('class-signup-pay-preparing'), findsNothing);

    await tester.pump(const Duration(seconds: 4));
    await tester.pump();
    await settle(tester);
    expect(_key('class-signup-done'), findsOneWidget);
    expect(find.text('Matrícula confirmada!'), findsOneWidget);
    expect(_key('class-signup-recurrence'), findsOneWidget);
  });

  testWidgets('prazo acabou: volta aos planos e avisa', (tester) async {
    final repo = FakeClassAgreementsRepository()
      ..enrollPendingPayment = {'until': '2026-11-12T15:30:00Z', 'amountReais': 104, 'paymentForm': 'pix'}
      ..paymentResponses = const [
        {'state': 'expired'},
      ];
    await pumpClassAgreementsApp(tester, location: _signupPath, repo: repo, size: const Size(400, 2200));
    await _signTwoX(tester);
    await settle(tester);
    expect(_key('class-signup-plans'), findsOneWidget);
    expect(find.textContaining('prazo para pagar acabou'), findsOneWidget);
  });

  testWidgets('plano esperando pagamento aparece na lista com "Pagar agora"', (tester) async {
    final repo = FakeClassAgreementsRepository(
      options: ClassSignupOptions.fromMap({
        ...signupOptionsJson(),
        'pendingEnrollment': {'enrollmentId': 'enr-9', 'planName': 'Vôlei 2x', 'until': '2099-01-01T00:00:00Z', 'paymentForm': 'card'},
      }),
    )..paymentResponses = const [
        {'state': 'ready', 'amountReais': 104, 'invoiceUrl': 'https://asaas/i/9'},
      ];
    await pumpClassAgreementsApp(tester, location: _signupPath, repo: repo, size: const Size(400, 2200));
    expect(_key('class-signup-pending'), findsOneWidget);
    await tapKey(tester, 'class-signup-pending-pay');
    expect(_key('class-signup-payment'), findsOneWidget);
    expect(repo.paymentCalls.first, {'enrollmentId': 'enr-9', 'method': 'card'});
  });
}
