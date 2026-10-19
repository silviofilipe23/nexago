import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/store/domain/store_review_models.dart';
import 'package:nexago_app/features/store/infrastructure/firestore_store_repository.dart';
import 'package:nexago_app/features/store/infrastructure/firestore_store_review_repository.dart';

void main() {
  group('storeOrderReviewFromMap (storeOrderReviews/{orderId})', () {
    test('lê o doc gravado pela callable, com Timestamps', () {
      final r = storeOrderReviewFromMap('ord_1', {
        'orderId': 'ord_1',
        'number': 'NX-4740',
        'uid': 'ana',
        'anonymous': true,
        'authorName': 'Atleta NexaGO',
        'authorInitials': '··',
        'items': [
          {
            'productId': 'cami',
            'skuId': 'branco_m',
            'name': 'Camiseta Dry',
            'variantLabel': 'Branco · M',
            'imageUrl': 'https://cdn/c.jpg',
            'sizeValueId': 'm',
            'rating': 4,
            'tags': ['durabilidade', 'conforto', 'nao-existe'],
            'fit': 'grande',
            'comment': ' Veste bem ',
            'photos': [
              {
                'path': 'store/review-uploads/ana/a.jpg',
                'publicPath': 'store/reviews/cami/x.jpg',
                'url': 'https://cdn/x.jpg',
              },
              {'path': '', 'url': 'https://cdn/sem-caminho.jpg'},
            ],
            'publicId': 'pub1',
            'hiddenAt': null,
            'createdAt': Timestamp.fromDate(DateTime.utc(2026, 10, 1)),
          },
          {'productId': 'sem-nota', 'rating': 0},
          {'productId': '', 'rating': 5},
        ],
        'pickup': {'placeName': 'Arena CFC', 'rating': 5},
        'createdAt': Timestamp.fromDate(DateTime.utc(2026, 10, 1)),
        'updatedAt': Timestamp.fromDate(DateTime.utc(2026, 10, 2)),
        'editableUntil': Timestamp.fromDate(DateTime.utc(2026, 10, 31)),
      })!;
      expect(r.orderId, 'ord_1');
      expect(r.number, 'NX-4740');
      expect(r.anonymous, isTrue);
      expect(r.items, hasLength(1));
      final item = r.items.single;
      expect(item.productId, 'cami');
      expect(item.rating, 4);
      // Na ordem do formulário; desconhecida fica de fora.
      expect(item.tags, [StoreReviewTag.conforto, StoreReviewTag.durabilidade]);
      expect(item.fit, StoreReviewFit.grande);
      expect(item.comment, 'Veste bem');
      expect(item.sizeValueId, 'm');
      expect(item.photos.single.path, 'store/review-uploads/ana/a.jpg');
      expect(item.photos.single.url, 'https://cdn/x.jpg');
      expect(item.hidden, isFalse);
      expect(r.pickup?.placeName, 'Arena CFC');
      expect(r.pickup?.rating, 5);
      expect(r.createdAt?.toUtc(), DateTime.utc(2026, 10, 1));
      expect(r.editableUntil?.toUtc(), DateTime.utc(2026, 10, 31));
      expect(r.itemOf('cami'), same(item));
      expect(r.itemOf('outro'), isNull);
    });

    test('doc mínimo e escondido pela moderação', () {
      final r = storeOrderReviewFromMap('ord_2', {
        'items': [
          {'productId': 'bola', 'rating': 5, 'hiddenAt': Timestamp.now()},
        ],
        'pickup': null,
      })!;
      expect(r.orderId, 'ord_2');
      expect(r.anonymous, isFalse);
      expect(r.items.single.hidden, isTrue);
      expect(r.items.single.fit, isNull);
      expect(r.pickup, isNull);
      expect(r.editableUntil, isNull);
      expect(storeOrderReviewFromMap('x', null), isNull);
    });
  });

  group('storePublicReviewFromMap (storeShowcase/{id}/reviews)', () {
    test('lê o espelho público', () {
      final r = storePublicReviewFromMap('pub1', {
        'rating': 5,
        'tags': ['foto', 'qualidade'],
        'fit': 'certo',
        'comment': 'Seca rápido',
        'photos': ['https://cdn/1.jpg', '', 3],
        'variantLabel': 'Branco areia · M',
        'sizeValueId': 'm',
        'authorName': 'Rafaela M.',
        'authorInitials': 'RM',
        'createdAt': Timestamp.fromDate(DateTime.utc(2026, 10, 12, 15)),
        'updatedAt': null,
      })!;
      expect(r.id, 'pub1');
      expect(r.rating, 5);
      expect(r.tags, [StoreReviewTag.qualidade, StoreReviewTag.foto]);
      expect(r.fit, StoreReviewFit.certo);
      expect(r.photos, ['https://cdn/1.jpg']);
      expect(r.authorName, 'Rafaela M.');
      expect(r.authorInitials, 'RM');
      expect(r.createdAt?.toUtc(), DateTime.utc(2026, 10, 12, 15));
    });

    test('sem autor vira o anônimo; nota inválida é descartada', () {
      final r = storePublicReviewFromMap('pub2', {'rating': 3})!;
      expect(r.authorName, 'Atleta NexaGO');
      expect(r.authorInitials, '··');
      expect(r.sizeValueId, isNull);
      expect(storePublicReviewFromMap('x', {'rating': 6}), isNull);
      expect(storePublicReviewFromMap('x', {'rating': 4.5}), isNull);
      expect(storePublicReviewFromMap('x', {}), isNull);
      expect(storePublicReviewFromMap('x', null), isNull);
    });
  });

  group('reviewStats no espelho do produto', () {
    Map<String, dynamic> doc(Object? stats) => {
          'name': 'Camiseta',
          'priceCents': 12990,
          'ratingAvg': 4.81,
          'ratingCount': 50,
          'reviewStats': ?stats,
        };

    test('lê distribuição, recomendam, com foto e caimento', () {
      final p = storeProductFromMap(
        'cami',
        doc({
          'dist': [1, 1, 3, 9, 36],
          'recommend': 45,
          'withPhotos': 7,
          'fit': {'pequeno': 2, 'certo': 10, 'grande': 1},
        }),
      )!;
      expect(p.ratingAvg, 4.81);
      expect(p.ratingCount, 50);
      expect(p.reviewStats.dist, [1, 1, 3, 9, 36]);
      expect(p.reviewStats.recommend, 45);
      expect(p.reviewStats.withPhotos, 7);
      expect(p.reviewStats.fitSmall, 2);
      expect(p.reviewStats.fitRight, 10);
      expect(p.reviewStats.fitLarge, 1);
      expect(p.reviewStats.fitAnswers, 13);
    });

    test('espelho antigo (sem o campo) ou torto = zeros', () {
      final old = storeProductFromMap('cami', doc(null))!;
      expect(old.reviewStats.dist, [0, 0, 0, 0, 0]);
      expect(old.reviewStats.recommend, 0);
      expect(old.reviewStats.fitAnswers, 0);
      final bent = storeReviewStatsFromMap({
        'dist': [2, -1, 'x'],
        'fit': 'nada',
      });
      expect(bent.dist, [2, 0, 0, 0, 0]);
      expect(bent.fitAnswers, 0);
    });
  });
}
