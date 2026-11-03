import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/schedule_plans/domain/schedule_plan_logic.dart';
import 'package:nexago_app/features/schedule_plans/domain/schedule_plan_models.dart';

SchedulePlanDayAvailability day(int weekday, List<List<Object>> times) =>
    SchedulePlanDayAvailability(
      weekday: weekday,
      times: [
        for (final t in times)
          SchedulePlanTimeOption(
            startTime: t[0] as String,
            endTime: t[1] as String,
            freeCourts: t[2] as int,
            waitlistCount: t.length > 3 ? t[3] as int : 0,
            prime: t.length > 4 && t[4] as bool,
          ),
      ],
    );

ScheduleOccurrence occ(String id, DateTime date,
        {String start = '19:00', ScheduleOccurrenceState? state}) =>
    ScheduleOccurrence(
      bookingId: id,
      date: date,
      startTime: start,
      endTime: '20:00',
      rawState: state,
    );

void main() {
  group('desconto contra o avulso', () {
    test('1 − mensal ÷ (avulso/h × horas × vezes × 52/12), arredondado', () {
      // 70/h × 1h × 2 × 52/12 = 606,67 → 1 − 450/606,67 = 25,8% → 26.
      expect(
        scheduleDiscountVsSinglePercent(
          monthlyPriceReais: 450,
          referenceHourlyReais: 70,
          durationMinutes: 60,
          timesPerWeek: 2,
        ),
        26,
      );
      // 1h30: 60 × 1,5 × 1 × 52/12 = 390 → 1 − 300/390 = 23%.
      expect(
        scheduleDiscountVsSinglePercent(
          monthlyPriceReais: 300,
          referenceHourlyReais: 60,
          durationMinutes: 90,
          timesPerWeek: 1,
        ),
        23,
      );
    });

    test('sem referência ou mais caro que o avulso: nada', () {
      expect(
        scheduleDiscountVsSinglePercent(
          monthlyPriceReais: 450,
          referenceHourlyReais: null,
          durationMinutes: 60,
          timesPerWeek: 2,
        ),
        isNull,
      );
      expect(
        scheduleDiscountVsSinglePercent(
          monthlyPriceReais: 900,
          referenceHourlyReais: 50,
          durationMinutes: 60,
          timesPerWeek: 1,
        ),
        isNull,
      );
    });
  });

  group('vagas', () {
    test('capacidade − ocupadas, nunca negativo', () {
      const plan = SchedulePlan(
          id: 'p', arenaId: 'a', name: 'P', capacity: 10, occupiedCount: 12);
      expect(scheduleSpotsLeft(plan), 0);
    });

    test('rótulos', () {
      expect(scheduleSpotsLabel(12), ('12 vagas', ScheduleSpotsTone.normal));
      expect(scheduleSpotsLabel(6),
          ('Últimas 6 vagas', ScheduleSpotsTone.few));
      expect(scheduleSpotsLabel(1), ('Última vaga', ScheduleSpotsTone.few));
      expect(scheduleSpotsLabel(0),
          ('Lotado · entrar na fila', ScheduleSpotsTone.full));
    });
  });

  group('preço por ciclo e rateio', () {
    test('desconto do ciclo sobre o mensal', () {
      const q = SchedulePlanCycleOption(
          cycle: SchedulePlanCycle.quarterly, enabled: true, discountPercent: 5);
      expect(scheduleCycleMonthlyPrice(450, q), 427.5);
      const m = SchedulePlanCycleOption(
          cycle: SchedulePlanCycle.monthly, enabled: true, discountPercent: 30);
      expect(scheduleCycleMonthlyPrice(450, m), 450);
    });

    test('parte de cada um com 2 casas', () {
      expect(scheduleSharePerPlayer(450, 4), 112.5);
      expect(scheduleSharePerPlayer(428, 3), 142.67);
      expect(scheduleSharePerPlayer(240, 1), 240);
      expect(scheduleSharePerPlayer(240, 0), 240);
    });
  });

  group('horários para os dias escolhidos', () {
    final days = [
      day(2, [
        ['18:00', '19:00', 2],
        ['19:00', '20:00', 0, 7, true],
        ['20:00', '21:00', 3],
      ]),
      day(4, [
        ['18:00', '19:00', 4],
        ['19:00', '20:00', 1, 3, true],
        ['20:00', '21:00', 1],
        ['21:00', '22:00', 3],
      ]),
    ];

    test('só os presentes em todos, com o mínimo de quadras', () {
      final times = scheduleTimesForWeekdays(days, [2, 4]);
      expect(times.map((t) => t.startTime), ['18:00', '19:00', '20:00']);
      expect(times.map((t) => t.freeCourts), [2, 0, 1]);
      // Fila: a maior; nobre: se algum for.
      expect(times[1].waitlistCount, 7);
      expect(times[1].prime, isTrue);
    });

    test('um dia só devolve os horários dele', () {
      expect(scheduleTimesForWeekdays(days, [4]).length, 4);
    });

    test('dia sem disponibilidade ou nenhum escolhido: vazio', () {
      expect(scheduleTimesForWeekdays(days, [2, 5]), isEmpty);
      expect(scheduleTimesForWeekdays(days, const []), isEmpty);
    });

    test('nobre no limite não deixa assinar', () {
      const t = ScheduleCombinedTime(
        startTime: '19:00',
        endTime: '20:00',
        freeCourts: 2,
        waitlistCount: 0,
        prime: true,
      );
      expect(t.bookable(primeCapReached: false), isTrue);
      expect(t.bookable(primeCapReached: true), isFalse);
    });

    test('escolha de dias com limite troca o mais antigo', () {
      expect(scheduleToggleWeekday([2], 4, 2), [2, 4]);
      expect(scheduleToggleWeekday([2, 4], 5, 2), [4, 5]);
      expect(scheduleToggleWeekday([2, 4], 2, 2), [4]);
      expect(scheduleToggleWeekday([3], 5, 1), [5]);
    });

    test('dias escolhíveis vêm da disponibilidade ou das janelas', () {
      const plan = SchedulePlan(
        id: 'p',
        arenaId: 'a',
        name: 'P',
        windows: [
          SchedulePlanWindow(weekday: 6, startTime: '07:00', endTime: '12:00'),
          SchedulePlanWindow(weekday: 7, startTime: '07:00', endTime: '12:00'),
        ],
      );
      expect(scheduleSelectableWeekdays(plan, days), [2, 4]);
      expect(scheduleSelectableWeekdays(plan, const []), [6, 7]);
    });
  });

  group('textos', () {
    test('resumo das janelas', () {
      expect(
        scheduleWindowsSummary([
          for (var w = 1; w <= 5; w++)
            SchedulePlanWindow(weekday: w, startTime: '18:00', endTime: '23:00'),
        ]),
        'Seg–Sex, 18h–23h',
      );
      expect(
        scheduleWindowsSummary(const [
          SchedulePlanWindow(weekday: 6, startTime: '07:00', endTime: '12:30'),
          SchedulePlanWindow(weekday: 7, startTime: '07:00', endTime: '12:30'),
        ]),
        'Sáb, Dom, 7h–12h30',
      );
    });

    test('duração, fim do horário e lista de dias', () {
      expect(scheduleDurationLabel(60), '1h');
      expect(scheduleDurationLabel(90), '1h30');
      expect(scheduleEndTime('19:00', 90), '20:30');
      expect(scheduleWeekdaysList([4, 2]), 'Ter e Qui');
      expect(scheduleWeekdaysList([1, 3, 5]), 'Seg, Qua e Sex');
    });
  });

  group('Meu plano', () {
    final now = DateTime(2026, 11, 3, 10);

    test('estado da ocorrência: o do servidor ou pela data', () {
      expect(scheduleOccurrenceState(occ('a', DateTime(2026, 11, 1)), now),
          ScheduleOccurrenceState.done);
      expect(scheduleOccurrenceState(occ('b', DateTime(2026, 11, 3)), now),
          ScheduleOccurrenceState.today);
      expect(scheduleOccurrenceState(occ('c', DateTime(2026, 11, 5)), now),
          ScheduleOccurrenceState.next);
      expect(
        scheduleOccurrenceState(
          occ('d', DateTime(2026, 11, 5),
              state: ScheduleOccurrenceState.skipped),
          now,
        ),
        ScheduleOccurrenceState.skipped,
      );
    });

    test('destaque pula a desmarcada e a passada', () {
      final list = [
        occ('a', DateTime(2026, 11, 1)),
        occ('b', DateTime(2026, 11, 3), state: ScheduleOccurrenceState.skipped),
        occ('c', DateTime(2026, 11, 5)),
      ];
      expect(scheduleHeroOccurrence(list, now)?.bookingId, 'c');
    });

    test('desmarcáveis: futuras não começadas; aviso em cima da hora', () {
      final list = [
        occ('a', DateTime(2026, 11, 3), start: '09:00'),
        occ('b', DateTime(2026, 11, 3), start: '19:00'),
        occ('c', DateTime(2026, 11, 5), state: ScheduleOccurrenceState.skipped),
        occ('d', DateTime(2026, 11, 10)),
      ];
      final skippable = scheduleSkippableOccurrences(list, now);
      expect(skippable.map((o) => o.bookingId), ['b', 'd']);
      expect(scheduleIsLateNotice(skippable.first, now, noticeHours: 24),
          isTrue);
      expect(scheduleIsLateNotice(skippable.last, now, noticeHours: 24),
          isFalse);
    });

    test('dias de pausa que sobram no ano', () {
      const sub = ScheduleSubscription(
        id: 's',
        arenaId: 'a',
        planId: 'p',
        rules: SchedulePlanRules(pauseMaxDaysPerYear: 30),
        pauseDaysUsedYear: '2026',
        pauseDaysUsed: 12,
      );
      expect(schedulePauseDaysLeft(sub, now), 18);
      // Uso gravado em outro ano não conta.
      expect(schedulePauseDaysLeft(sub, DateTime(2027, 1, 2)), 30);
      const over = ScheduleSubscription(
        id: 's',
        arenaId: 'a',
        planId: 'p',
        pauseDaysUsedYear: '2026',
        pauseDaysUsed: 40,
      );
      expect(schedulePauseDaysLeft(over, now), 0);
    });

    test('titular pelo holderAthleteId ou pelo membro holder', () {
      const sub = ScheduleSubscription(
          id: 's', arenaId: 'a', planId: 'p', holderAthleteId: 'u1');
      expect(scheduleIsHolder(sub, 'u1'), isTrue);
      expect(scheduleIsHolder(sub, 'u2'), isFalse);
      const legacy = ScheduleSubscription(
        id: 's',
        arenaId: 'a',
        planId: 'p',
        members: [
          ScheduleSubscriptionMember(
              athleteId: 'u2', name: 'B', isHolder: true),
        ],
      );
      expect(scheduleIsHolder(legacy, 'u2'), isTrue);
      expect(scheduleIsHolder(legacy, ''), isFalse);
    });

    test('créditos usáveis e próxima cobrança', () {
      final credits = [
        ScheduleCredit(id: 'x', expiresOn: DateTime(2026, 11, 1)),
        ScheduleCredit(id: 'y', expiresOn: DateTime(2026, 12, 1)),
        ScheduleCredit(id: 'z', expiresOn: DateTime(2026, 11, 20)),
        const ScheduleCredit(id: 'w', status: 'used'),
      ];
      expect(scheduleAvailableCredits(credits, now).map((c) => c.id),
          ['z', 'y']);
      final charges = [
        ScheduleCharge(id: 'c2', dueDate: DateTime(2026, 12, 5)),
        ScheduleCharge(
            id: 'c1', dueDate: DateTime(2026, 10, 30), payerAthleteId: 'u1'),
        ScheduleCharge(
            id: 'c0', dueDate: DateTime(2026, 10, 1), status: 'paid'),
        ScheduleCharge(
            id: 'c3', dueDate: DateTime(2026, 10, 1), payerAthleteId: 'u9'),
      ];
      final next = scheduleNextOpenCharge(charges, 'u1')!;
      expect(next.id, 'c1');
      expect(scheduleOverdueDays(next, now), 4);
    });

    test('explicação da desmarcada', () {
      final sub = ScheduleSubscription(
        id: 's',
        arenaId: 'a',
        planId: 'p',
        occurrences: [
          occ('b', DateTime(2026, 11, 10),
              state: ScheduleOccurrenceState.skipped),
          occ('c', DateTime(2026, 11, 17),
              state: ScheduleOccurrenceState.skipped),
        ],
        credits: [
          ScheduleCredit(id: 'b', sourceDate: DateTime(2026, 11, 10)),
        ],
      );
      expect(scheduleSkippedExplanations(sub, now), [
        'Dia 10 você avisou que não vai. Ganhou 1 reposição.',
        'Dia 17 ficou sem jogo, sem reposição.',
      ]);
    });

    test('mensagem do resultado de faltar', () {
      expect(
        scheduleSkipResultMessage(
          const ScheduleSkipResult(reason: ScheduleSkipReason.lateNotice),
          noticeHours: 24,
        ),
        contains('menos de 24h'),
      );
    });
  });
}
