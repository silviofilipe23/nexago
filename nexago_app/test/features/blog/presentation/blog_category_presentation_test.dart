import 'package:cached_network_image/cached_network_image.dart';
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/features/blog/application/blog_providers.dart';
import 'package:nexago_app/features/blog/domain/blog_post.dart';
import 'package:nexago_app/features/blog/presentation/blog_feed_page.dart';
import 'package:nexago_app/features/blog/presentation/widgets/blog_parts.dart';

import '../fake_blog_repository.dart';

const _saude = BlogCategory(
  key: 'saude',
  label: 'Saúde',
  color: 0xFF33CCAA,
  colorLight: 0xFF11664F,
  order: 1,
);

void main() {
  group('cores', () {
    final dark = AppThemeColors.ofBrightness(Brightness.dark);
    final light = AppThemeColors.ofBrightness(Brightness.light);

    test('escuro usa `color`; claro usa `colorLight`; desconhecida neutra', () {
      expect(blogCategoryTone(_saude, dark), const Color(0xFF33CCAA));
      expect(blogCategoryTone(_saude, light), const Color(0xFF11664F));
      expect(
        blogCategoryTone(BlogCategory.torneios, light),
        const Color(0xFFAE3A0A),
      );
      expect(blogCategoryTone(null, light), light.onSurfaceMuted);
      expect(blogCategoryRawTone(_saude), const Color(0xFF33CCAA));
      expect(blogCategoryRawTone(null), AppColors.onSurfaceMuted);
    });

    test('capa: a de origem mantém o gradiente do protótipo', () {
      final g = blogCoverGradient(BlogCategory.treino);
      expect(g.first, const Color(0xFF0F1A14));
    });

    test('capa: categoria nova (ou cor trocada) deriva de `color`', () {
      final g = blogCoverGradient(_saude);
      expect(g, hasLength(2));
      expect(g.first, Color.lerp(blogCoverInk, const Color(0xFF33CCAA), 0.15));
      final changed = BlogCategory.fromDoc('treino', {
        'color': '#3366FF',
      }, base: BlogCategory.treino)!;
      expect(
        blogCoverGradient(changed).first,
        Color.lerp(blogCoverInk, const Color(0xFF3366FF), 0.15),
      );
      // Receita igual à do protótipo de Torneios.
      expect(
        blogCoverGradient(BlogCategory.torneios).first,
        const Color(0xFF2A1206),
      );
    });
  });

  group('widgets', () {
    Future<void> pump(
      WidgetTester tester,
      Widget child, {
      ThemeData? theme,
      BlogTaxonomy? taxonomy,
      List<BlogPost> posts = const [],
    }) async {
      tester.view.physicalSize = const Size(390 * 3, 844 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final repo = FakeBlogRepository(posts)
        ..taxonomy = taxonomy ?? BlogTaxonomy.defaults;
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authProvider.overrideWith(
              (ref) => Stream.value(MockUser(uid: 'u1')),
            ),
            blogRepositoryProvider.overrideWithValue(repo),
          ],
          child: MaterialApp(
            theme: theme ?? AppTheme.dark,
            home: Scaffold(body: child),
          ),
        ),
      );
      for (var i = 0; i < 6; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
    }

    testWidgets('rótulo de categoria criada, na cor do tema', (tester) async {
      final taxonomy = BlogTaxonomy([...BlogCategory.defaults, _saude]);
      await pump(
        tester,
        const BlogCategoryLabel('saude'),
        taxonomy: taxonomy,
        theme: AppTheme.light,
      );
      final text = tester.widget<Text>(find.text('SAÚDE'));
      expect(text.style!.color, const Color(0xFF11664F));
    });

    testWidgets('id desconhecido = "BLOG" neutro', (tester) async {
      await pump(tester, const BlogCategoryLabel('podcast'));
      expect(find.text('BLOG'), findsOneWidget);
    });

    testWidgets('chips do feed: categoria criada entra, inativa sai', (
      tester,
    ) async {
      final taxonomy = BlogTaxonomy.merge({
        'saude': {
          'label': 'Saúde',
          'color': '#33CCAA',
          'colorLight': '#11664F',
          'order': 1,
        },
        'loja': {'active': false},
      });
      await pump(
        tester,
        const BlogFeedPage(),
        taxonomy: taxonomy,
        posts: [
          BlogPost(
            id: 'a',
            title: 'Alongamento antes do jogo',
            categoryKey: 'saude',
            publishAt: DateTime(2026, 11, 4),
          ),
          BlogPost(
            id: 'b',
            title: 'Toalha nova',
            categoryKey: 'loja',
            publishAt: DateTime(2026, 11, 3),
          ),
          BlogPost(
            id: 'c',
            title: 'Liga',
            categoryKey: 'torneios',
            publishAt: DateTime(2026, 11, 2),
          ),
        ],
      );
      expect(find.byKey(const Key('blog-chip-saude')), findsOneWidget);
      expect(find.byKey(const Key('blog-chip-torneios')), findsOneWidget);
      expect(find.byKey(const Key('blog-chip-loja')), findsNothing);
      // O post da categoria desativada continua com o rótulo dela.
      expect(find.text('LOJA'), findsWidgets);
    });

    testWidgets('autor: foto quando há, iniciais como reserva', (tester) async {
      await pump(
        tester,
        const BlogAuthorAvatar(
          name: 'Marcelo R.',
          photoUrl: 'https://img/m.jpg',
        ),
      );
      final photo = tester.widget<CachedNetworkImage>(
        find.byKey(const Key('blog-author-photo')),
      );
      expect(photo.imageUrl, 'https://img/m.jpg');
    });

    testWidgets('autor sem foto: as iniciais', (tester) async {
      await pump(tester, const BlogAuthorAvatar(name: 'Marcelo R.'));
      expect(find.byKey(const Key('blog-author-photo')), findsNothing);
      expect(find.text('MR'), findsOneWidget);
    });
  });
}
