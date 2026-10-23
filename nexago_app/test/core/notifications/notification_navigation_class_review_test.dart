import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';
import 'package:nexago_app/core/router/routes.dart';

/// Payload real da resposta ao chamado da avaliação de aula
/// (`replyClassReviewTicket` em `functions/src/class-review-manager.ts`).
void main() {
  test('resposta da gestão abre Minhas avaliações', () {
    expect(
      resolveNotificationRoute({
        'type': classReviewReplyNotificationType,
        'url': '/treinos/avaliacoes',
      }),
      AppRoutes.athleteTrainingReviews,
    );
    expect(AppRoutes.athleteTrainingReviews, '/treinos/avaliacoes');
  });

  test('sem url (item antigo do inbox), o tipo ainda leva às avaliações', () {
    expect(
      resolveNotificationRoute({'type': classReviewReplyNotificationType}),
      AppRoutes.athleteTrainingReviews,
    );
  });

  test('com sessão, o toque abre direto', () {
    final dest = resolveNotificationTapDestination(
      data: {'type': classReviewReplyNotificationType},
      hasSession: true,
    );
    expect(dest?.path, '/treinos/avaliacoes');
    expect(dest?.requiresLogin, isFalse);
  });
}
