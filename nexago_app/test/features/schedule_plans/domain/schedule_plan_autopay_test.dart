import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/schedule_plans/domain/schedule_plan_logic.dart';
import 'package:nexago_app/features/schedule_plans/domain/schedule_plan_models.dart';

ScheduleCharge chargeWith(Map<String, dynamic>? autopay) =>
    ScheduleCharge.fromMap({
      'chargeId': 'c1',
      'status': 'open',
      if (autopay != null) 'autopay': autopay,
    });

void main() {
  test('ScheduleCharge.fromMap lê o autopay; sem o mapa fica null', () {
    final c = chargeWith({
      'state': 'retry',
      'scheduledFor': '2026-12-06',
      'attempts': 1,
      'brand': 'VISA',
      'last4': '4242',
      'chargedReais': null,
    });
    expect(c.autopay!.state, 'retry');
    expect(c.autopay!.scheduledFor, '2026-12-06');
    expect(c.autopay!.attempts, 1);
    expect(c.autopay!.brand, 'VISA');
    expect(c.autopay!.last4, '4242');
    expect(c.autopay!.chargedReais, isNull);
    expect(chargeWith(null).autopay, isNull);
  });

  test('autopayFor lê autopay.<uid>', () {
    final sub = ScheduleSubscription.fromMap({
      'arenaId': 'a1',
      'planId': 'p1',
      'autopay': {
        'u1': {'enabled': true, 'brand': 'VISA', 'last4': '4242'},
      },
    }, id: 's1');
    expect(sub.autopayFor('u1')!.enabled, isTrue);
    expect(sub.autopayFor('u1')!.last4, '4242');
    expect(sub.autopayFor('u2'), isNull);
  });

  test('rótulos da mensalidade', () {
    String? label(String state) => scheduleAutopayChargeLabel(chargeWith({
          'state': state,
          'scheduledFor': '2026-12-05',
          'last4': '4242',
        }));
    expect(label('scheduled'), 'Será debitada em 05/12 no cartão final 4242');
    expect(label('retry'), 'Será debitada em 05/12 no cartão final 4242');
    expect(label('charging'), 'Debitando no cartão final 4242…');
    expect(label('failed'), 'Não conseguimos debitar. Pague por Pix ou cartão.');
    expect(label('paid'), 'Paga no cartão final 4242');
    expect(label('skipped'), isNull);
    expect(scheduleAutopayChargeLabel(chargeWith(null)), isNull);
  });

  test('texto da autorização soma as porcentagens e usa vírgula', () {
    final text = scheduleAutopayConsentText(
      planName: 'Fixo Noite 1x',
      arenaName: 'Arena CFC',
      cardLabel: 'Visa final 4242',
      preview: const ScheduleAutopayPreview(
        cardFeePercent: 1.5,
        cardProcessingPercent: 3.99,
        cardFixedReais: 0.49,
      ),
    );
    expect(
      text,
      'Autorizo a nexaGO a debitar no cartão Visa final 4242, no dia do '
      'vencimento, cada mensalidade do plano Fixo Noite 1x (Arena CFC), mais '
      'a taxa do cartão (5,49% + R\$ 0,49). Posso desligar quando quiser em '
      'Meu plano.',
    );
  });

  test('preview lê a próxima mensalidade', () {
    final p = ScheduleAutopayPreview.fromMap({
      'brand': 'VISA',
      'last4': '4242',
      'cardFeePercent': 1.5,
      'cardProcessingPercent': 3.99,
      'cardFixedReais': 0.49,
      'next': {
        'chargeId': 'c1',
        'dueDate': '2026-12-05',
        'amountReais': 300,
        'cardFeeReais': 12.46,
        'chargedReais': 312.46,
      },
    });
    expect(p.next!.chargedReais, 312.46);
    expect(ScheduleAutopayPreview.fromMap({}).next, isNull);
  });
}
