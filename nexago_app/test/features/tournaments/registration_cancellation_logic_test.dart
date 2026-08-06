import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';
import 'package:nexago_app/features/athlete/domain/athlete_inbox_notification.dart';
import 'package:nexago_app/features/athlete/domain/athlete_notifications_logic.dart';
import 'package:nexago_app/features/tournaments/domain/my_tournaments_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_logic.dart';

MyTournamentRegistration _registration({
  bool isPaid = false,
  bool hasPartialPayment = false,
}) {
  return MyTournamentRegistration(
    registrationId: 'reg-1',
    tournamentId: 't1',
    tournamentName: 'Copa Teste',
    dateLabel: '20/08',
    statusLabel: 'Pagamento pendente',
    isPaid: isPaid,
    categoryId: 'Mista C',
    hasPartialPayment: hasPartialPayment,
  );
}

AthleteInboxNotification _cancelledNotification(Map<String, String> data) {
  return AthleteInboxNotification(
    id: 'n1',
    title: 'Inscrição cancelada',
    body: 'Seu parceiro cancelou a reserva da vaga.',
    type: 'tournament_registration_cancelled',
    data: data,
    read: false,
    dismissed: false,
    createdAt: DateTime(2026, 8, 6),
  );
}

void main() {
  group('registrationCancellableByAthlete', () {
    test('cancelável quando não há nenhum pagamento', () {
      expect(
        registrationCancellableByAthlete(
          isPaid: false,
          sharePaidUids: const [],
        ),
        isTrue,
      );
    });

    test('bloqueada quando a inscrição está confirmada', () {
      expect(
        registrationCancellableByAthlete(
          isPaid: true,
          sharePaidUids: const [],
        ),
        isFalse,
      );
    });

    test('bloqueada quando alguém já pagou a parcela', () {
      expect(
        registrationCancellableByAthlete(
          isPaid: false,
          sharePaidUids: const ['uid-parceiro'],
        ),
        isFalse,
      );
    });

    test('bloqueada quando há valor pago mesmo sem sharePaidUids', () {
      expect(
        registrationCancellableByAthlete(
          isPaid: false,
          sharePaidUids: const [],
          paidAmount: 40,
        ),
        isFalse,
      );
    });
  });

  group('MyTournamentEnrollment.canCancelRegistration', () {
    test('inscrição sem pagamento pode ser cancelada', () {
      final enrollment = MyTournamentEnrollment(
        registration: _registration(),
      );
      expect(enrollment.canCancelRegistration, isTrue);
    });

    test('inscrição paga ou meio-paga não pode', () {
      expect(
        MyTournamentEnrollment(registration: _registration(isPaid: true))
            .canCancelRegistration,
        isFalse,
      );
      expect(
        MyTournamentEnrollment(
          registration: _registration(hasPartialPayment: true),
        ).canCancelRegistration,
        isFalse,
      );
    });
  });

  group('notificação tournament_registration_cancelled', () {
    test('apresentação tem ícone próprio e rota pela url', () {
      final presentation = notificationPresentation(
        _cancelledNotification({'url': '/torneios/t1', 'tournamentId': 't1'}),
      );
      expect(presentation.icon, Icons.event_busy_rounded);
      expect(presentation.routePath, '/torneios/t1');
    });

    test('apresentação cai no detalhe do torneio sem url', () {
      final presentation = notificationPresentation(
        _cancelledNotification({'tournamentId': 't1'}),
      );
      expect(presentation.routePath, '/torneios/t1');
    });

    test('navegação do push resolve o torneio mesmo sem url', () {
      expect(
        resolveNotificationRoute({
          'type': 'tournament_registration_cancelled',
          'tournamentId': 't1',
        }),
        '/torneios/t1',
      );
    });
  });
}
