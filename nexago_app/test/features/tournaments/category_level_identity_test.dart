import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/category_level_identity.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

TournamentCategoryOffer offerWith(
    {String name = 'Categoria', String level = ''}) {
  return TournamentCategoryOffer(
      id: 'c', name: name, entryFee: 0, level: level);
}

void main() {
  group('família a partir do campo level', () {
    test('Iniciante 1 e Iniciante 2 caem na mesma família', () {
      expect(
        categoryLevelFamily(offerWith(level: 'Iniciante 1')),
        CategoryLevelFamily.iniciante,
      );
      expect(
        categoryLevelFamily(offerWith(level: 'Iniciante 2')),
        CategoryLevelFamily.iniciante,
      );
    });

    test('Intermediário 1 e 2 caem na família intermediária', () {
      expect(
        categoryLevelFamily(offerWith(level: 'Intermediário 1')),
        CategoryLevelFamily.intermediario,
      );
      expect(
        categoryLevelFamily(offerWith(level: 'intermediario_2')),
        CategoryLevelFamily.intermediario,
      );
    });

    test('Avançado 1 e 2 caem na família avançada', () {
      expect(
        categoryLevelFamily(offerWith(level: 'Avançado 1')),
        CategoryLevelFamily.avancado,
      );
      expect(
        categoryLevelFamily(offerWith(level: 'avancado_2')),
        CategoryLevelFamily.avancado,
      );
    });

    test('Open é a própria família', () {
      expect(
        categoryLevelFamily(offerWith(level: 'Open')),
        CategoryLevelFamily.open,
      );
    });
  });

  group('fallback pelo nome quando o organizador não preenche o nível', () {
    test('nome "Open Masculino" resolve Open sem campo level', () {
      expect(
        categoryLevelFamily(offerWith(name: 'Open Masculino')),
        CategoryLevelFamily.open,
      );
    });

    test('nome "Iniciante Feminino" resolve iniciante', () {
      expect(
        categoryLevelFamily(offerWith(name: 'Iniciante Feminino')),
        CategoryLevelFamily.iniciante,
      );
    });

    test('nome "Intermediário Masculino" resolve intermediário', () {
      expect(
        categoryLevelFamily(offerWith(name: 'Intermediário Masculino')),
        CategoryLevelFamily.intermediario,
      );
    });

    // Sem nível declarado e sem pista no nome, a cor NÃO pode virar Open:
    // `categoryLevelRank` devolve Open nesse caso (aceita todos), e usar isso
    // pintaria de dourado todo torneio que não preenche nível.
    test('sem nível e sem pista no nome fica indefinido, não Open', () {
      expect(
        categoryLevelFamily(offerWith(name: 'Dupla Mista')),
        CategoryLevelFamily.indefinido,
      );
    });

    test('campo level vence o nome quando os dois existem', () {
      expect(
        categoryLevelFamily(
            offerWith(name: 'Open Masculino', level: 'Iniciante 1')),
        CategoryLevelFamily.iniciante,
      );
    });
  });

  group('identidade visual', () {
    test('cada família tem cor de acento própria', () {
      final colors = {
        for (final family in CategoryLevelFamily.values)
          if (family != CategoryLevelFamily.indefinido)
            categoryLevelAccent(family),
      };
      expect(colors.length, 4, reason: 'as 4 famílias não podem repetir cor');
    });

    test('cada família tem tagline própria e não vazia', () {
      for (final family in CategoryLevelFamily.values) {
        expect(categoryLevelTagline(family), isNotEmpty, reason: '$family');
      }
    });

    test('rótulo curto da família', () {
      expect(categoryLevelFamilyLabel(CategoryLevelFamily.open), 'Open');
      expect(
        categoryLevelFamilyLabel(CategoryLevelFamily.intermediario),
        'Intermediário',
      );
    });
  });
}
