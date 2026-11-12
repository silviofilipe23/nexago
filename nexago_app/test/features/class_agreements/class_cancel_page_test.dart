import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/class_agreements/domain/class_agreements.dart';

import 'class_agreements_test_support.dart';

const _path = '/aulas/cancelar/enr-7';

Finder _key(String k) => find.byKey(Key(k));

Future<void> _toSummary(WidgetTester tester) async {
  expect(_key('class-cancel-reason'), findsOneWidget);
  await tapKey(tester, 'class-cancel-reason-routine');
  await tapKey(tester, 'class-cancel-next');
}

void main() {
  setUpAll(loadClassAgreementFonts);

  test('a conta da multa vem do servidor', () {
    final q = ClassCancellationQuote.fromMap({
      'kind': 'commitment',
      'endsOn': '2027-01-04',
      'remainingMonths': 2,
      'monthlyPriceReais': 234,
      'penalty': {'kind': 'percent', 'percent': 50, 'amountReais': 234},
    });
    expect(q.hasPenalty, isTrue);
    expect(q.penaltyFormula((v) => 'R\$ $v'), '2 × R\$ 234.0 × 50%');
    expect(ClassCancellationQuote.fromMap({'kind': 'prepaid', 'endsOn': '2027-06-30'}).hasPenalty, isFalse);
  });

  testWidgets('sem motivo não avança', (tester) async {
    final repo = FakeClassAgreementsRepository();
    await pumpClassAgreementsApp(tester, location: _path, repo: repo, size: const Size(400, 1400));
    expect(buttonEnabled(tester, 'class-cancel-next'), isFalse);
    await tapKey(tester, 'class-cancel-reason-price');
    expect(buttonEnabled(tester, 'class-cancel-next'), isTrue);
  });

  testWidgets('fidelidade: mostra a multa, confirma e leva ao pagamento da multa', (tester) async {
    final repo = FakeClassAgreementsRepository()
      ..paymentResponses = const [
        {'state': 'paid', 'amountReais': 234},
      ];
    await pumpClassAgreementsApp(tester, location: _path, repo: repo, size: const Size(400, 1600));
    await _toSummary(tester);

    expect(_key('class-cancel-summary'), findsOneWidget);
    expect(_key('class-cancel-penalty'), findsOneWidget);
    expect(find.textContaining('04/01'), findsWidgets);
    expect(find.textContaining('Fidelidade até 18/02'), findsOneWidget);

    await tapKey(tester, 'class-cancel-confirm');
    expect(repo.lastCancel, {'enrollmentId': 'enr-7', 'reason': 'routine', 'note': null});
    await settle(tester);
    expect(repo.paymentCalls.first, {'enrollmentId': 'enr-7', 'method': 'pix', 'kind': 'penalty'});
    await settle(tester);
    expect(_key('class-cancel-done'), findsOneWidget);
    expect(find.text('Cancelamento agendado'), findsOneWidget);
    expect(find.text('Paga'), findsOneWidget);
  });

  testWidgets('pagar depois: agendado com a multa em aberto', (tester) async {
    final repo = FakeClassAgreementsRepository();
    await pumpClassAgreementsApp(tester, location: _path, repo: repo, size: const Size(400, 1600));
    await _toSummary(tester);
    await tapKey(tester, 'class-cancel-confirm');
    expect(_key('class-signup-payment'), findsOneWidget);
    expect(find.text('Cancelamento registrado'), findsOneWidget);
    await tapKey(tester, 'class-cancel-pay-later');
    expect(_key('class-cancel-done'), findsOneWidget);
    expect(find.textContaining('Em aberto · pague em Cobranças até 08/12'), findsOneWidget);
  });

  testWidgets('mensal sem fidelidade: sem multa, vai direto ao agendado', (tester) async {
    final repo = FakeClassAgreementsRepository()
      ..cancelQuote = const {
        'kind': 'monthly', 'endsOn': '2027-01-04', 'requestedOn': '2026-12-05', 'noticeDays': 30,
        'monthlyPriceReais': 234, 'penalty': {'kind': 'none', 'amountReais': 0},
      };
    await pumpClassAgreementsApp(tester, location: _path, repo: repo, size: const Size(400, 1600));
    await _toSummary(tester);
    expect(_key('class-cancel-penalty'), findsNothing);
    expect(find.text('Sem multa'), findsOneWidget);
    await tapKey(tester, 'class-cancel-confirm');
    expect(repo.paymentCalls, isEmpty);
    expect(_key('class-cancel-done'), findsOneWidget);
  });

  testWidgets('anual à vista: fim do período pago, sem multa', (tester) async {
    final repo = FakeClassAgreementsRepository()
      ..cancelQuote = const {
        'kind': 'prepaid', 'endsOn': '2027-06-30', 'requestedOn': '2026-12-05', 'noticeDays': 30,
        'penalty': {'kind': 'none', 'amountReais': 0},
      };
    await pumpClassAgreementsApp(tester, location: _path, repo: repo, size: const Size(400, 1600));
    await _toSummary(tester);
    expect(find.textContaining('Plano anual à vista'), findsOneWidget);
    expect(_key('class-cancel-penalty'), findsNothing);
  });

  testWidgets('multa na arena (sem cobrança online): agendado sem tela de pagamento', (tester) async {
    final repo = FakeClassAgreementsRepository()..cancelPenaltyOnline = false;
    await pumpClassAgreementsApp(tester, location: _path, repo: repo, size: const Size(400, 1600));
    await _toSummary(tester);
    await tapKey(tester, 'class-cancel-confirm');
    expect(_key('class-cancel-done'), findsOneWidget);
    expect(find.textContaining('pague na arena até 08/12'), findsOneWidget);
  });

  testWidgets('continuar com o plano volta sem cancelar', (tester) async {
    final repo = FakeClassAgreementsRepository();
    await pumpClassAgreementsApp(tester, location: _path, repo: repo, size: const Size(400, 1600));
    await _toSummary(tester);
    await tapKey(tester, 'class-cancel-keep');
    expect(repo.lastCancel, isNull);
    expect(find.text('meus planos'), findsOneWidget);
  });
}
