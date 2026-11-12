import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/athlete/domain/athlete_inbox_notification.dart';
import 'package:nexago_app/features/athlete/domain/athlete_notifications_logic.dart';

/// Pushes dos contratos de aulas (`functions/src/arena-agreements.ts`):
/// - `professor_agreement_pending` → professor: `{agreementId, webUrl}`, sem
///   `url`/`arenaId` de propósito.
/// - `arena_agreement_signed` → arena: `{arenaId, agreementId, webUrl}`.
void main() {
  group('resolveNotificationRoute — contratos de aulas', () {
    test('professor_agreement_pending abre o contrato pelo agreementId', () {
      expect(
        resolveNotificationRoute({
          'type': 'professor_agreement_pending',
          'agreementId': 'ag-prof-1',
          'webUrl': '/professor/arenas',
        }),
        '/contratos-aulas/ag-prof-1',
      );
    });

    test('agreementId é aparado e codificado; tipo ignora maiúsculas', () {
      expect(
        resolveNotificationRoute({
          'type': ' PROFESSOR_AGREEMENT_PENDING ',
          'agreementId': '  ag 1  ',
        }),
        '/contratos-aulas/ag%201',
      );
    });

    test('sem agreementId (ausente, vazio ou só espaços) cai na lista', () {
      for (final data in <Map<String, dynamic>>[
        {'type': 'professor_agreement_pending'},
        {'type': 'professor_agreement_pending', 'agreementId': ''},
        {'type': 'professor_agreement_pending', 'agreementId': '   '},
      ]) {
        expect(resolveNotificationRoute(data), AppRoutes.classAgreements,
            reason: '$data');
      }
    });

    test('professor_agreement_pending nunca cai na agenda do gestor', () {
      final route = resolveNotificationRoute({
        'type': 'professor_agreement_pending',
        'agreementId': 'ag-prof-1',
        'arenaId': 'arena-sul',
      });
      expect(route, isNot(AppRoutes.arenaSchedule));
      expect(route, '/contratos-aulas/ag-prof-1');
    });

    test('arena_agreement_signed abre os profissionais, não a agenda', () {
      final route = resolveNotificationRoute({
        'type': 'arena_agreement_signed',
        'arenaId': 'arena-sul',
        'agreementId': 'ag-prof-1',
        'webUrl': '/painel/contratos',
      });
      expect(route, AppRoutes.arenaProfessionals);
      expect(route, isNot(AppRoutes.arenaSchedule));
    });

    test('sem sessão, o contrato fica pendente para depois do login', () {
      final destination = resolveNotificationTapDestination(
        data: const {
          'type': 'professor_agreement_pending',
          'agreementId': 'ag-prof-1',
        },
        hasSession: false,
      );
      expect(destination?.path, '/contratos-aulas/ag-prof-1');
      expect(destination?.requiresLogin, isTrue);
    });
  });

  group('inbox — contratos de aulas', () {
    AthleteInboxNotification item(String type, Map<String, String> data) =>
        AthleteInboxNotification(
          id: 'n1',
          title: 'Contrato para assinar',
          body: 'Arena Sul enviou seu contrato de professor.',
          type: type,
          data: data,
          createdAt: DateTime(2026, 11, 10, 10, 42),
          read: false,
          dismissed: false,
        );

    test('professor_agreement_pending: "Ler e assinar" e o destino do push',
        () {
      final p = notificationPresentation(
        item('professor_agreement_pending', {'agreementId': 'ag-prof-1'}),
      );
      expect(p.routePath, '/contratos-aulas/ag-prof-1');
      expect(p.actions.map((a) => a.label), ['Ler e assinar']);
      expect(p.actions.single.kind, AthleteNotificationActionKind.primary);
      expect(p.icon, Icons.draw_outlined);
    });

    test('professor_agreement_pending sem id abre a lista de contratos', () {
      final p = notificationPresentation(
        item('professor_agreement_pending', const {}),
      );
      expect(p.routePath, AppRoutes.classAgreements);
    });

    test('arena_agreement_signed no inbox segue o push (profissionais)', () {
      final p = notificationPresentation(
        item('arena_agreement_signed', {
          'arenaId': 'arena-sul',
          'agreementId': 'ag-prof-1',
          'webUrl': '/painel/contratos',
        }),
      );
      expect(p.routePath, AppRoutes.arenaProfessionals);
    });
  });
}
