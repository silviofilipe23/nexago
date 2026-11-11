import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_quote.dart';
import 'package:nexago_app/features/schedule_plans/domain/schedule_plan_logic.dart';
import 'package:nexago_app/features/schedule_plans/domain/schedule_plan_models.dart';

SchedulePlan _plan(String? mode) => SchedulePlan.fromMap('p1', {
      'name': 'Manhã',
      if (mode != null) 'bookingMode': mode,
      'timesPerWeek': 2,
      'durationMinutes': 60,
      'windows': [
        for (final w in [1, 2, 3, 4, 5])
          {'weekday': w, 'startTime': '06:00', 'endTime': '12:00'},
      ],
    });

void main() {
  group('modo do plano', () {
    test('ausente = fixo; flexible = livre', () {
      expect(_plan(null).isFlexible, isFalse);
      expect(_plan('fixed').isFlexible, isFalse);
      expect(_plan('flexible').isFlexible, isTrue);
    });

    test('subtítulo do livre fala de horário livre', () {
      expect(schedulePlanSubtitle(_plan('flexible')),
          'Horário livre · até 2x por semana · 1h cada · Seg–Sex, 6h–12h');
      expect(schedulePlanSubtitle(_plan(null)),
          '2x por semana · 1h · Seg–Sex, 6h–12h');
    });

    test('mistura de planos muda o texto da lista', () {
      expect(schedulePlansMix([_plan(null)]), SchedulePlansMix.fixed);
      expect(schedulePlansMix([_plan('flexible')]), SchedulePlansMix.flexible);
      expect(schedulePlansMix([_plan(null), _plan('flexible')]),
          SchedulePlansMix.mixed);
      expect(schedulePlansEntryLine(SchedulePlansMix.flexible),
          contains('quando quiser'));
      expect(
          schedulePlansIntro(SchedulePlansMix.fixed, arenaDefinesCourt: false)
              .title,
          'Seu horário,\ntoda semana.');
    });
  });

  test('assinatura livre lê janelas e usos da semana', () {
    final sub = ScheduleSubscription.fromMap({
      'id': 's1',
      'planSnapshot': {
        'bookingMode': 'flexible',
        'timesPerWeek': 3,
        'windows': [
          {'weekday': 6, 'startTime': '07:00', 'endTime': '12:00'},
        ],
      },
      'weekUsage': {'used': 3, 'timesPerWeek': 3},
    });
    expect(sub.isFlexible, isTrue);
    expect(sub.windows.single.weekday, 6);
    expect(sub.weekUsage!.left, 0);
    expect(scheduleWeekUsageLabel(sub.weekUsage!),
        'Semana completa: 3 de 3 usados nesta semana');
    expect(
      scheduleFlexRuleText(
          timesPerWeek: 1, durationMinutes: 90, windows: sub.windows),
      'Você reserva quando quiser, até 1 vez por semana (1h30 cada), dentro de: Sáb, 7h–12h.',
    );
  });

  group('cotação com plano de horário livre', () {
    test('coberta pelo plano: nada a pagar, linha e uso da semana', () {
      const q = ArenaBookingQuote(
        amountReais: 0,
        lineItems: [],
        schedulePlanName: 'Manhã',
        schedulePlanTimesPerWeek: 2,
        schedulePlanUsesLeft: 2,
        scheduleFlexMinutes: 60,
        scheduleFlexDiscountReais: 80,
      );
      expect(q.coveredByPlanCoverage, isTrue);
      expect(q.amountBeforeMemberHoursReais, 80);
      expect(q.planCoverageLineLabel, 'Manhã · 1h');
      expect(q.planCoverageValueLabel, '−R\$ 80,00');
      expect(q.schedulePlanNotice,
          'Usa 1 dos 2 horários da semana: depois desta, resta 1.');
    });

    test('fora do plano ou semana esgotada: aviso e preço normal', () {
      const outside = ArenaBookingQuote(
        amountReais: 80,
        lineItems: [],
        schedulePlanTimesPerWeek: 2,
        schedulePlanUsesLeft: 2,
        schedulePlanBlockedReason: 'outside_window',
      );
      expect(outside.coveredByPlanCoverage, isFalse);
      expect(outside.schedulePlanNoticeIsWarning, isTrue);
      expect(outside.schedulePlanNotice, contains('fora do seu plano'));
      const exhausted = ArenaBookingQuote(
        amountReais: 80,
        lineItems: [],
        schedulePlanTimesPerWeek: 2,
        schedulePlanBlockedReason: 'exhausted',
      );
      expect(exhausted.schedulePlanNotice, contains('acabaram'));
      const none = ArenaBookingQuote(amountReais: 80, lineItems: []);
      expect(none.schedulePlanNotice, isNull);
    });
  });
}
