import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/data/league_document_mapper.dart';

void main() {
  test('maps categoryName as canonical label and id fallback', () {
    final league = LeagueDocumentMapper.fromMap('liga-1', {
      'name': 'Circuito Teste',
      'categories': [
        {
          'categoryName': 'Misto C',
          'id': 'cat-misto',
        },
        {
          'name': 'Feminino B',
        },
      ],
    });

    expect(league.categories, hasLength(2));
    expect(league.categories[0].id, 'cat-misto');
    expect(league.categories[0].name, 'Misto C');
    expect(league.categories[1].id, 'Feminino B');
    expect(league.categories[1].name, 'Feminino B');
  });
}
