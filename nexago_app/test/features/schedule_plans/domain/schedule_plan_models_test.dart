import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/schedule_plans/domain/schedule_plan_models.dart';

void main() {
  group('SchedulePlan.fromMap', () {
    test('doc vazio vira os padrões do spec', () {
      final plan = SchedulePlan.fromMap('p1', const {}, arenaId: 'a1');
      expect(plan.id, 'p1');
      expect(plan.arenaId, 'a1');
      expect(plan.name, 'Plano');
      expect(plan.timesPerWeek, 1);
      expect(plan.durationMinutes, 60);
      expect(plan.capacity, 0);
      expect(plan.referenceHourlyReais, isNull);
      expect(plan.windows, isEmpty);
      // Sem `cycles`: só o mensal ligado.
      expect(plan.enabledCycles.map((c) => c.cycle),
          [SchedulePlanCycle.monthly]);
      // Sem `billing.methods`: na arena.
      expect(plan.billingMethods, [SchedulePaymentMethod.onsite]);
      expect(plan.dueDay, 5);
      expect(plan.rules.makeupEnabled, isTrue);
      expect(plan.rules.makeupNoticeHours, 24);
      expect(plan.rules.splitMaxPlayers, 4);
      expect(plan.rules.pauseMaxDaysPerYear, 30);
    });

    test('lê o doc completo e ignora método e janela inválidos', () {
      final plan = SchedulePlan.fromMap('p2', {
        'name': ' Fixo Noite 2x ',
        'status': 'active',
        'timesPerWeek': 2,
        'durationMinutes': 90,
        'windows': [
          {'weekday': 1, 'startTime': '18:00', 'endTime': '23:00'},
          {'weekday': 9, 'startTime': '18:00', 'endTime': '23:00'},
          'lixo',
        ],
        'capacity': 20,
        'occupiedCount': 14,
        'monthlyPriceReais': 450,
        'referenceHourlyReais': 0,
        'cycles': {
          'monthly': {'enabled': true},
          'quarterly': {'enabled': true, 'discountPercent': 80},
          'annual': {'enabled': false, 'discountPercent': 10},
        },
        'billing': {
          'methods': ['pix_auto', 'boleto', 'card'],
          'dueDay': 10,
        },
        'rules': {
          'makeup': {'enabled': false},
          'split': {'enabled': true, 'maxPlayers': 3},
        },
      });
      expect(plan.name, 'Fixo Noite 2x');
      expect(plan.windows, hasLength(1));
      // Avulso 0 = sem referência.
      expect(plan.referenceHourlyReais, isNull);
      expect(plan.enabledCycles.map((c) => c.cycle),
          [SchedulePlanCycle.monthly, SchedulePlanCycle.quarterly]);
      // Desconto limitado a 50%.
      expect(plan.enabledCycles[1].discountPercent, 50);
      expect(plan.billingMethods,
          [SchedulePaymentMethod.pixAuto, SchedulePaymentMethod.card]);
      expect(plan.dueDay, 10);
      expect(plan.rules.makeupEnabled, isFalse);
      expect(plan.rules.splitMaxPlayers, 3);
      // `pause` ausente com `rules` gravado: desligada.
      expect(plan.rules.pauseEnabled, isFalse);
    });
  });

  group('MyScheduleSubscriptions.fromMap', () {
    test('resposta vazia ou estranha não quebra', () {
      expect(MyScheduleSubscriptions.fromMap(const {}).isEmpty, isTrue);
      expect(
        MyScheduleSubscriptions.fromMap({'subscriptions': 'x', 'offers': 3})
            .isEmpty,
        isTrue,
      );
    });

    test('assinatura com campos faltando ganha padrões', () {
      final data = MyScheduleSubscriptions.fromMap({
        'subscriptions': [
          {
            'id': 's1',
            'arenaId': 'a1',
            'planId': 'p1',
            'status': 'algo-novo',
            'occurrences': [
              {'bookingId': 'b2', 'date': '2026-11-05', 'startTime': '19:00'},
              {
                'bookingId': 'b1',
                'date': '2026-11-03',
                'startTime': '19:00',
                'status': 'skipped',
              },
            ],
            'charges': [
              {'id': 'c1', 'amountReais': '112.5', 'dueDate': '2026-11-05'},
            ],
            'pauseDaysUsed': {'year': '2026', 'days': 4},
          },
        ],
        'offers': [
          {
            'id': 'w1',
            'planId': 'p1',
            'weekdays': [4, 2],
            'startTime': '19:00',
            'status': 'offered',
            'offer': {
              'courtName': 'Quadra 2',
              'expiresAt': {'_seconds': 1793700000, '_nanoseconds': 0},
            },
          },
          {'id': 'w2', 'status': 'expired'},
        ],
      });
      final sub = data.subscriptions.single;
      expect(sub.id, 's1');
      expect(sub.status, ScheduleSubscriptionStatus.active);
      expect(sub.cycle, SchedulePlanCycle.monthly);
      expect(sub.paymentMethod, SchedulePaymentMethod.onsite);
      // Ordenadas por data.
      expect(sub.occurrences.map((o) => o.bookingId), ['b1', 'b2']);
      expect(sub.occurrences.first.rawState, ScheduleOccurrenceState.skipped);
      expect(sub.occurrences.last.rawState, isNull);
      expect(sub.occurrences.last.endTime, '00:00');
      expect(sub.charges.single.amountReais, 112.5);
      expect(sub.charges.single.dueDate, DateTime(2026, 11, 5));
      expect(sub.pauseDaysUsed, 4);
      // Só a oferta em aberto.
      final offer = data.offers.single;
      expect(offer.entryId, 'w1');
      expect(offer.weekdays, [2, 4]);
      expect(offer.courtName, 'Quadra 2');
      expect(offer.expiresAt,
          DateTime.fromMillisecondsSinceEpoch(1793700000 * 1000));
    });
  });

  group('spDateTime / spDate', () {
    test('aceita ISO, milissegundos e mapa de segundos', () {
      expect(spDateTime('2026-11-03T22:00:00.000Z')!.isUtc, isFalse);
      expect(spDateTime(0), DateTime.fromMillisecondsSinceEpoch(0));
      expect(spDateTime({'seconds': 10}),
          DateTime.fromMillisecondsSinceEpoch(10000));
      expect(spDateTime('nada'), isNull);
      expect(spDate('2026-11-03'), DateTime(2026, 11, 3));
      expect(spDate(null), isNull);
    });
  });

  group('respostas das callables', () {
    test('skip sem reason usa o creditId', () {
      expect(ScheduleSkipResult.fromMap({'creditId': 'c1'}).reason,
          ScheduleSkipReason.granted);
      expect(ScheduleSkipResult.fromMap(const {}).reason,
          ScheduleSkipReason.disabled);
      expect(ScheduleSkipResult.fromMap({'reason': 'late_notice'}).reason,
          ScheduleSkipReason.lateNotice);
    });

    test('firstCharge como mapa ou número', () {
      final a = ScheduleSubscribeResult.fromMap({
        'subscriptionId': 's1',
        'firstCharge': {'amountReais': 80, 'dueDate': '2026-11-10'},
      });
      expect(a.firstChargeReais, 80);
      expect(a.firstChargeDueDate, DateTime(2026, 11, 10));
      final b = ScheduleSubscribeResult.fromMap({'firstCharge': 55.5});
      expect(b.firstChargeReais, 55.5);
      final c = ScheduleSubscribeResult.fromMap({'firstCharge': null});
      expect(c.firstChargeReais, isNull);
    });

    test('disponibilidade ordena dias e descarta inválidos', () {
      final a = SchedulePlanAvailability.fromMap({
        'primeCapReached': true,
        'days': [
          {
            'weekday': 4,
            'times': [
              {'startTime': '19:00', 'endTime': '20:00', 'freeCourts': 2},
            ],
          },
          {'weekday': 2},
          {'weekday': 0},
        ],
      }, arenaId: 'a1', planId: 'p1');
      expect(a.primeCapReached, isTrue);
      expect(a.days.map((d) => d.weekday), [2, 4]);
      expect(a.days.last.times.single.freeCourts, 2);
      expect(a.plan.id, 'p1');
    });
  });
}
