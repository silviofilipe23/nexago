import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/data/tournament_document_mapper.dart';

void main() {
  Map<String, dynamic> torneio({Map<String, dynamic>? categoryOps}) => {
        'name': 'Copa Teste',
        'categories': [
          {'id': 'cat-1', 'categoryName': 'Dupla Masculina'},
        ],
        if (categoryOps != null) 'categoryOps': categoryOps,
      };

  test('sem categoryOps: bracketPublished false', () {
    final detail = TournamentDocumentMapper.detailFromMap('t1', torneio());
    expect(detail.categoryOffers.single.bracketPublished, isFalse);
  });

  test('bracketStatus published liga o gate da categoria', () {
    final detail = TournamentDocumentMapper.detailFromMap(
      't1',
      torneio(categoryOps: {
        'cat-1': {'bracketStatus': 'published'},
      }),
    );
    expect(detail.categoryOffers.single.bracketPublished, isTrue);
  });
}
