import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/app_mobile_role.dart';
import 'package:nexago_app/core/auth/role_route_guard.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/athlete/domain/athlete_inbox_notification.dart';
import 'package:nexago_app/features/athlete/domain/athlete_notifications_logic.dart';

/// Pushes da carteira do professor independente
/// (`functions/src/professor-wallet.ts`): cobrança e convite.
const _invoice = 'https://www.asaas.com/i/prof123';

AthleteInboxNotification _inbox(String type, Map<String, String> data) =>
    AthleteInboxNotification(
      id: 'n1',
      title: 'Aviso',
      body: '...',
      type: type,
      data: data,
      read: false,
      dismissed: false,
      createdAt: DateTime(2026, 10, 20, 9),
    );

void main() {
  group('professor_charge_link', () {
    const payload = <String, String>{
      'type': 'professor_charge_link',
      'chargeId': 'c1',
      'invoiceUrl': _invoice,
      'webUrl': _invoice,
      'url': '/discover?tab=agenda',
    };

    test('o toque abre a fatura; plano B é a agenda', () {
      expect(externalNotificationUrl(payload), _invoice);
      expect(resolveNotificationRoute(payload), athleteAgendaTabLocation);
    });

    test('no inbox: "Pagar" com a fatura', () {
      final p =
          notificationPresentation(_inbox('professor_charge_link', payload));
      expect(p.externalUrl, _invoice);
      expect(p.actions.single.label, 'Pagar');
      expect(p.routePath, athleteAgendaTabLocation);
    });
  });

  group('professor_student_invite', () {
    test('segue o url do payload', () {
      expect(
        resolveNotificationRoute(const {
          'type': 'professor_student_invite',
          'url': '/convite-professor/prof-1',
        }),
        '/convite-professor/prof-1',
      );
    });

    test('sem url, monta pelo professorUid', () {
      expect(
        resolveNotificationRoute(const {
          'type': 'professor_student_invite',
          'professorUid': 'prof-1',
        }),
        AppRoutes.professorStudentInvite.replaceAll(':professorUid', 'prof-1'),
      );
    });

    test('no inbox: "Ver convite" leva à tela do convite', () {
      final p = notificationPresentation(_inbox(
        'professor_student_invite',
        const {'url': '/convite-professor/prof-1'},
      ));
      expect(p.actions.single.label, 'Ver convite');
      expect(p.routePath, '/convite-professor/prof-1');
    });

    test('a tela do convite é do modo Atleta', () {
      expect(isAthleteExperiencePath('/convite-professor/prof-1'), isTrue);
      expect(
        redirectForActiveRole(
          path: '/convite-professor/prof-1',
          activeRole: AppMobileRole.athlete,
          availableRoles: const [AppMobileRole.athlete],
          needsRoleSelection: false,
        ),
        isNull,
      );
    });
  });

  group('professor_charge_paid', () {
    const payload = <String, String>{
      'type': 'professor_charge_paid',
      'chargeId': 'c1',
      'url': '/discover?tab=agenda',
    };

    test('abre "Pagamento confirmado" pelo chargeId (url é do app antigo)', () {
      expect(externalNotificationUrl(payload), isNull);
      expect(resolveNotificationRoute(payload), '/pagamento-aula/c1');
      expect(
        resolveNotificationRoute(const {'type': 'professor_charge_paid'}),
        athleteAgendaTabLocation,
      );
    });

    test('no inbox: "Ver pagamento" leva à confirmação', () {
      final p = notificationPresentation(_inbox('professor_charge_paid', payload));
      expect(p.actions.single.label, 'Ver pagamento');
      expect(p.routePath, '/pagamento-aula/c1');
    });

    test('confirmação e comprovante são do modo Atleta', () {
      expect(isAthleteExperiencePath('/pagamento-aula/c1'), isTrue);
      expect(isAthleteExperiencePath('/pagamento-aula/c1/comprovante'), isTrue);
    });
  });
}
