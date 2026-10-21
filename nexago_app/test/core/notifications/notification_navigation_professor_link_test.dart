import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/athlete/domain/athlete_inbox_notification.dart';
import 'package:nexago_app/features/athlete/domain/athlete_notifications_logic.dart';

/// Avisos do vínculo professor ↔ arena (`arenaProfessorNotices` em
/// arena-professor-links.ts): o professor recebe `professor_link_*` com
/// `data = {linkId, linkStatus, webUrl}` — SEM `url` e SEM `arenaId`, para o
/// app antigo não cair na agenda do gestor pelo ramo genérico de arena.
const _types = [
  'professor_link_invite',
  'professor_link_approved',
  'professor_link_rejected',
  'professor_link_suspended',
  'professor_link_reactivated',
  'professor_link_ended',
  'professor_link_permissions_changed',
  'professor_link_court_discount_changed',
];

void main() {
  group('resolveNotificationRoute — vínculo professor ↔ arena', () {
    test('todo professor_link_* abre o vínculo pelo linkId', () {
      for (final type in _types) {
        expect(
          resolveNotificationRoute({
            'type': type,
            'linkId': 'arena-sul_prof-1',
            'linkStatus': 'INVITED',
            'webUrl': '/professor/arenas/arena-sul_prof-1',
          }),
          '/athlete/professor/arenas/arena-sul_prof-1',
          reason: type,
        );
      }
    });

    test('sem linkId cai em Minhas arenas', () {
      expect(
        resolveNotificationRoute({'type': 'professor_link_invite'}),
        AppRoutes.professorArenas,
      );
      expect(
        resolveNotificationRoute({
          'type': 'professor_link_ended',
          'linkId': '  ',
        }),
        '/athlete/professor/arenas',
      );
    });

    test('nunca cai na agenda do gestor, mesmo com arenaId no payload', () {
      final route = resolveNotificationRoute({
        'type': 'professor_link_approved',
        'linkId': 'arena-sul_prof-1',
        'arenaId': 'arena-sul',
      });
      expect(route, isNot(AppRoutes.arenaSchedule));
      expect(route, '/athlete/professor/arenas/arena-sul_prof-1');
    });

    test('o tipo não diferencia maiúsculas; linkId é aparado', () {
      expect(
        resolveNotificationRoute({
          'type': 'PROFESSOR_LINK_INVITE',
          'linkId': ' arena-sul_prof-1 ',
        }),
        AppRoutes.professorArenaLink.replaceAll(':linkId', 'arena-sul_prof-1'),
      );
    });

    test('os avisos da ARENA abrem o vínculo no painel do gestor', () {
      // Lado da arena: ver notification_navigation_arena_professor_test.dart.
      expect(
        resolveNotificationRoute({
          'type': 'arena_professor_request',
          'linkId': 'arena-sul_prof-1',
          'arenaId': 'arena-sul',
          'webUrl': '/painel/profissionais/arena-sul_prof-1',
        }),
        '/arena/professionals/arena-sul_prof-1',
      );
    });

    test('sem sessão, o destino fica pendente para depois do login', () {
      final destination = resolveNotificationTapDestination(
        data: const {
          'type': 'professor_link_invite',
          'linkId': 'arena-sul_prof-1',
        },
        hasSession: false,
      );
      expect(destination?.path, '/athlete/professor/arenas/arena-sul_prof-1');
      expect(destination?.requiresLogin, isTrue);
    });
  });

  group('inbox — vínculo professor ↔ arena', () {
    AthleteInboxNotification item(String type, Map<String, String> data) =>
        AthleteInboxNotification(
          id: 'n1',
          title: 'Convite de arena',
          body: 'Arena Sul convidou você.',
          type: type,
          data: data,
          createdAt: DateTime(2026, 10, 20, 10, 42),
          read: false,
          dismissed: false,
        );

    test('convite: "Ver convite" e o mesmo destino do push', () {
      final presentation = notificationPresentation(
        item('professor_link_invite', {'linkId': 'arena-sul_prof-1'}),
      );
      expect(
          presentation.routePath, '/athlete/professor/arenas/arena-sul_prof-1');
      expect(presentation.actions.map((a) => a.label), ['Ver convite']);
    });

    test('demais avisos abrem o vínculo, sem ação extra', () {
      for (final type in _types.skip(1)) {
        final presentation = notificationPresentation(
          item(type, {'linkId': 'arena-norte_prof-1'}),
        );
        expect(
          presentation.routePath,
          '/athlete/professor/arenas/arena-norte_prof-1',
          reason: type,
        );
        expect(presentation.actions, isEmpty, reason: type);
        expect(presentation.icon, Icons.school_outlined, reason: type);
      }
    });
  });
}
