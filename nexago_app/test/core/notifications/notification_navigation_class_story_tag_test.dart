import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';

/// Payload real do aviso de story marcado (`shareClassStory` em
/// `functions/src/class-story-share.ts`).
void main() {
  test('o toque abre o story do treino pelo url', () {
    expect(
      resolveNotificationRoute({
        'type': classStoryTagNotificationType,
        'tagId': 's1_u1',
        'url': '/story-do-treino/s1_u1',
      }),
      '/story-do-treino/s1_u1',
    );
  });

  test('sem url, monta pelo tagId', () {
    expect(
      resolveNotificationRoute({
        'type': classStoryTagNotificationType,
        'tagId': 's1_u1',
      }),
      '/story-do-treino/s1_u1',
    );
  });
}
