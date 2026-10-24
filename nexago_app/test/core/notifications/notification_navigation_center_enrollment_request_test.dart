import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';
import 'package:nexago_app/core/router/routes.dart';

/// Payloads reais de `functions/src/training-center-enrollment-requests.ts`
/// (`pushStudent` / `pushStaff`).
void main() {
  group('aluno: resposta do pedido', () {
    test('abre Minha matrícula', () {
      expect(
        resolveNotificationRoute({
          'type': centerEnrollmentRequestNotificationType,
          'centerId': 'ct1',
          'enrollmentId': 'e1',
          'requestId': 'r1',
        }),
        '/treinos/centro/ct1/matricula/e1',
      );
      expect(
        AppRoutes.athleteTrainingCenterEnrollment,
        '/treinos/centro/:centerId/matricula/:enrollmentId',
      );
    });

    test('sem matrícula: aba Plano do centro; sem centro: Treinos', () {
      expect(
        resolveNotificationRoute({
          'type': 'training_center_enrollment_request',
          'centerId': 'ct1',
        }),
        '/treinos/centro/ct1?aba=plano',
      );
      expect(
        resolveNotificationRoute({
          'type': 'training_center_enrollment_request',
        }),
        AppRoutes.athleteTrainings,
      );
    });
  });

  group('gestão: pedido novo', () {
    test('abre o detalhe do pedido', () {
      expect(
        resolveNotificationRoute({
          'type': centerEnrollmentRequestStaffNotificationType,
          'centerId': 'ct1',
          'requestId': 'r1',
        }),
        '/athlete/professor/centros/ct1/pedidos/r1',
      );
    });

    test('sem pedido: a lista; sem centro: a agenda do centro', () {
      expect(
        resolveNotificationRoute({
          'type': 'training_center_enrollment_request_staff',
          'centerId': 'ct1',
        }),
        '/athlete/professor/centros/ct1/pedidos',
      );
      expect(
        resolveNotificationRoute({
          'type': 'training_center_enrollment_request_staff',
        }),
        AppRoutes.centerCoachAgenda,
      );
    });

    test('com sessão, o toque abre direto', () {
      final dest = resolveNotificationTapDestination(
        data: {
          'type': centerEnrollmentRequestStaffNotificationType,
          'centerId': 'ct1',
          'requestId': 'r1',
        },
        hasSession: true,
      );
      expect(dest?.path, '/athlete/professor/centros/ct1/pedidos/r1');
    });
  });
}
