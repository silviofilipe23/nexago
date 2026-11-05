import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/athlete/domain/athlete_inbox_notification.dart';
import 'package:nexago_app/features/athlete/domain/athlete_notifications_logic.dart';

/// Payload de `onBlogPostPublishedPush` (`functions/src/blog-push.ts`).
void main() {
  test('o url do push abre a leitura do post', () {
    expect(
      resolveNotificationRoute({
        'type': blogPostNotificationType,
        'url': '/athlete/blog/p1',
        'postId': 'p1',
        'category': 'torneios',
      }),
      '/athlete/blog/p1',
    );
  });

  test('sem url, monta pelo postId; sem os dois, o feed', () {
    expect(
      resolveNotificationRoute({
        'type': blogPostNotificationType,
        'postId': 'p1',
      }),
      '/athlete/blog/p1',
    );
    expect(
      resolveNotificationRoute({'type': blogPostNotificationType}),
      AppRoutes.blog,
    );
  });

  test('no inbox: ícone de artigo e o toque abre o post', () {
    final n = AthleteInboxNotification(
      id: 'n1',
      title: 'Liga nexaGO: tudo sobre a 2ª etapa',
      body: '4 min de leitura no blog do nexaGO',
      type: blogPostNotificationType,
      data: const {'url': '/athlete/blog/p1', 'postId': 'p1'},
      read: false,
      dismissed: false,
      createdAt: DateTime(2026, 11, 5),
    );
    final p = notificationPresentation(n);
    expect(p.icon, Icons.article_outlined);
    expect(p.routePath, '/athlete/blog/p1');
  });
}
