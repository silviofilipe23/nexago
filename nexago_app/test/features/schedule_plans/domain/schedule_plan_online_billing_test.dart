import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/schedule_plans/domain/schedule_plan_logic.dart';
import 'package:nexago_app/features/schedule_plans/domain/schedule_plan_models.dart';

// Cobrança online das mensalidades dos Planos de horário
// (`docs/superpowers/specs/2026-11-03-arena-planos-cobranca-online-design.md`).

ScheduleCharge charge(
  String id, {
  String status = 'open',
  String? billingMode,
  String? paidVia,
  String? type,
  DateTime? due,
  String period = '',
  String? payer,
}) =>
    ScheduleCharge(
      id: id,
      status: status,
      billingMode: billingMode,
      paidVia: paidVia,
      onlineBillingType: type,
      dueDate: due,
      period: period,
      payerAthleteId: payer,
    );

void main() {
  group('leitura', () {
    test('mensalidade online com o espelho do Asaas', () {
      final c = ScheduleCharge.fromMap({
        'chargeId': 'c1',
        'status': 'open',
        'billingMode': 'asaas',
        'asaas': {
          'groupId': 'g1',
          'state': 'open',
          'invoiceUrl': 'https://www.asaas.com/i/abc',
          'status': 'PENDING',
        },
      });
      expect(c.isOnline, isTrue);
      expect(c.asaasState, 'open');
      expect(c.invoiceUrl, 'https://www.asaas.com/i/abc');
      expect(scheduleCanPayOnline(c), isTrue);
    });

    test('paga online: paidVia e forma da fatura', () {
      final c = ScheduleCharge.fromMap({
        'id': 'c1',
        'status': 'paid',
        'billingMode': 'asaas',
        'paidVia': 'asaas',
        'onlineBillingType': 'pix',
        'asaas': {'state': 'paid', 'invoiceUrl': null},
      });
      expect(c.isPaidOnline, isTrue);
      expect(c.onlineBillingType, 'PIX');
      expect(c.invoiceUrl, isNull);
    });

    test('mensalidade antiga (sem os campos) fica manual e sem link', () {
      final c = ScheduleCharge.fromMap({'id': 'c1', 'status': 'open'});
      expect(c.billingMode, isNull);
      expect(c.isOnline, isFalse);
      expect(c.asaasState, isNull);
      expect(scheduleCanPayOnline(c), isFalse);
    });

    test('disponibilidade: onlineBilling; backend antigo = false', () {
      final on = SchedulePlanAvailability.fromMap(
        {'plan': {}, 'onlineBilling': true},
        arenaId: 'a1',
        planId: 'p1',
      );
      final old = SchedulePlanAvailability.fromMap(
        {'plan': {}},
        arenaId: 'a1',
        planId: 'p1',
      );
      expect(on.onlineBilling, isTrue);
      expect(old.onlineBilling, isFalse);
    });
  });

  group('Pagar', () {
    test('só a aberta online', () {
      expect(scheduleCanPayOnline(charge('a', billingMode: 'asaas')), isTrue);
      expect(scheduleCanPayOnline(charge('m', billingMode: 'manual')), isFalse);
      expect(scheduleCanPayOnline(charge('n')), isFalse);
      expect(
        scheduleCanPayOnline(
          charge('p', status: 'paid', billingMode: 'asaas'),
        ),
        isFalse,
      );
    });

    test('pedido de CPF = failed-precondition com a frase exata', () {
      expect(
        scheduleIsCpfRequired(
          code: 'failed-precondition',
          message: 'Informe seu CPF para pagar online.',
        ),
        isTrue,
      );
      expect(
        scheduleIsCpfRequired(
          code: 'failed-precondition',
          message: 'Esta mensalidade é paga direto na arena.',
        ),
        isFalse,
      );
      expect(
        scheduleIsCpfRequired(
          code: 'invalid-argument',
          message: scheduleCpfRequiredMessage,
        ),
        isFalse,
      );
    });
  });

  group('selo e forma', () {
    test('Pago · Pix / Pago · Cartão / Pago online', () {
      ScheduleCharge paid(String? type) =>
          charge('c', status: 'paid', paidVia: 'asaas', type: type);
      expect(schedulePaidOnlineLabel(paid('PIX')), 'Pago · Pix');
      expect(schedulePaidOnlineLabel(paid('CREDIT_CARD')), 'Pago · Cartão');
      expect(schedulePaidOnlineLabel(paid('BOLETO')), 'Pago online');
      expect(schedulePaidOnlineLabel(paid(null)), 'Pago online');
      // Baixa manual não ganha selo online.
      expect(schedulePaidOnlineLabel(charge('m', status: 'paid')), isNull);
      expect(schedulePaidOnlineLabel(charge('o', billingMode: 'asaas')), isNull);
    });

    test('última paga do atleta (vencimento mais tarde)', () {
      final charges = [
        charge('out', status: 'paid', due: DateTime(2026, 11, 5), payer: 'u1'),
        charge('oct', status: 'paid', due: DateTime(2026, 10, 5), payer: 'u1'),
        charge('other', status: 'paid', due: DateTime(2026, 12, 5),
            payer: 'u2'),
        charge('open', due: DateTime(2026, 12, 5), payer: 'u1'),
      ];
      expect(scheduleLastPaidCharge(charges, 'u1')?.id, 'out');
      expect(scheduleLastPaidCharge(const [], 'u1'), isNull);
    });

    test('forma ao lado da mensalidade', () {
      expect(
        scheduleChargeMethodLabel(
          SchedulePaymentMethod.pixAuto,
          charge('a', billingMode: 'asaas'),
        ),
        'Pix ou cartão',
      );
      expect(
        scheduleChargeMethodLabel(
          SchedulePaymentMethod.card,
          charge('m', billingMode: 'manual'),
        ),
        'Pague na arena',
      );
      // A decidir / antiga / sem mensalidade: a forma da assinatura.
      expect(
        scheduleChargeMethodLabel(SchedulePaymentMethod.pixAuto, charge('n')),
        'Pix',
      );
      expect(
        scheduleChargeMethodLabel(SchedulePaymentMethod.onsite, null),
        'Na arena',
      );
    });

    test('nota das formas na assinatura conforme onlineBilling', () {
      expect(
        scheduleMethodNote(SchedulePaymentMethod.pixAuto, onlineBilling: true),
        startsWith('Link mensal: Pix ou cartão'),
      );
      expect(
        scheduleMethodNote(SchedulePaymentMethod.card, onlineBilling: false),
        startsWith('Combine o pagamento com a arena'),
      );
      expect(
        scheduleMethodNote(SchedulePaymentMethod.onsite, onlineBilling: true),
        contains('direto na arena'),
      );
    });
  });
}
