import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/category_filter.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

TournamentCategoryOffer offerWith({
  required String id,
  String name = 'Categoria',
  String genderType = '',
  String bracketFormat = 'single_elimination',
}) {
  return TournamentCategoryOffer(
    id: id,
    name: name,
    entryFee: 0,
    genderType: genderType,
    bracketFormat: bracketFormat,
  );
}

final masculina =
    offerWith(id: 'm', name: 'Open Masculino', genderType: 'male');
final feminina =
    offerWith(id: 'f', name: 'Open Feminino', genderType: 'female');
final grupos = offerWith(
  id: 'g',
  name: 'Iniciante Masculino',
  genderType: 'male',
  bracketFormat: 'groups_knockout',
);

void main() {
  group('opções derivadas das ofertas', () {
    test('mistura de gêneros gera um chip por gênero, além de Todas', () {
      final options = categoryFilterOptions([masculina, feminina]);

      expect(
        options.map((o) => o.id).toList(),
        [categoryFilterAllId, 'MASCULINO', 'FEMININO'],
      );
      expect(options.first.label, 'Todas');
    });

    // Um chip que não separa nada só ocupa espaço: com tudo masculino,
    // "Masculino" devolveria exatamente a mesma lista que "Todas".
    test('gênero único não vira chip', () {
      final options = categoryFilterOptions([masculina, grupos]);

      expect(options.map((o) => o.id), isNot(contains('MASCULINO')));
    });

    test('Grupos aparece quando só parte das categorias tem fase de grupos',
        () {
      final options = categoryFilterOptions([masculina, grupos]);

      expect(options.map((o) => o.id).toList(), [
        categoryFilterAllId,
        categoryFilterGroupsId,
      ]);
      expect(options.last.label, 'Grupos');
    });

    test('todas com fase de grupos não gera o chip Grupos', () {
      final options = categoryFilterOptions([grupos]);

      expect(options, isEmpty,
          reason: 'só Todas não merece uma barra de filtro');
    });

    test('lista vazia não gera filtro nenhum', () {
      expect(categoryFilterOptions(const []), isEmpty);
    });

    test('ordem dos gêneros é canônica, não a ordem das ofertas', () {
      final options = categoryFilterOptions([feminina, masculina]);

      expect(options.map((o) => o.id).toList(), [
        categoryFilterAllId,
        'MASCULINO',
        'FEMININO',
      ]);
    });
  });

  group('aplicação do filtro', () {
    test('Todas devolve a lista inteira, na ordem original', () {
      expect(
        applyCategoryFilter([masculina, feminina], categoryFilterAllId),
        [masculina, feminina],
      );
    });

    test('filtro de gênero devolve só as daquele gênero', () {
      expect(
        applyCategoryFilter([masculina, feminina, grupos], 'MASCULINO'),
        [masculina, grupos],
      );
    });

    test('filtro Grupos devolve só as com fase de grupos', () {
      expect(
        applyCategoryFilter(
            [masculina, feminina, grupos], categoryFilterGroupsId),
        [grupos],
      );
    });

    // O organizador pode remover uma categoria enquanto o filtro dela está
    // selecionado; a tela não pode ficar sem nada para mostrar por causa disso.
    test('filtro desconhecido devolve a lista inteira', () {
      expect(
        applyCategoryFilter([masculina, feminina], 'INEXISTENTE'),
        [masculina, feminina],
      );
    });
  });
}
