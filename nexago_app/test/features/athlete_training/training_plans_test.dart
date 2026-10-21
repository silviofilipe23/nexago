import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete_training/domain/training_plans.dart';

void main() {
  test('lê a resposta de getMyTrainingPlans', () {
    final p = MyTrainingPlans.fromMap({
      'arenaPlans': [
        {
          'enrollmentId': 'e1',
          'arenaName': 'Arena CFC',
          'planName': 'Pacote 8',
          'kind': 'package',
          'priceReais': 400,
          'credits': 8,
          'creditsLeft': 3,
          'expiresOn': '2026-11-30',
          'slots': [
            {'className': 'Intermediário B', 'weekday': 4, 'startTime': '19:00'},
          ],
          'makeupCredits': 2,
        },
      ],
      'professorPlans': [
        {'professorUid': 'tm', 'professorName': 'Thiago', 'recurringReais': 880},
      ],
      'payments': [
        {
          'source': 'professor',
          'chargeId': 'pc1',
          'payee': 'Prof. Thiago',
          'description': 'Particular',
          'amountReais': 880,
          'paidOn': '2026-10-21',
        },
      ],
    });
    expect(p.activeCount, 2);
    expect(p.arenaPlans.single.isPackage, isTrue);
    expect(p.arenaPlans.single.creditsLeft, 3);
    expect(p.arenaPlans.single.priceReais, 400.0);
    expect(p.arenaPlans.single.makeupCredits, 2);
    expect(p.professorPlans.single.recurringReais, 880.0);
    expect(p.payments.single.fromProfessor, isTrue);
    expect(MyTrainingPlans.fromMap(const {}).isEmpty, isTrue);
  });

  test('horário da turma', () {
    const s = [
      ArenaPlanSlot(className: 'B', weekday: 4, startTime: '19:00'),
      ArenaPlanSlot(className: 'B', weekday: 2, startTime: '19:00'),
    ];
    expect(arenaPlanScheduleLabel(s), 'Ter e Qui · 19:00');
    expect(
      arenaPlanScheduleLabel(const [
        ArenaPlanSlot(className: 'B', weekday: 1, startTime: '07:00'),
        ArenaPlanSlot(className: 'B', weekday: 3, startTime: '19:00'),
        ArenaPlanSlot(className: 'B', weekday: 5, startTime: '07:00'),
      ]),
      'Seg, Qua e Sex',
    );
    expect(arenaPlanScheduleLabel(const []), '');
  });

  test('rótulos', () {
    expect(arenaPaymentMethodLabel('pix', 'asaas'),
        'Fatura online (Pix ou cartão)');
    expect(arenaPaymentMethodLabel('cash', 'manual'), 'Dinheiro na arena');
    expect(trainingPlanKindLabel('package'), 'Pacote');
    expect(trainingPlanShortDate('2026-10-15'), '15 out');
  });
}
