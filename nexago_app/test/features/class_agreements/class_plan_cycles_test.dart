import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/class_agreements/domain/class_agreements.dart';

import 'class_agreements_test_support.dart';

const _signupPath = '/aulas/contratar/arena-sul';

Finder _key(String k) => find.byKey(Key(k));

/// Mensal 2x com trimestral (R$ 260/mês) e anual (R$ 238/mês); pacote sem ciclo.
List<Map<String, Object?>> _plansWithCycles() => [
      {
        'planId': 'mensal-2x',
        'name': 'Beach Tennis 2x',
        'kind': 'monthly',
        'priceReais': 280,
        'classesPerWeek': 2,
        'makeupsPerMonth': 2,
        'teacherIds': ['t1', 't2'],
        'cycles': [
          {'cycle': 'monthly', 'months': 1, 'monthlyPriceReais': 280, 'totalReais': 280},
          {'cycle': 'quarterly', 'months': 3, 'monthlyPriceReais': 260, 'totalReais': 780},
          {'cycle': 'annual', 'months': 12, 'monthlyPriceReais': 238, 'totalReais': 2856},
        ],
      },
      {
        'planId': 'pacote-10',
        'name': 'Pacote 10 aulas',
        'kind': 'package',
        'priceReais': 450,
        'credits': 10,
        'validityDays': 60,
        'teacherIds': ['t1'],
      },
    ];

void main() {
  setUpAll(loadClassAgreementFonts);

  group('ciclos — domínio', () {
    final options = buildSignupOptions(plans: _plansWithCycles());
    final mensal = options.plan('mensal-2x')!;
    final pacote = options.plan('pacote-10')!;

    test('lê os ciclos e calcula o desconto sobre o mensal', () {
      expect(mensal.cycles.map((c) => c.cycle), ['monthly', 'quarterly', 'annual']);
      expect(mensal.hasLongCycles, isTrue);
      expect(pacote.cycles, isEmpty);
      expect(pacote.hasLongCycles, isFalse);
      expect(cycleDiscountPercent(mensal, mensal.cycles[0]), 0);
      expect(cycleDiscountPercent(mensal, mensal.cycles[1]), 7);
      expect(cycleDiscountPercent(mensal, mensal.cycles[2]), 15);
      expect(cycleLabel('semiannual'), 'Semestral');
      expect(cyclePeriodSuffix('annual'), 'por ano');
    });

    test('ciclo que o plano não tem cai no mensal; pacote não tem ciclo', () {
      expect(cycleOptionOf(mensal, 'annual')!.months, 12);
      expect(cycleOptionOf(mensal, 'semiannual')!.cycle, 'monthly');
      expect(cycleOptionOf(pacote, 'annual'), isNull);
    });

    test('prévia lê o ciclo; servidor antigo sem o campo = mensal', () {
      expect(
        ClassEnrollmentPreview.fromMap(const {'agreement': {}, 'cycle': 'quarterly'}).cycle,
        'quarterly',
      );
      expect(ClassEnrollmentPreview.fromMap(const {'agreement': {}}).cycle, 'monthly');
    });
  });

  group('ciclos — contratar', () {
    testWidgets('escolher o anual mostra o total do ano e manda o ciclo na prévia e na assinatura',
        (tester) async {
      final repo = FakeClassAgreementsRepository(
        options: buildSignupOptions(plans: _plansWithCycles()),
      );
      await pumpClassAgreementsApp(tester, location: _signupPath, repo: repo, size: const Size(400, 2000));

      expect(_key('class-cycle-picker'), findsNothing);
      await tapKey(tester, 'class-plan-mensal-2x');
      expect(_key('class-cycle-picker'), findsOneWidget);
      expect(find.text('Anual · −15%'), findsOneWidget);

      await tapKey(tester, 'class-cycle-annual');
      expect(find.textContaining('2.856,00'), findsWidgets);
      expect(find.textContaining('por ano'), findsOneWidget);

      await tapKey(tester, 'class-signup-next-plan');
      await tapKey(tester, 'class-teacher-t1');
      await tapKey(tester, 'class-signup-next-teacher');
      await tapKey(tester, 'class-slot-c1:1');
      await tapKey(tester, 'class-slot-c2:2');
      await tapKey(tester, 'class-signup-next-days');
      expect(repo.previewCalls.last['cycle'], 'annual');

      await tester.drag(_key('class-contract-scroll'), const Offset(0, -5000));
      await settle(tester);
      await tapKey(tester, 'class-signup-sign');
      await tapKey(tester, 'class-sign-agree');
      await tapKey(tester, 'class-sign-confirm');
      expect(repo.lastEnroll!['cycle'], 'annual');
    });

    testWidgets('trocar de plano volta o ciclo para o mensal; pacote não mostra ciclos',
        (tester) async {
      final repo = FakeClassAgreementsRepository(
        options: buildSignupOptions(plans: _plansWithCycles()),
      );
      await pumpClassAgreementsApp(tester, location: _signupPath, repo: repo, size: const Size(400, 2000));

      await tapKey(tester, 'class-plan-mensal-2x');
      await tapKey(tester, 'class-cycle-quarterly');
      await tapKey(tester, 'class-plan-pacote-10');
      expect(_key('class-cycle-picker'), findsNothing);
      await tapKey(tester, 'class-plan-mensal-2x');
      final chip = tester.widget(_key('class-cycle-monthly'));
      expect((chip as dynamic).selected, isTrue);
    });
  });
}
