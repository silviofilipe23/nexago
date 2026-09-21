import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_firestore_codes.dart';
import 'package:nexago_app/features/tournaments/domain/team_profile/team_cover_art_catalog.dart';

void main() {
  test('resolve a arte pelo par código + elenco, ignorando caixa e espaço', () {
    for (final code in ['VOLEI_PRAIA', 'volei_praia', '  Volei_Praia  ']) {
      expect(
        TeamCoverArtCatalog.assetFor(firestoreCode: code, rosterSize: 4),
        'assets/images/team_covers/volei_praia_quarteto.webp',
        reason: 'para "$code"',
      );
    }
  });

  test('elenco sem arte própria cai no maior elenco abaixo do MESMO esporte',
      () {
    // Quinteto de vôlei de praia não existe como arte; o quarteto é o mais
    // perto — quatro silhuetas continuam lendo como equipe. Descer é melhor
    // que cair na arte de um atleta só.
    expect(
      TeamCoverArtCatalog.assetFor(firestoreCode: 'VOLEI_PRAIA', rosterSize: 5),
      'assets/images/team_covers/volei_praia_quarteto.webp',
    );
    expect(
      TeamCoverArtCatalog.assetFor(firestoreCode: 'BEACH_TENNIS', rosterSize: 5),
      'assets/images/team_covers/beach_tennis_dupla.webp',
    );
  });

  test('nunca sobe: elenco menor que a menor arte do esporte devolve nulo', () {
    // O contrário de descer seria mostrar quatro atletas para uma dupla —
    // a capa passaria a mentir sobre o tamanho da equipe. Melhor devolver
    // nulo e deixar o chamador cair na arte do esporte.
    expect(
      TeamCoverArtCatalog.assetFor(firestoreCode: 'VOLEI_QUADRA', rosterSize: 2),
      isNull,
    );
  });

  test('dupla à procura de parceiro (1 integrante) usa a arte de dupla', () {
    // `members` traz 1 enquanto o convite não é aceito. Arte de dupla ali é
    // o que a equipe VAI ser, e é o mesmo que a tela já promete.
    expect(
      TeamCoverArtCatalog.assetFor(firestoreCode: 'FUTEVOLEI', rosterSize: 1),
      'assets/images/team_covers/futevolei_dupla.webp',
    );
  });

  test('esporte sem arte de equipe devolve nulo em vez de caminho inventado',
      () {
    for (final code in ['CORRIDA', 'OUTROS', 'INEXISTENTE', null, '', '   ']) {
      expect(
        TeamCoverArtCatalog.assetFor(firestoreCode: code, rosterSize: 2),
        isNull,
        reason: 'para $code',
      );
    }
  });

  test('todo código do catálogo é um esporte real do app', () {
    for (final code in TeamCoverArtCatalog.codesWithArt) {
      expect(
        AthleteFirestoreCodes.sportFirestoreToLabel(code),
        isNotNull,
        reason: '$code não é código conhecido',
      );
    }
  });

  test('todo asset declarado existe no disco e está no pubspec', () {
    // Subpasta de assets precisa de linha PRÓPRIA no pubspec: declarar
    // `assets/images/` não varre `assets/images/team_covers/`. Sem isso a
    // capa some em runtime e nenhum teste de widget percebe.
    final pubspec = File('pubspec.yaml').readAsStringSync();
    expect(
      pubspec,
      contains('assets/images/team_covers/'),
      reason: 'pubspec não declara a pasta das capas de equipe',
    );

    for (final asset in TeamCoverArtCatalog.declaredAssets) {
      expect(
        File(asset).existsSync(),
        isTrue,
        reason: '$asset está no catálogo mas não existe no disco',
      );
    }
  });
}
