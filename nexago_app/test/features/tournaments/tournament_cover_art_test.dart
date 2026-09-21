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
    // Torneio legado pode não ter `sport`, e o vocabulário do perfil do atleta
    // (`VOLEI_PRAIA`) não é o do torneio: casar por engano traria asset fora
    // do bundle. Sem arte é o gradiente, que segue sendo o último recurso.
    for (final code in [null, '', '   ', 'VOLEI_PRAIA', 'xadrez']) {
      expect(TournamentCoverArt.assetFor(code), isNull, reason: 'para $code');
    }
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
