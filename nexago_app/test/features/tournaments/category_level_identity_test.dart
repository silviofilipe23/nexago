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

    // `AthleteProfileOptions.levelRank` trata 'livre' como apelido legado de
    // 'open' (rank 6). Vale para o NÍVEL DO ATLETA; para uma CATEGORIA, Livre
    // significa o contrário — sem teto, aberta a todos. E Livre é o preset
    // padrão, então herdar o apelido pintaria de dourado a categoria mais
    // comum do app, chamando de elite o que é aberto.
    test('Livre NÃO é Open: é a categoria sem teto de nível', () {
      expect(
        categoryLevelFamily(offerWith(level: 'Livre')),
        CategoryLevelFamily.livre,
      );
      expect(
        categoryLevelFamily(offerWith(level: 'livre')),
        CategoryLevelFamily.livre,
      );
    });

    test('categoria sem nível declarado é Livre', () {
      expect(
        categoryLevelFamily(offerWith(name: 'Dupla Mista')),
        CategoryLevelFamily.livre,
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

    test('campo level vence o nome quando os dois existem', () {
      expect(
        categoryLevelFamily(
            offerWith(name: 'Open Masculino', level: 'Iniciante 1')),
        CategoryLevelFamily.iniciante,
      );
    });
  });

  group('arte de fundo do card', () {
    test('cada família aponta para um asset próprio', () {
      final artes = {
        for (final family in CategoryLevelFamily.values)
          categoryLevelArt(family),
      };
      expect(
        artes.length,
        CategoryLevelFamily.values.length,
        reason: 'duas famílias apontando para a mesma arte apagam a distinção',
      );
    });

    test('todas moram na mesma pasta, em webp', () {
      for (final family in CategoryLevelFamily.values) {
        final arte = categoryLevelArt(family);
        expect(arte, startsWith('assets/images/category_levels/'));
        expect(arte, endsWith('.webp'), reason: '$family');
      }
    });
  });

  group('identidade visual', () {
    test('cada família tem cor de acento própria', () {
      final colors = {
        for (final family in CategoryLevelFamily.values)
          categoryLevelAccent(family),
      };
      expect(colors.length, CategoryLevelFamily.values.length,
          reason: 'nenhuma família pode repetir a cor de outra');
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
      expect(categoryLevelFamilyLabel(CategoryLevelFamily.livre), 'Livre');
    });
  });
}
