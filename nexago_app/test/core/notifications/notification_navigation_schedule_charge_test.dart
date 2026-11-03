import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/athlete/domain/athlete_inbox_notification.dart';
import 'package:nexago_app/features/athlete/domain/athlete_notifications_logic.dart';

/// Payload do push do link da mensalidade do Plano de horário
/// (`functions/src/arena-schedule-asaas.ts`).
const _invoice = 'https://www.asaas.com/i/sched1';
const _payload = <String, String>{
  'type': 'schedule_plan_charge_link',
  'chargeId': 's1_2026-12_0',
  'subscriptionId': 's1',
  'arenaId': 'arena1',
  'invoiceUrl': _invoice,
  'webUrl': _invoice,
  'url': '/meus-planos-horario',
};

AthleteInboxNotification _inbox(Map<String, String> data) {
  return AthleteInboxNotification(
    id: 'n1',
    title: 'Mensalidade do plano disponível',
    body: 'Toque para pagar com Pix ou cartão.',
    type: schedulePlanChargeLinkNotificationType,
    data: data,
    read: false,
    dismissed: false,
    createdAt: DateTime(2026, 12, 1, 9),
  );
}

void main() {
  test('o tipo é o do backend', () {
    expect(schedulePlanChargeLinkNotificationType, 'schedule_plan_charge_link');
  });

  test('toque abre Meu plano, não a fatura', () {
    expect(resolveNotificationRoute(_payload), AppRoutes.mySchedulePlans);
    expect(externalNotificationUrl(_payload), isNull);
  });

  test('sem url também vai para Meu plano, nunca a agenda do gestor', () {
    final route = resolveNotificationRoute({
      'type': 'schedule_plan_charge_link',
      'arenaId': 'arena1',
    });
    expect(route, AppRoutes.mySchedulePlans);
    expect(route, isNot(AppRoutes.arenaSchedule));
  });

  test('inbox: "Pagar" leva a Meu plano', () {
    final p = notificationPresentation(_inbox(_payload));
    expect(p.routePath, AppRoutes.mySchedulePlans);
    expect(p.externalUrl, isNull);
    expect(p.actions.single.label, 'Pagar');
    expect(p.actions.single.kind, AthleteNotificationActionKind.primary);
  });
}
