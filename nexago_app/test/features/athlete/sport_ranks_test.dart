import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_public_profile_models.dart';

void main() {
  AthletePublicSportEntry e(String code, {int? rank}) =>
      AthletePublicSportEntry(
        label: code,
        levelLabel: 'Iniciante 1',
        levelSegments: 1,
        isPrimary: false,
        firestoreCode: code,
        rankingPosition: rank,
      );

  test('preenche a posição de cada modalidade pelo código', () {
    final out = withSportRanks(
      [e('VOLEI_PRAIA'), e('BASQUETE')],
      {'VOLEI_PRAIA': 3, 'BASQUETE': 12},
    );

    expect(out[0].rankingPosition, 3);
    expect(out[1].rankingPosition, 12);
  });

  test('esporte sem pontuação fica sem posição, não com zero', () {
    // Quem nunca pontuou naquele esporte não está no ranking dele. Zero ou
    // "#0" seria mentira; a UI mostra travessão para nulo.
    final out = withSportRanks([
      e('VOLEI_PRAIA'),
      e('CORRIDA')
    ], {
      'VOLEI_PRAIA': 1,
    });

    expect(out[0].rankingPosition, 1);
    expect(out[1].rankingPosition, isNull);
  });

  test('mapa vazio devolve as entradas intactas', () {
    final entradas = [e('VOLEI_PRAIA', rank: 7)];
    expect(withSportRanks(entradas, const {}), same(entradas));
  });

  test('não mistura modalidades: cada código pega a sua posição', () {
    // O risco real: praia e quadra compartilham a palavra "vôlei". Como a
    // chave é o CÓDIGO, não o rótulo, elas não se confundem.
    final out = withSportRanks(
      [e('VOLEI_PRAIA'), e('VOLEI_QUADRA')],
      {'VOLEI_PRAIA': 2, 'VOLEI_QUADRA': 40},
    );

    expect(out[0].rankingPosition, 2);
    expect(out[1].rankingPosition, 40);
  });
}
