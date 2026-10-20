import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/athlete/domain/athlete_inbox_notification.dart';
import 'package:nexago_app/features/athlete/domain/athlete_notifications_logic.dart';

/// Payload real do push da fatura (`ensureClassAsaasPayment` em
/// `functions/src/asaas-class-billing.ts`).
const _invoice = 'https://www.asaas.com/i/abc123';
const _payload = <String, String>{
  'type': 'arena_class_charge_link',
  'groupId': 'e1_first',
  'arenaId': 'arena1',
  'invoiceUrl': _invoice,
  'webUrl': _invoice,
  'url': '/discover?tab=agenda',
};

AthleteInboxNotification _inbox(Map<String, String> data) {
  return AthleteInboxNotification(
    id: 'n1',
    title: 'Mensalidade disponível',
    body:
        'Mensal 2x · Novembro · R\$ 180,00. Toque para pagar com PIX ou cartão.',
    type: 'arena_class_charge_link',
    data: data,
    read: false,
    dismissed: false,
    createdAt: DateTime(2026, 10, 20, 9),
  );
}

void main() {
  group('externalNotificationUrl — fatura da mensalidade de aula', () {
    test('devolve a fatura do payload', () {
      expect(externalNotificationUrl(_payload), _invoice);
    });

    test('sem invoiceUrl usa o webUrl (mesma fatura)', () {
      expect(
        externalNotificationUrl({
          'type': 'arena_class_charge_link',
          'webUrl': _invoice,
        }),
        _invoice,
      );
    });

    test('só abre http(s) absoluto', () {
      for (final bad in ['/discover?tab=agenda', 'javascript:alert(1)', '']) {
        expect(
          externalNotificationUrl({
            'type': 'arena_class_charge_link',
            'invoiceUrl': bad,
          }),
          isNull,
          reason: bad,
        );
      }
    });

    test('outros tipos não abrem nada fora do app', () {
      expect(
        externalNotificationUrl({..._payload, 'type': 'booking_invite'}),
        isNull,
      );
    });
  });

  group('resolveNotificationRoute — mensalidade de aula', () {
    test('plano B é a agenda do atleta, nunca a agenda do gestor', () {
      final route = resolveNotificationRoute(_payload);
      expect(route, athleteAgendaTabLocation);
      expect(route, isNot(AppRoutes.arenaSchedule));
    });

    test('payload antigo, sem url, também vai para a agenda do atleta', () {
      expect(
        resolveNotificationRoute({
          'type': 'arena_class_charge_link',
          'arenaId': 'arena1',
          'invoiceUrl': _invoice,
        }),
        athleteAgendaTabLocation,
      );
    });
  });

  group('inbox — mensalidade de aula', () {
    test('"Pagar" abre a fatura; a rota fica de plano B', () {
      final p = notificationPresentation(_inbox(_payload));
      expect(p.externalUrl, _invoice);
      expect(p.routePath, athleteAgendaTabLocation);
      expect(p.actions.single.label, 'Pagar');
      expect(p.actions.single.kind, AthleteNotificationActionKind.primary);
    });

    test('sem link não oferece "Pagar" e leva à agenda', () {
      final p = notificationPresentation(
        _inbox(const {'groupId': 'g1', 'arenaId': 'arena1'}),
      );
      expect(p.externalUrl, isNull);
      expect(p.actions, isEmpty);
      expect(p.routePath, athleteAgendaTabLocation);
    });
  });
}
