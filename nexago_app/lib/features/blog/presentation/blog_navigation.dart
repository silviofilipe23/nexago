import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/observability/analytics_log.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../home_banners/presentation/home_banner_navigation.dart';
import '../domain/blog_post.dart';

void openBlogFeed(BuildContext context) =>
    context.pushNamed(AppRouteNames.blog);

void openBlogSaved(BuildContext context) =>
    context.pushNamed(AppRouteNames.blogSaved);

void openBlogPost(BuildContext context, String postId) => context.pushNamed(
  AppRouteNames.blogPost,
  pathParameters: {'postId': postId},
);

/// Botão de voltar das telas do blog: volta uma tela ou, se esta for a única da
/// pilha, vai para [fallback]. A notificação abre o post com `router.go`, que
/// troca a pilha inteira: um `pop` puro deixava o atleta preso no post.
void blogBack(BuildContext context, String fallback) =>
    popOrGo(context, fallback);

/// O mesmo para o voltar do sistema (Android): sem tela embaixo, leva a
/// [fallback] em vez de fechar o app.
class BlogBackScope extends StatelessWidget {
  const BlogBackScope({super.key, required this.fallback, required this.child});

  final String fallback;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final router = GoRouter.maybeOf(context);
    if (router == null) return child;
    return PopScope(
      canPop: router.canPop(),
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) router.go(fallback);
      },
      child: child,
    );
  }
}

/// Botão no fim do post: mesmas chaves (e mesmo caminho) do banner e das
/// Novidades. Reservar e Loja são abas do shell: troca a aba e volta ao
/// shell, senão a aba nova fica escondida atrás da leitura.
Future<void> openBlogCta(
  BuildContext context,
  WidgetRef ref,
  BlogCta cta,
) async {
  logAnalytics(ref, (a) => a.logBlogCta(cta.destination.key));
  if (isShellTabDestination(cta.destination)) {
    final navigator = Navigator.of(context);
    await openAppDestination(context, ref, cta.destination);
    navigator.popUntil((route) => route.isFirst);
    return;
  }
  await openAppDestination(context, ref, cta.destination, url: cta.url);
}
