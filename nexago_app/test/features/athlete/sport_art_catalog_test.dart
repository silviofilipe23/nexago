import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_options.dart';
import 'package:nexago_app/features/athlete/domain/athlete_firestore_codes.dart';
import 'package:nexago_app/features/athlete/domain/sport_art_catalog.dart';

void main() {
  test('resolve a arte pelo código, ignorando caixa e espaço', () {
    for (final code in ['VOLEI_PRAIA', 'volei_praia', '  Volei_Praia  ']) {
      expect(
        SportArtCatalog.assetFor(code),
        'assets/images/sports/volei_praia.webp',
        reason: 'para "$code"',
      );
    }
  });

  test('esporte sem arte devolve nulo em vez de caminho inventado', () {
    // Outros existe no app mas nunca terá arte: não é esporte específico. O
    // card precisa cair no fundo sólido, não pedir asset fora do bundle.
    for (final code in ['OUTROS', null, '', '   ']) {
      expect(SportArtCatalog.assetFor(code), isNull, reason: 'para $code');
    }
  });

  test('todo código do catálogo é um esporte real do app', () {
    // Trava o inverso do teste acima: arte para esporte que não existe seria
    // asset morto no bundle. Foi quase o que aconteceu com "futsal".
    for (final code in SportArtCatalog.codesWithArt) {
      final label = AthleteFirestoreCodes.sportFirestoreToLabel(code);
      expect(label, isNotNull, reason: '$code não é código conhecido');
      expect(
        AthleteProfileOptions.sports,
        contains(label),
        reason: '$code resolve para "$label", que o app não oferece',
      );
    }
  });

  test('todo esporte do app tem arte, exceto Outros', () {
    // Guarda o inverso: esporte novo entrando no app sem arte cairia no card
    // sólido caladamente. Aqui a omissão falha o teste em vez de passar batido.
    final semArte = <String>[];
    for (final label in AthleteProfileOptions.sports) {
      if (label == 'Outros') continue;
      final code = AthleteFirestoreCodes.sportFirestoreToLabel;
      final match = SportArtCatalog.codesWithArt.where(
        (c) => code(c) == label,
      );
      if (match.isEmpty) semArte.add(label);
    }

    expect(semArte, isEmpty, reason: 'sem arte: ${semArte.join(', ')}');
  });
}
