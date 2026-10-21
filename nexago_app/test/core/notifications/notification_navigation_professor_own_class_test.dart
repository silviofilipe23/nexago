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

    test('sem url, ainda abre Minhas turmas', () {
      expect(
        resolveNotificationRoute(const {
          'type': 'professor_own_class_ended',
          'professorClassId': 'oc-1',
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
