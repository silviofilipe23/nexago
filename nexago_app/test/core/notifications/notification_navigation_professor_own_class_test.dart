import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';
import 'package:nexago_app/core/router/routes.dart';

/// Pushes da turma própria do professor independente
/// (`functions/src/professor-own-classes.ts`).
void main() {
  group('professor_own_class_ended', () {
    test('segue o url do payload (Minhas turmas)', () {
      expect(
        resolveNotificationRoute(const {
          'type': professorOwnClassEndedNotificationType,
          'professorClassId': 'oc-1',
          'url': '/professor/mais/turmas',
        }),
        AppRoutes.professorClasses,
      );
    });

    test('url do detalhe (série mexida pela arena) abre a turma', () {
      expect(
        resolveNotificationRoute(const {
          'type': professorOwnClassEndedNotificationType,
          'professorClassId': 'oc-1',
          'url': '/professor/mais/turmas/propria/oc-1',
        }),
        AppRoutes.professorOwnClass.replaceAll(':classId', 'oc-1'),
      );
    });

    test('sem url, o detalhe pelo professorClassId', () {
      expect(
        resolveNotificationRoute(const {
          'type': 'professor_own_class_ended',
          'professorClassId': 'oc-1',
        }),
        '/professor/mais/turmas/propria/oc-1',
      );
    });

    test('sem url nem turma, Minhas turmas', () {
      expect(
        resolveNotificationRoute(const {
          'type': 'professor_own_class_ended',
        }),
        AppRoutes.professorClasses,
      );
    });
  });

  group('professor_own_class_recurring', () {
    test('o gestor cai nos horários fixos, não na agenda do dia', () {
      expect(
        resolveNotificationRoute(const {
          'type': professorOwnClassRecurringNotificationType,
          'arenaId': 'arena-norte',
          'professorClassId': 'oc-1',
        }),
        AppRoutes.arenaRecurring,
      );
    });
  });
}
