import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/blog/application/blog_providers.dart';
import 'package:nexago_app/features/blog/domain/blog_comment.dart';
import 'package:nexago_app/features/blog/domain/blog_post.dart';
import 'package:nexago_app/features/blog/presentation/blog_post_page.dart';

import '../fake_blog_repository.dart';

final _post = BlogPost(
  id: 'liga',
  title: 'Liga nexaGO: tudo sobre a 2ª etapa',
  categoryKey: 'torneios',
  readMinutes: 4,
  commentCount: 2,
  body: const [BlogParagraph('A 2ª etapa chega com categorias novas.')],
);

final _now = DateTime.now();

List<BlogComment> _comments() => [
  BlogComment(
    id: 'a1',
    uid: 'outro',
    authorName: 'Ana S.',
    text: 'Vai ter categoria iniciante?',
    kind: BlogCommentKind.question,
    status: BlogCommentStatus.approved,
    createdAt: _now.subtract(const Duration(hours: 3)),
    reply: const BlogCommentReply(text: 'Vai sim, Misto Iniciante.'),
  ),
  BlogComment(
    id: 'a2',
    uid: 'outro2',
    authorName: 'Bruno',
    text: 'Bora!',
    status: BlogCommentStatus.approved,
    createdAt: _now.subtract(const Duration(days: 1)),
  ),
  BlogComment(
    id: 'meu-pendente',
    uid: 'u1',
    authorName: 'Ray',
    text: 'Posso trocar de dupla?',
    status: BlogCommentStatus.pending,
    createdAt: _now.subtract(const Duration(minutes: 5)),
  ),
  BlogComment(
    id: 'de-outro-pendente',
    uid: 'outro3',
    authorName: 'Caio',
    text: 'Pendente de outro atleta',
    status: BlogCommentStatus.pending,
    createdAt: _now,
  ),
];

Future<FakeBlogRepository> _pump(
  WidgetTester tester, {
  bool signedIn = true,
}) async {
  tester.view.physicalSize = const Size(390 * 3, 844 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final repo = FakeBlogRepository([_post]);
  repo.comments['liga'] = _comments();
  final router = GoRouter(
    routes: [
      GoRoute(
        path: '/',
        builder: (context, state) => const Scaffold(body: Text('Início')),
      ),
      GoRoute(
        path: AppRoutes.blogPost,
        name: AppRouteNames.blogPost,
        builder: (context, state) =>
            BlogPostPage(postId: state.pathParameters['postId'] ?? ''),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authProvider.overrideWith(
          (ref) => Stream.value(signedIn ? MockUser(uid: 'u1') : null),
        ),
        blogRepositoryProvider.overrideWithValue(repo),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  router.push('/athlete/blog/liga');
  await _settle(tester);
  return repo;
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> _scrollTo(WidgetTester tester, Finder finder) => tester
    .scrollUntilVisible(finder, 300, scrollable: find.byType(Scrollable).first);

void main() {
  testWidgets('lista: próprio pendente no topo, aprovados, dúvida e resposta', (
    tester,
  ) async {
    await _pump(tester);

    await _scrollTo(tester, find.byKey(const Key('blog-comment-a2')));
    expect(find.text('Comentários (2)'), findsOneWidget);
    expect(find.text('Posso trocar de dupla?'), findsOneWidget);
    expect(find.text('AGUARDANDO APROVAÇÃO'), findsOneWidget);
    expect(find.text('DÚVIDA'), findsOneWidget);
    expect(find.text('Resposta da equipe nexaGO'), findsOneWidget);
    expect(find.text('Vai sim, Misto Iniciante.'), findsOneWidget);
    // Pendente de outro atleta não aparece.
    expect(find.text('Pendente de outro atleta'), findsNothing);
    // Só o próprio tem "Apagar".
    expect(
      find.byKey(const Key('blog-comment-delete-meu-pendente')),
      findsOneWidget,
    );
    expect(find.byKey(const Key('blog-comment-delete-a1')), findsNothing);

    // Ordem: o próprio pendente antes dos aprovados.
    final yMine = tester
        .getTopLeft(find.byKey(const Key('blog-comment-meu-pendente')))
        .dy;
    final yA1 = tester.getTopLeft(find.byKey(const Key('blog-comment-a1'))).dy;
    expect(yMine, lessThan(yA1));
  });

  testWidgets('"Ficou dúvida" abre o composer em modo dúvida e envia', (
    tester,
  ) async {
    final repo = await _pump(tester);

    await _scrollTo(tester, find.byKey(const Key('blog-question')));
    await tester.tap(find.byKey(const Key('blog-question')));
    await _settle(tester);

    expect(
      find.text('Qual é a sua dúvida? A equipe responde aqui.'),
      findsOneWidget,
    );
    await tester.enterText(
      find.byKey(const Key('blog-comment-field')),
      'Tem estacionamento na arena?',
    );
    await tester.pump();
    await tester.tap(find.byKey(const Key('blog-comment-send')));
    await _settle(tester);

    expect(repo.postedComments.single.kind, BlogCommentKind.question);
    expect(repo.postedComments.single.text, 'Tem estacionamento na arena?');
    expect(
      find.text('Recebemos! Aparece aqui depois que a equipe aprovar.'),
      findsOneWidget,
    );
    // Volta para comentário e o enviado aparece como pendente.
    expect(find.text('Escreva um comentário'), findsOneWidget);
    expect(find.text('Tem estacionamento na arena?'), findsOneWidget);
    expect(find.text('AGUARDANDO APROVAÇÃO'), findsNWidgets(2));
  });

  testWidgets('erro do servidor aparece com o texto pronto', (tester) async {
    final repo = await _pump(tester);
    repo.postCommentError = FirebaseFunctionsException(
      code: 'resource-exhausted',
      message:
          'Você já tem comentários esperando aprovação neste post. '
          'Aguarde a equipe responder.',
    );

    await _scrollTo(tester, find.byKey(const Key('blog-comment-field')));
    await tester.enterText(find.byKey(const Key('blog-comment-field')), 'Oi!');
    await tester.pump();
    await tester.tap(find.byKey(const Key('blog-comment-send')));
    await _settle(tester);

    expect(find.textContaining('Você já tem comentários'), findsOneWidget);
    expect(
      find.text('Recebemos! Aparece aqui depois que a equipe aprovar.'),
      findsNothing,
    );
  });

  testWidgets('texto curto não envia', (tester) async {
    final repo = await _pump(tester);

    await _scrollTo(tester, find.byKey(const Key('blog-comment-field')));
    await tester.enterText(find.byKey(const Key('blog-comment-field')), 'a');
    await tester.pump();
    await tester.tap(find.byKey(const Key('blog-comment-send')));
    await _settle(tester);

    expect(repo.postedComments, isEmpty);
  });

  testWidgets('apagar o próprio pede confirmação', (tester) async {
    final repo = await _pump(tester);

    final delete = find.byKey(const Key('blog-comment-delete-meu-pendente'));
    await _scrollTo(tester, delete);
    await tester.tap(delete);
    await _settle(tester);
    expect(find.text('Apagar comentário?'), findsOneWidget);
    await tester.tap(find.byKey(const Key('blog-comment-delete-confirm')));
    await _settle(tester);

    expect(repo.deletedComments, ['meu-pendente']);
    expect(find.text('Posso trocar de dupla?'), findsNothing);
  });

  testWidgets('sem sessão: sem seção e sem "Ficou dúvida"', (tester) async {
    await _pump(tester, signedIn: false);

    await _scrollTo(tester, find.byKey(const Key('blog-helpful')));
    expect(find.byKey(const Key('blog-comments')), findsNothing);
    expect(find.byKey(const Key('blog-question')), findsNothing);
  });
}
