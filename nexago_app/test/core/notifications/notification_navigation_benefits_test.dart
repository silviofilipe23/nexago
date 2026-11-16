import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';
import 'package:nexago_app/features/athlete/domain/athlete_inbox_notification.dart';
import 'package:nexago_app/features/athlete/domain/athlete_notifications_logic.dart';
import 'package:nexago_app/features/benefits_club/domain/benefit_event.dart';

/// Pushes do Clube de Vantagens (`functions/src/benefits-club-admin.ts`):
/// `url` = `/athlete/clube/<id>?origem=push`.
void main() {
  const types = [
    'benefit_partner_new',
    'benefit_partner_ending',
    'benefit_expiry_reminder',
  ];

  for (final type in types) {
    test('$type: o url abre o parceiro com a origem push', () {
      final route = resolveNotificationRoute({
        'type': type,
        'url': '/athlete/clube/fast-acai?origem=push',
        'partnerId': 'fast-acai',
      });
      expect(route, '/athlete/clube/fast-acai?origem=push');
      final uri = Uri.parse(route!);
      expect(
        BenefitSource.fromQuery(uri.queryParameters[BenefitSource.queryParam]),
        BenefitSource.push,
      );
    });
  }

  test('sem url, monta pelo partnerId; sem os dois, abre o clube', () {
    expect(
      resolveNotificationRoute({
        'type': 'benefit_partner_new',
        'partnerId': 'fast-acai',
      }),
      '/athlete/clube/fast-acai?origem=push',
    );
    expect(
      resolveNotificationRoute({'type': 'benefit_partner_ending'}),
      '/athlete/clube?origem=push',
    );
  });

  test('no inbox, o toque segue a mesma rota', () {
    final n = AthleteInboxNotification(
      id: 'n1',
      title: 'Novo no Clube de Vantagens',
      body: 'Fast Açaí: 10% OFF',
      type: 'benefit_partner_new',
      data: const {
        'url': '/athlete/clube/fast-acai?origem=push',
        'partnerId': 'fast-acai',
      },
      read: false,
      dismissed: false,
      createdAt: DateTime(2026, 11, 16),
    );
    expect(
      notificationPresentation(n).routePath,
      '/athlete/clube/fast-acai?origem=push',
    );
  });
}
