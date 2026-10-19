import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/store/domain/store_checkout_models.dart';
import 'package:nexago_app/features/store/domain/store_models.dart';
import 'package:nexago_app/features/store/domain/store_order_rules.dart';
import 'package:nexago_app/features/store/domain/store_review_models.dart';
import 'package:nexago_app/features/store/domain/store_review_rules.dart';

/// As mesmas contas de `store-reviews.ts` (servidor) e
/// `store-reviews-model.ts` (portal).
StoreOrderView _order([Map<String, Object?> over = const {}]) =>
    storeOrderViewFromMap('ord_1', {
      'uid': 'ana',
      'number': 'NX-4740',
      'status': 'rtd',
      'items': [
        {
          'productId': 'viseira',
          'skuId': 'preta',
          'name': 'Viseira Dry Fit',
          'variantLabel': 'Preta · único',
          'qty': 1,
        },
        {
          'productId': 'cami',
          'skuId': 'branco_m',
          'name': 'Camiseta Dry',
          'variantLabel': 'Branco · M',
          'qty': 1,
        },
        {
          'productId': 'viseira',
          'skuId': 'branca',
          'name': 'Viseira Dry Fit',
          'variantLabel': 'Branca · único',
          'qty': 1,
        },
        {'productId': '', 'name': 'Linha antiga', 'qty': 1},
      ],
      'delivery': {'type': 'arena', 'placeName': 'Arena CFC'},
      'createdAt': '2026-09-15T15:00:00.000Z',
      'completedAt': '2026-09-18T20:00:00.000Z',
      ...over,
    })!;

StoreProduct _product({
  List<StoreAxis> axes = const [],
  double? avg,
  int count = 0,
  StoreReviewStats stats = StoreReviewStats.empty,
}) =>
    StoreProduct(
      id: 'cami',
      name: 'Camiseta Dry',
      priceCents: 12990,
      minPriceCents: 12990,
      maxPriceCents: 12990,
      axes: axes,
      ratingAvg: avg,
      ratingCount: count,
      reviewStats: stats,
    );

const _sizeAxis = StoreAxis(
  id: 'tam',
  label: 'Tamanho',
  values: [
    StoreAxisValue(id: 'p', label: 'P'),
    StoreAxisValue(id: 'm', label: 'M'),
  ],
);

StorePublicReview _r(
  String id, {
  int rating = 5,
  DateTime? at,
  List<String> photos = const [],
  String? size,
  List<StoreReviewTag> tags = const [],
  StoreReviewFit? fit,
}) =>
    StorePublicReview(
      id: id,
      rating: rating,
      createdAt: at,
      photos: photos,
      sizeValueId: size,
      tags: tags,
      fit: fit,
    );

void main() {
  // 17:00 de 17/10/2026 em São Paulo.
  final now = DateTime.utc(2026, 10, 17, 20);

  group('rótulos', () {
    test('notas, etiquetas e caimento iguais aos do portal', () {
      expect(
        [for (var i = 1; i <= 5; i++) storeReviewRatingLabel(i)],
        ['Ruim', 'Regular', 'Bom', 'Muito bom', 'Excelente'],
      );
      expect(storeReviewRatingLabel(null), '');
      expect(storeReviewRatingLabel(0), '');
      expect(
        [for (final t in StoreReviewTag.values) t.id],
        ['qualidade', 'conforto', 'tamanho', 'foto', 'custo', 'durabilidade'],
      );
      expect(
        [for (final t in StoreReviewTag.values) t.label],
        [
          'Qualidade',
          'Conforto',
          'Tamanho certo',
          'Igual à foto',
          'Custo-benefício',
          'Durabilidade',
        ],
      );
      expect(
        [for (final f in StoreReviewFit.values) f.formLabel],
        ['Pequeno', 'Certo', 'Grande'],
      );
      expect(
        [for (final f in StoreReviewFit.values) f.chipLabel],
        ['Veste pequeno', 'Tamanho certo', 'Veste grande'],
      );
      expect(StoreReviewTag.from('foto'), StoreReviewTag.foto);
      expect(StoreReviewTag.from('outra'), isNull);
      expect(StoreReviewFit.from('grande'), StoreReviewFit.grande);
      expect(StoreReviewFit.from(null), isNull);
    });
  });

  group('storeOrderReviewState', () {
    final review = StoreOrderReview(
      orderId: 'ord_1',
      createdAt: DateTime.utc(2026, 10, 1),
      editableUntil: DateTime.utc(2026, 10, 31),
    );

    test('só entregue ou retirado pode ser avaliado', () {
      for (final s in StoreOrderStatus.values) {
        final state = storeOrderReviewState(s, null, now);
        if (s == StoreOrderStatus.ent || s == StoreOrderStatus.rtd) {
          expect(state, StoreOrderReviewState.none, reason: s.id);
        } else {
          expect(state, isNull, reason: s.id);
        }
      }
    });

    test('avaliado: editável até o fim do prazo, depois travado', () {
      expect(
        storeOrderReviewState(StoreOrderStatus.ent, review, now),
        StoreOrderReviewState.editable,
      );
      expect(
        storeOrderReviewState(
          StoreOrderStatus.ent,
          review,
          DateTime.utc(2026, 10, 31),
        ),
        StoreOrderReviewState.editable,
      );
      expect(
        storeOrderReviewState(
          StoreOrderStatus.rtd,
          review,
          DateTime.utc(2026, 10, 31, 0, 0, 1),
        ),
        StoreOrderReviewState.locked,
      );
    });

    test('sem editableUntil o prazo sai do createdAt; sem nenhum, travado', () {
      final old = StoreOrderReview(
        orderId: 'ord_1',
        createdAt: DateTime.utc(2026, 9, 1),
      );
      expect(
        storeOrderReviewState(StoreOrderStatus.ent, old, now),
        StoreOrderReviewState.locked,
      );
      expect(
        storeOrderReviewState(
          StoreOrderStatus.ent,
          old,
          DateTime.utc(2026, 9, 30),
        ),
        StoreOrderReviewState.editable,
      );
      expect(
        storeOrderReviewState(
          StoreOrderStatus.ent,
          const StoreOrderReview(orderId: 'ord_1'),
          now,
        ),
        StoreOrderReviewState.locked,
      );
    });
  });

  group('produtos do pedido e eixo Tamanho', () {
    test('um passo por produto (a primeira linha), sem linha sem produto', () {
      final lines = storeReviewableLines(_order());
      expect([for (final l in lines) l.productId], ['viseira', 'cami']);
      expect(lines.first.variantLabel, 'Preta · único');
    });

    test('eixo Tamanho sem acento e caixa', () {
      expect(
        isStoreReviewSizeAxis(const StoreAxis(id: 't', label: 'TAMANHO')),
        isTrue,
      );
      expect(
        isStoreReviewSizeAxis(const StoreAxis(id: 't', label: ' tamanho ')),
        isTrue,
      );
      expect(
        isStoreReviewSizeAxis(const StoreAxis(id: 'c', label: 'Cor')),
        isFalse,
      );
      expect(storeReviewSizeAxis(_product(axes: const [_sizeAxis]))?.id, 'tam');
      expect(storeReviewSizeAxis(_product()), isNull);
      expect(storeReviewSizeAxis(null), isNull);
    });

    test('com tamanho, "Tamanho certo" sai do formulário', () {
      expect(storeReviewFormTags(sized: false), StoreReviewTag.values);
      expect(
        storeReviewFormTags(sized: true),
        isNot(contains(StoreReviewTag.tamanho)),
      );
      expect(storeReviewFormTags(sized: true), hasLength(5));
    });

    test('linha do produto no 08b: variação e "retirado em"/"entregue em"', () {
      expect(storeReviewReceivedLabel(_order(), now), 'retirado em 18 set');
      expect(
        storeReviewReceivedLabel(
          _order({
            'status': 'ent',
            'delivery': {'type': 'casa'},
          }),
          now,
        ),
        'entregue em 18 set',
      );
      expect(
        storeReviewReceivedLabel(_order({'completedAt': null}), now),
        isNull,
      );
      expect(
        storeReviewLineVariant(
          const StoreOrderItem(
            variantLabel: 'Preta · M',
            customizationLabel: 'ANTUNES',
          ),
        ),
        'Preta · M · ANTUNES',
      );
    });
  });

  group('formulário e pedido da callable', () {
    test('rascunho novo: tudo vazio; tamanho pelo catálogo', () {
      final drafts = storeReviewDraftsFor(
        _order(),
        null,
        isSized: (id) => id == 'cami',
      );
      expect([for (final d in drafts) d.productId], ['viseira', 'cami']);
      expect([for (final d in drafts) d.sized], [false, true]);
      expect(drafts.every((d) => d.rating == null), isTrue);
      expect(storeReviewCanPublish(drafts), isFalse);
    });

    test('edição: preenche do doc privado (fotos pelo caminho do upload)', () {
      const review = StoreOrderReview(
        orderId: 'ord_1',
        anonymous: true,
        items: [
          StoreOrderReviewItem(
            productId: 'cami',
            rating: 4,
            tags: [StoreReviewTag.conforto, StoreReviewTag.tamanho],
            fit: StoreReviewFit.grande,
            comment: 'Veste bem',
            photos: [
              StoreReviewPhoto(
                path: 'store/review-uploads/ana/a.jpg',
                url: 'https://cdn/a.jpg',
              ),
            ],
          ),
        ],
      );
      final drafts =
          storeReviewDraftsFor(_order(), review, isSized: (id) => id == 'cami');
      expect(drafts[0].rating, isNull);
      final cami = drafts[1];
      expect(cami.rating, 4);
      expect(cami.fit, StoreReviewFit.grande);
      expect(cami.comment, 'Veste bem');
      expect(cami.photos.single.path, 'store/review-uploads/ana/a.jpg');
      expect(cami.photos.single.url, 'https://cdn/a.jpg');
      expect(cami.photos.single.ready, isTrue);
      expect(storeReviewCanPublish(drafts), isTrue);
    });

    test('só vai o que tem nota; sem tamanho não vai caimento', () {
      final submission = buildStoreReviewSubmission(
        orderId: 'ord_1',
        anonymous: false,
        atArena: true,
        pickupRating: 5,
        drafts: const [
          StoreReviewItemDraft(
            productId: 'viseira',
            rating: 5,
            tags: {StoreReviewTag.custo, StoreReviewTag.qualidade},
            fit: StoreReviewFit.certo,
            comment: '  Leve e seca rápido.  ',
            photos: [
              StoreReviewPhotoDraft(id: 'a', path: 'store/review-uploads/u/a.jpg'),
              StoreReviewPhotoDraft(id: 'b', uploading: true),
            ],
          ),
          StoreReviewItemDraft(productId: 'cami', sized: true),
        ],
      );
      expect(submission.toMap(), {
        'orderId': 'ord_1',
        'anonymous': false,
        'items': [
          {
            'productId': 'viseira',
            'rating': 5,
            // Na ordem do formulário, não na do toque.
            'tags': ['qualidade', 'custo'],
            'fit': null,
            'comment': 'Leve e seca rápido.',
            'photos': ['store/review-uploads/u/a.jpg'],
          },
        ],
        'pickupRating': 5,
      });
    });

    test('com tamanho: caimento vai e "Tamanho certo" não', () {
      final submission = buildStoreReviewSubmission(
        orderId: 'ord_1',
        anonymous: true,
        atArena: false,
        pickupRating: 4,
        drafts: [
          StoreReviewItemDraft(
            productId: 'cami',
            sized: true,
            rating: 3,
            tags: const {StoreReviewTag.tamanho, StoreReviewTag.conforto},
            fit: StoreReviewFit.pequeno,
            comment: 'x' * 600,
          ),
        ],
      );
      final item = submission.items.single;
      expect(item.tags, [StoreReviewTag.conforto]);
      expect(item.fit, StoreReviewFit.pequeno);
      expect(item.comment.length, kStoreReviewMaxComment);
      // Pedido de casa: a retirada não vai.
      expect(submission.pickupRating, isNull);
      expect(submission.anonymous, isTrue);
    });

    test('foto subindo segura a publicação', () {
      const drafts = [
        StoreReviewItemDraft(
          productId: 'cami',
          rating: 5,
          photos: [StoreReviewPhotoDraft(id: 'x', uploading: true)],
        ),
      ];
      expect(storeReviewCanPublish(drafts), isFalse);
    });
  });

  group('fotos', () {
    Uint8List bytes(List<int> head, [int size = 64]) =>
        Uint8List.fromList([...head, ...List.filled(size, 0)]);

    test('só JPEG, PNG e WEBP (pela assinatura)', () {
      expect(
        storeReviewPhotoContentType(bytes([0xFF, 0xD8, 0xFF, 0xE0])),
        'image/jpeg',
      );
      expect(
        storeReviewPhotoContentType(bytes([0x89, 0x50, 0x4E, 0x47])),
        'image/png',
      );
      expect(
        storeReviewPhotoContentType(
          bytes([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]),
        ),
        'image/webp',
      );
      // HEIC ("ftypheic").
      expect(
        storeReviewPhotoContentType(
          bytes([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]),
        ),
        isNull,
      );
      expect(storeReviewPhotoExtension('image/png'), 'png');
      expect(storeReviewPhotoExtension('image/webp'), 'webp');
      expect(storeReviewPhotoExtension('image/jpeg'), 'jpg');
    });

    test('recusa formato e peso com a cópia do servidor', () {
      expect(
        storeReviewPhotoProblem(bytes([0x47, 0x49, 0x46, 0x38])),
        'Foto em formato não aceito (use JPG, PNG ou WEBP).',
      );
      expect(
        storeReviewPhotoProblem(
          bytes([0xFF, 0xD8, 0xFF], kStoreReviewMaxPhotoBytes),
        ),
        'Foto maior que 10 MB.',
      );
      expect(storeReviewPhotoProblem(bytes([0xFF, 0xD8, 0xFF])), isNull);
    });
  });

  group('storeReviewErrorMessage', () {
    test('mensagem do servidor passa; código cru vira cópia nossa', () {
      expect(
        storeReviewErrorMessage('failed-precondition', 'O prazo pra editar essa avaliação acabou.'),
        'O prazo pra editar essa avaliação acabou.',
      );
      expect(
        storeReviewErrorMessage('not-found', 'Pedido não encontrado.'),
        'Pedido não encontrado.',
      );
      // Callable não deployada: o SDK manda "NOT FOUND" (iOS) / "NOT_FOUND".
      for (final raw in ['NOT FOUND', 'NOT_FOUND', 'not-found', null]) {
        expect(
          storeReviewErrorMessage('not-found', raw),
          'A avaliação ainda não está disponível. Tente de novo em instantes.',
        );
      }
      expect(
        storeReviewErrorMessage('internal', 'INTERNAL'),
        'Não deu pra publicar a avaliação. Tente de novo em instantes.',
      );
      expect(
        storeReviewErrorMessage('unauthenticated', null),
        'Sua sessão expirou. Entre de novo para continuar.',
      );
    });
  });

  group('datas', () {
    test('"12 out" no relógio de São Paulo, sem ponto; ano só se outro', () {
      expect(
        formatStoreReviewDate(DateTime.utc(2026, 10, 12, 15), now),
        '12 out',
      );
      // 01:00 UTC do dia 13 ainda é dia 12 em SP.
      expect(
        formatStoreReviewDate(DateTime.utc(2026, 10, 13, 1), now),
        '12 out',
      );
      expect(
        formatStoreReviewDate(DateTime.utc(2025, 5, 3, 15), now),
        '3 mai 2025',
      );
      expect(formatStoreReviewDate(null, now), '');
      expect(
        storeReviewMetaLine(
          StorePublicReview(
            id: 'a',
            rating: 5,
            variantLabel: 'Branco areia · M',
            createdAt: DateTime.utc(2026, 10, 12, 15),
          ),
          now,
        ),
        '12 out · Branco areia · M',
      );
    });
  });

  group('resumo do produto', () {
    test('nota média só a partir de 3 avaliações', () {
      expect(storeReviewSummary(_product(avg: 5, count: 2)), isNull);
      expect(storeReviewSummary(_product(count: 5)), isNull);
      final summary = storeReviewSummary(
        _product(
          avg: 4.81,
          count: 50,
          stats: const StoreReviewStats(
            dist: [1, 1, 3, 9, 36],
            recommend: 45,
          ),
        ),
      )!;
      expect(summary.averageLabel, '4,8');
      expect(summary.stars, 5);
      expect(summary.recommendPct, 90);
      expect(
        [for (final s in summary.starsPct) (s.stars, s.pct)],
        [(5, 72), (4, 18), (3, 6), (2, 2), (1, 2)],
      );
      expect(storeReviewCountLabel(1), '1 avaliação');
      expect(storeReviewCountLabel(86), '86 avaliações');
      expect(formatStoreReviewAverage(4.25), '4,3');
    });

    test('caimento: só com tamanho e 3 respostas; posição e rótulo', () {
      const balanced = StoreReviewStats(fitSmall: 1, fitRight: 8, fitLarge: 1);
      expect(storeReviewFitBar(balanced, sized: false), isNull);
      expect(
        storeReviewFitBar(
          const StoreReviewStats(fitSmall: 1, fitLarge: 1),
          sized: true,
        ),
        isNull,
      );
      final ok = storeReviewFitBar(balanced, sized: true)!;
      expect(ok.positionPct, 50);
      expect(ok.label, 'Veste bem');

      final small = storeReviewFitBar(
        const StoreReviewStats(fitSmall: 3, fitRight: 2),
        sized: true,
      )!;
      expect(small.positionPct, 20);
      expect(small.label, 'Veste pequeno');

      final large = storeReviewFitBar(
        const StoreReviewStats(fitRight: 1, fitLarge: 3),
        sized: true,
      )!;
      expect(large.positionPct, 88);
      expect(large.label, 'Veste grande');

      // 50 + 50 × (−2/10) = 40 → "Veste bem" (o limite é < 40).
      final edge = storeReviewFitBar(
        const StoreReviewStats(fitSmall: 2, fitRight: 8),
        sized: true,
      )!;
      expect(edge.positionPct, 40);
      expect(edge.label, 'Veste bem');
      // 50 + 50 × (−3/7) = 28,6 → arredonda 29.
      expect(
        storeReviewFitBar(
          const StoreReviewStats(fitSmall: 3, fitRight: 4),
          sized: true,
        )!.positionPct,
        29,
      );
    });
  });

  group('filtros e ordem', () {
    final reviews = [
      _r('a', rating: 5, at: DateTime.utc(2026, 10, 10), size: 'm'),
      _r('b', rating: 3, at: DateTime.utc(2026, 10, 12), photos: ['u']),
      _r('c', rating: 5, at: DateTime.utc(2026, 10, 11), photos: ['u', 'v']),
      _r('d', rating: 1, at: DateTime.utc(2026, 10, 9), size: 'g'),
    ];

    test('contagens da lista carregada; "Tamanho" só com avaliação nele', () {
      final none = storeReviewFilterOptions(reviews);
      expect(
        [for (final o in none) (o.label, o.count)],
        [('Todas', 4), ('Com foto', 2), ('5 estrelas', 2)],
      );
      final withSize = storeReviewFilterOptions(
        reviews,
        sizeValueId: 'm',
        sizeLabel: 'M',
      );
      expect(withSize.last.kind, StoreReviewFilterKind.size);
      expect((withSize.last.label, withSize.last.count), ('Tamanho M', 1));
      expect(
        storeReviewFilterOptions(reviews, sizeValueId: 'gg', sizeLabel: 'GG'),
        hasLength(3),
      );
    });

    test('filtra e ordena (empate na nota: a mais recente primeiro)', () {
      List<String> ids(List<StorePublicReview> l) => [for (final r in l) r.id];
      expect(ids(storeReviewsView(reviews)), ['b', 'c', 'a', 'd']);
      expect(
        ids(storeReviewsView(reviews, sort: StoreReviewSort.best)),
        ['c', 'a', 'b', 'd'],
      );
      expect(
        ids(storeReviewsView(reviews, sort: StoreReviewSort.worst)),
        ['d', 'b', 'c', 'a'],
      );
      expect(
        ids(storeReviewsView(reviews, filter: StoreReviewFilterKind.withPhotos)),
        ['b', 'c'],
      );
      expect(
        ids(storeReviewsView(reviews, filter: StoreReviewFilterKind.fiveStars)),
        ['c', 'a'],
      );
      expect(
        ids(storeReviewsView(
          reviews,
          filter: StoreReviewFilterKind.size,
          sizeValueId: 'g',
        )),
        ['d'],
      );
      expect(
        [for (final s in StoreReviewSort.values) s.label],
        ['Mais recentes', 'Melhor nota', 'Pior nota'],
      );
    });

    test('etiquetas do card: com caimento, "Tamanho certo" não repete', () {
      expect(
        storeReviewChips(
          _r(
            'a',
            tags: const [StoreReviewTag.conforto, StoreReviewTag.tamanho],
            fit: StoreReviewFit.pequeno,
          ),
        ),
        ['Conforto', 'Veste pequeno'],
      );
      expect(
        storeReviewChips(
          _r('a', tags: const [StoreReviewTag.tamanho, StoreReviewTag.foto]),
        ),
        ['Tamanho certo', 'Igual à foto'],
      );
    });
  });
}
