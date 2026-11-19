import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/arena_review_eligibility.dart';
import 'package:nexago_app/features/athlete/domain/arena_review_form_logic.dart';

void main() {
  group('arenaReviewToneFor', () {
    test('4 e 5 elogiam; 1 a 3 apontam o que melhorar', () {
      expect(arenaReviewToneFor(5), ArenaReviewTone.praise);
      expect(arenaReviewToneFor(4), ArenaReviewTone.praise);
      expect(arenaReviewToneFor(3), ArenaReviewTone.improve);
      expect(arenaReviewToneFor(1), ArenaReviewTone.improve);
    });
  });

  group('arenaReviewTagsFor', () {
    test('sem nota não oferece opção nenhuma', () {
      expect(arenaReviewTagsFor(null), isEmpty);
    });

    test('nota baixa nunca oferece elogio', () {
      final tags = arenaReviewTagsFor(1);
      expect(tags, arenaReviewImprovementTags);
      expect(tags, isNot(contains('Areia fofa e limpa')));
    });

    test('nota alta oferece os destaques da areia', () {
      expect(arenaReviewTagsFor(5), arenaReviewPraiseTags);
    });

    test('as listas não repetem a pergunta de pontualidade', () {
      final all = [...arenaReviewPraiseTags, ...arenaReviewImprovementTags];
      expect(all.where((t) => t.toLowerCase().contains('pontual')), isEmpty);
      expect(all.where((t) => t.toLowerCase().contains('atras')), isEmpty);
    });
  });

  group('keepArenaReviewTags', () {
    test('trocar de 5 para 2 zera tudo, até o que existe nas duas listas', () {
      final kept = keepArenaReviewTags(
        {'Areia fofa e limpa', 'Vestiário'},
        from: 5,
        to: 2,
      );
      expect(kept, isEmpty);
    });

    test('no mesmo tom a seleção fica', () {
      expect(
        keepArenaReviewTags({'Vestiário'}, from: 5, to: 4),
        {'Vestiário'},
      );
      expect(
        keepArenaReviewTags({'Iluminação fraca'}, from: 1, to: 3),
        {'Iluminação fraca'},
      );
    });
  });

  group('composeArenaReviewComment', () {
    test('elogio continua na linha "Destaques:" (portal e apps antigos)', () {
      expect(
        composeArenaReviewComment({'Vestiário', 'Atendimento'}, ' Ótimo '),
        'Destaques: Atendimento, Vestiário\nÓtimo',
      );
    });

    test('nota baixa vira "A melhorar:"', () {
      expect(
        composeArenaReviewComment(
          {'Iluminação fraca'},
          '',
          tone: ArenaReviewTone.improve,
        ),
        'A melhorar: Iluminação fraca',
      );
    });
  });

  group('arenaReviewHint', () {
    test('cada nota tem uma frase, para todos usarem a mesma régua', () {
      final hints = [for (var r = 1; r <= 5; r++) arenaReviewHint(r)];
      expect(hints.toSet(), hasLength(5));
      expect(arenaReviewHint(null), isNotEmpty);
    });
  });

  group('arenaReviewRebookDate', () {
    test('mesmo dia da semana, na semana seguinte ao jogo', () {
      // Domingo 15/11, avaliado no mesmo dia.
      expect(
        arenaReviewRebookDate(
          playedOn: DateTime(2026, 11, 15),
          now: DateTime(2026, 11, 15, 18, 30),
        ),
        DateTime(2026, 11, 22),
      );
    });

    test('jogo antigo pula para o próximo domingo depois de hoje', () {
      expect(
        arenaReviewRebookDate(
          playedOn: DateTime(2026, 10, 25),
          now: DateTime(2026, 11, 19, 9),
        ),
        DateTime(2026, 11, 22),
      );
    });

    test('nunca cai em hoje', () {
      expect(
        arenaReviewRebookDate(
          playedOn: DateTime(2026, 11, 12),
          now: DateTime(2026, 11, 19, 7),
        ),
        DateTime(2026, 11, 26),
      );
    });
  });

  test('arenaReviewRebookLabel mostra dia da semana e data', () {
    expect(arenaReviewRebookLabel(DateTime(2026, 11, 21)), 'Sáb 21/11');
    expect(arenaReviewRebookLabel(DateTime(2026, 12, 7)), 'Seg 07/12');
  });
}
