import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';
import 'package:nexago_app/features/athlete/domain/athlete_inbox_notification.dart';
import 'package:nexago_app/features/athlete/domain/athlete_notifications_logic.dart';

AthleteInboxNotification _n(String type) => AthleteInboxNotification(
      id: 'n1',
      title: 'Como foi o jogo?',
      body: 'Lance o placar',
      type: type,
      data: const {'bookingId': 'b1'},
      read: false,
      dismissed: false,
      createdAt: DateTime(2026, 11, 13),
    );

void main() {
  test('"Como foi o jogo?" e placar sugerido abrem o Lançar placar', () {
    expect(
      resolveNotificationRoute(
          {'type': 'pelada_score_prompt', 'bookingId': 'b1'}),
      '/reservar/placar/b1',
    );
    expect(
      resolveNotificationRoute({
        'type': 'pelada_score_suggested',
        'bookingId': 'b 2',
      }),
      '/reservar/placar/b%202',
    );
    // O placar para confirmar segue no detalhe da pelada.
    expect(
      resolveNotificationRoute(
          {'type': 'booking_result_pending', 'bookingId': 'b1'}),
      '/peladas/b1',
    );
  });

  test('na caixa de notificações: ação e rota do Lançar placar', () {
    final prompt = notificationPresentation(_n('pelada_score_prompt'));
    expect(prompt.routePath, '/reservar/placar/b1');
    expect(prompt.actions.single.label, 'Lançar placar');
    final suggested = notificationPresentation(_n('pelada_score_suggested'));
    expect(suggested.actions.single.label, 'Conferir e enviar');
  });
}
