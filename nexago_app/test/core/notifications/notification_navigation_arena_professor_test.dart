import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/athlete/domain/athlete_inbox_notification.dart';
import 'package:nexago_app/features/athlete/domain/athlete_notifications_logic.dart';

/// Avisos do vínculo professor ↔ arena para a ARENA (`arenaProfessorNotices`
/// em arena-professor-links.ts): dono e gestores recebem `arena_professor_*`
/// com `data = {linkId, arenaId, linkStatus, webUrl}` e nenhum `url`. Sem o
/// caso próprio, o ramo genérico de arena abria a agenda.
const _types = [
  'arena_professor_request',
  'arena_professor_invite_accepted',
  'arena_professor_invite_declined',
  'arena_professor_ended',
];

void main() {
  group('resolveNotificationRoute — vínculo, lado da arena', () {
    test('todo arena_professor_* abre o vínculo no painel', () {
      for (final type in _types) {
        expect(
          resolveNotificationRoute({
            'type': type,
            'linkId': 'arena-cfc_prof-1',
            'arenaId': 'arena-cfc',
            'linkStatus': 'PENDING',
            'webUrl': '/painel/profissionais/arena-cfc_prof-1',
          }),
          '/arena/professionals/arena-cfc_prof-1',
          reason: type,
        );
      }
    });

    test('sem linkId cai na lista de Profissionais, não na agenda', () {
      final route = resolveNotificationRoute({
        'type': 'arena_professor_request',
        'arenaId': 'arena-cfc',
      });
      expect(route, AppRoutes.arenaProfessionals);
      expect(route, isNot(AppRoutes.arenaSchedule));
    });

    test('o lado do professor segue no Minhas arenas', () {
      expect(
        resolveNotificationRoute({
          'type': 'professor_link_approved',
          'linkId': 'arena-cfc_prof-1',
        }),
        '/athlete/professor/arenas/arena-cfc_prof-1',
      );
    });

    test('outros avisos de arena continuam na agenda', () {
      expect(
        resolveNotificationRoute({'type': 'arena_new_follower'}),
        AppRoutes.arenaSchedule,
      );
    });
  });

  group('caixa de avisos', () {
    AthleteInboxNotification notice(String type) => AthleteInboxNotification(
          id: 'n-$type',
          type: type,
          title: 'Nova solicitação de vínculo',
          body: 'Rafael Cunha pediu vínculo como professor independente.',
          createdAt: DateTime(2026, 10, 20, 10),
          read: false,
          dismissed: false,
          data: const {
            'linkId': 'arena-cfc_rafael',
            'arenaId': 'arena-cfc',
            'linkStatus': 'PENDING',
          },
        );

    test('pedido novo: "Analisar" leva ao vínculo', () {
      final presentation =
          notificationPresentation(notice('arena_professor_request'));
      expect(presentation.routePath, '/arena/professionals/arena-cfc_rafael');
      expect(presentation.actions.single.label, 'Analisar');
    });

    test('demais avisos da arena abrem o vínculo, sem botão', () {
      for (final type in _types.skip(1)) {
        final presentation = notificationPresentation(notice(type));
        expect(
          presentation.routePath,
          '/arena/professionals/arena-cfc_rafael',
          reason: type,
        );
        expect(presentation.actions, isEmpty, reason: type);
      }
    });
  });
}
