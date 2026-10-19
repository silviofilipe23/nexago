import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/store/application/store_providers.dart';
import 'package:nexago_app/features/store/application/store_review_providers.dart';
import 'package:nexago_app/features/store/domain/store_models.dart';
import 'package:nexago_app/features/store/domain/store_review_models.dart';
import 'package:nexago_app/features/store/presentation/store_product_reviews_page.dart';
import 'package:nexago_app/features/store/presentation/widgets/store_product_reviews_section.dart';

import 'store_checkout_test_kit.dart';

/// Seção "Avaliações" da página do produto (02) e a tela de todas.

final DateTime _now = DateTime.utc(2026, 10, 17, 20);

StoreProduct _product({
  double? avg,
  int count = 0,
  StoreReviewStats stats = StoreReviewStats.empty,
  bool sized = true,
}) =>
    StoreProduct(
      id: 'cami',
      name: 'Camiseta Dry UV50',
      priceCents: 12990,
      minPriceCents: 12990,
      maxPriceCents: 12990,
      ratingAvg: avg,
      ratingCount: count,
      reviewStats: stats,
      axes: [
        if (sized)
          const StoreAxis(
            id: 'tam',
            label: 'Tamanho',
            values: [
              StoreAxisValue(id: 'm', label: 'M'),
              StoreAxisValue(id: 'g', label: 'G'),
            ],
          ),
      ],
    );

StorePublicReview _r(
  String id,
  int rating,
  int day, {
  String? size,
  String comment = '',
  List<StoreReviewTag> tags = const [],
  StoreReviewFit? fit,
}) =>
    StorePublicReview(
      id: id,
      rating: rating,
      createdAt: DateTime.utc(2026, 10, day, 15),
      sizeValueId: size,
      comment: comment,
      tags: tags,
      fit: fit,
      variantLabel: 'Branco · ${size?.toUpperCase() ?? 'M'}',
      authorName: 'Rafaela M.',
      authorInitials: 'RM',
    );

Future<void> _pump(
  WidgetTester tester,
  Widget child, {
  required StoreProduct product,
  required FakeStoreReviewRepository reviews,
}) async {
  tester.view.physicalSize = const Size(390, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        storeRepositoryProvider.overrideWithValue(
          FakeStoreRepository(products: [product]),
        ),
        storeReviewRepositoryProvider.overrideWithValue(reviews),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: child,
      ),
    ),
  );
  for (var i = 0; i < 4; i++) {
    await tester.pump(const Duration(milliseconds: 20));
  }
}

Widget _section(StoreProduct product, List<String> opened) => Scaffold(
      body: SingleChildScrollView(
        child: StoreProductReviewsSection(
          product: product,
          now: _now,
          onSeeAll: () => opened.add('todas'),
        ),
      ),
    );

void main() {
  group('Seção "Avaliações" (02)', () {
    testWidgets('sem nenhuma: "Ainda sem avaliações"', (tester) async {
      final product = _product();
      await _pump(
        tester,
        _section(product, []),
        product: product,
        reviews: FakeStoreReviewRepository(),
      );
      expect(find.text('Avaliações'), findsOneWidget);
      expect(find.text('Ainda sem avaliações'), findsOneWidget);
      expect(
        find.text(
          'Só quem comprou pela NexaGO avalia, em Meus pedidos, depois de '
          'retirar ou receber.',
        ),
        findsOneWidget,
      );
      expect(find.byKey(const ValueKey('store-reviews-see-all')), findsNothing);
    });

    testWidgets('1–2: o card sem a nota média', (tester) async {
      final product = _product(avg: 4.5, count: 2);
      final opened = <String>[];
      await _pump(
        tester,
        _section(product, opened),
        product: product,
        reviews: FakeStoreReviewRepository(
          productReviews: {
            'cami': [
              _r(
                'a',
                5,
                12,
                comment: 'Seca muito rápido.',
                tags: const [StoreReviewTag.conforto, StoreReviewTag.tamanho],
                fit: StoreReviewFit.certo,
              ),
              _r('b', 4, 3),
            ],
          },
        ),
      );
      expect(find.byKey(const ValueKey('store-reviews-average')), findsNothing);
      // O mais recente, compacto.
      expect(find.text('Rafaela M.'), findsOneWidget);
      expect(find.text('Compra verificada'), findsOneWidget);
      expect(find.text('12 out · Branco · M'), findsOneWidget);
      expect(find.text('Seca muito rápido.'), findsOneWidget);
      expect(find.text('Conforto'), findsOneWidget);
      // Com caimento, o "Tamanho certo" vem do fit (uma vez só).
      expect(find.text('Tamanho certo'), findsOneWidget);
      expect(find.text('Útil (0)'), findsNothing);

      await tester.tap(find.text('Ver todas (2)'));
      expect(opened, ['todas']);
    });

    testWidgets('3 ou mais: nota, distribuição e recomendam', (tester) async {
      final product = _product(
        avg: 4.5,
        count: 4,
        stats: const StoreReviewStats(dist: [0, 0, 1, 0, 3], recommend: 3),
      );
      await _pump(
        tester,
        _section(product, []),
        product: product,
        reviews: FakeStoreReviewRepository(
          productReviews: {
            'cami': [
              _r('a', 5, 12),
              _r('b', 5, 11),
              _r('c', 3, 10),
              _r('d', 5, 9),
            ],
          },
        ),
      );
      expect(find.text('4,5'), findsOneWidget);
      expect(find.text('4 avaliações · 75% recomendam'), findsOneWidget);
      expect(find.text('75%'), findsOneWidget);
      expect(find.text('25%'), findsOneWidget);
      expect(find.text('Ver todas (4)'), findsOneWidget);
    });

    testWidgets('leitura negada (rule não publicada): a seção some', (
      tester,
    ) async {
      final product = _product(avg: 4.5, count: 4);
      await _pump(
        tester,
        _section(product, []),
        product: product,
        reviews: FakeStoreReviewRepository(productError: StateError('denied')),
      );
      expect(find.byKey(const ValueKey('store-product-reviews')), findsNothing);
      expect(find.text('Avaliações'), findsNothing);
    });
  });

  group('Todas as avaliações', () {
    final reviews = FakeStoreReviewRepository(
      productReviews: {
        'cami': [
          _r('a', 5, 12, size: 'm', comment: 'Ótima'),
          _r('b', 2, 11, size: 'g', comment: 'Apertada'),
          _r('c', 5, 10, size: 'm', comment: 'Leve'),
          _r('d', 4, 9, size: 'g', comment: 'Boa'),
        ],
      },
    );
    final product = _product(
      avg: 4,
      count: 40,
      stats: const StoreReviewStats(
        dist: [0, 4, 0, 8, 28],
        recommend: 36,
        fitSmall: 1,
        fitRight: 6,
        fitLarge: 1,
      ),
    );

    List<String> comments(WidgetTester tester) => [
          for (final t in tester.widgetList<Text>(find.byType(Text)))
            if (['Ótima', 'Apertada', 'Leve', 'Boa'].contains(t.data)) t.data!,
        ];

    testWidgets('resumo do agregado, caimento, filtros da lista e ordem', (
      tester,
    ) async {
      await _pump(
        tester,
        StoreProductReviewsPage(productId: 'cami', sizeValueId: 'g', clock: () => _now),
        product: product,
        reviews: reviews,
      );
      // Resumo = agregado do espelho (40), não a lista carregada.
      expect(find.text('4,0'), findsOneWidget);
      expect(find.text('40 avaliações · 90% recomendam'), findsOneWidget);
      expect(find.byKey(const ValueKey('store-reviews-fit-label')),
          findsOneWidget);
      expect(find.text('Veste bem'), findsOneWidget);
      // Filtros contam a lista carregada.
      Finder chip(String kind) =>
          find.byKey(ValueKey('store-reviews-filter-$kind'));
      expect(
        find.descendant(of: chip('all'), matching: find.text('4')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: chip('fiveStars'), matching: find.text('2')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: chip('size'), matching: find.text('Tamanho G')),
        findsOneWidget,
      );
      expect(comments(tester), ['Ótima', 'Apertada', 'Leve', 'Boa']);

      await tester.ensureVisible(chip('size'));
      await tester.pump();
      await tester.tap(chip('size'));
      await tester.pump();
      expect(comments(tester), ['Apertada', 'Boa']);

      await tester.ensureVisible(chip('fiveStars'));
      await tester.pump();
      await tester.tap(chip('fiveStars'));
      await tester.pump();
      expect(comments(tester), ['Ótima', 'Leve']);

      await tester.ensureVisible(chip('all'));
      await tester.pump();
      await tester.tap(chip('all'));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('store-reviews-sort')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Pior nota').last);
      await tester.pumpAndSettle();
      expect(comments(tester), ['Apertada', 'Boa', 'Ótima', 'Leve']);
    });

    testWidgets('sem tamanho escolhido, sem o filtro "Tamanho"', (
      tester,
    ) async {
      await _pump(
        tester,
        StoreProductReviewsPage(productId: 'cami', clock: () => _now),
        product: product,
        reviews: reviews,
      );
      expect(find.byKey(const ValueKey('store-reviews-filter-size')),
          findsNothing);
    });
  });
}
