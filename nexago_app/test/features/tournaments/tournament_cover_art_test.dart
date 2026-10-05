import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_draft.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_cover_art.dart';

void main() {
  test('resolve a arte pelo código do torneio, ignorando caixa e espaço', () {
    for (final code in ['beachVolleyball', 'BEACHVOLLEYBALL', ' beachvolleyball ']) {
      expect(
        TournamentCoverArt.assetFor(code),
        'assets/images/sports/volei_praia.webp',
        reason: 'para "$code"',
      );
    }
  });

  test('cada esporte traz a sua arte, não uma só genérica', () {
    expect(
      TournamentCoverArt.assetFor('indoorVolleyball'),
      'assets/images/sports/volei_quadra.webp',
    );
    expect(
      TournamentCoverArt.assetFor('footvolley'),
      'assets/images/sports/futevolei.webp',
    );
    expect(
      TournamentCoverArt.assetFor('beachTennis'),
      'assets/images/sports/beach_tennis.webp',
    );
  });

  test('esporte desconhecido devolve nulo em vez de caminho inventado', () {
    // Torneio legado pode não ter `sport`. Sem arte é o gradiente, que segue
    // sendo o último recurso.
    for (final code in [null, '', '   ', 'xadrez']) {
      expect(TournamentCoverArt.assetFor(code), isNull, reason: 'para $code');
    }
  });

  test('código do perfil resolve pelo catálogo para a mesma arte', () {
    // Desde o catálogo canônico (`sports/catalog.json`) `VOLEI_PRAIA` e
    // `beachVolleyball` são o mesmo esporte, e o codegen recusa arte sem o
    // arquivo no bundle — o risco que este caso travava antes não existe mais.
    expect(
      TournamentCoverArt.assetFor('VOLEI_PRAIA'),
      'assets/images/sports/volei_praia.webp',
    );
  });

  test('todo esporte que o wizard grava tem arte', () {
    // Trava esporte novo entrando no `TournamentSport` sem arte: sem isso a
    // omissão cairia no gradiente caladamente, que é o bug que a capa padrão
    // veio resolver.
    final semArte = TournamentSport.values
        .where((s) => TournamentCoverArt.assetFor(s.name) == null)
        .map((s) => s.name)
        .toList();

    expect(semArte, isEmpty, reason: 'sem arte: ${semArte.join(', ')}');
  });
}
