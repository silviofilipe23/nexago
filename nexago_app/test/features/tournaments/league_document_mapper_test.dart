import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/data/league_document_mapper.dart';
import 'package:nexago_app/features/tournaments/domain/league_ranking_models.dart';

void main() {
  test('maps categoryName as canonical label and id fallback', () {
    final league = LeagueDocumentMapper.fromMap('liga-1', {
      'name': 'Circuito Teste',
      'categories': [
        {
          'categoryName': 'Misto C',
          'id': 'cat-misto',
          'genderType': 'mixed',
        },
        {
          'name': 'Feminino B',
        },
      ],
    });

    expect(league.categories, hasLength(2));
    expect(league.categories[0].id, 'cat-misto');
    expect(league.categories[0].name, 'Misto C');
    expect(league.categories[0].genderType, 'mixed');
    expect(league.categories[1].id, 'Feminino B');
    expect(league.categories[1].name, 'Feminino B');
    expect(league.categories[1].genderType, 'female');
  });

  test('maps extended league fields from Firestore', () {
    final league = LeagueDocumentMapper.fromMap('liga-2', {
      'name': 'nexaGO League',
      'organizationName': 'Associação Goiana de Beach Tennis',
      'description': 'Regulamento resumido.',
      'city': 'Aparecida de Goiânia',
      'state': 'GO',
      'plannedStagesCount': 6,
      'grandFinalEnabled': true,
      'grandFinalSpots': 16,
      'countingStagesMode': 'all_stages',
      'seasonStartAt': DateTime(2026, 6, 1),
      'seasonEndAt': DateTime(2026, 12, 15),
      'listingStatus': 'open',
      'stages': [],
    });

    expect(league.organizationName, 'Associação Goiana de Beach Tennis');
    expect(league.description, 'Regulamento resumido.');
    expect(league.state, 'GO');
    expect(league.plannedStagesCount, 6);
    expect(league.grandFinalEnabled, isTrue);
    expect(league.grandFinalSpots, 16);
    expect(league.totalStagesCount, 6);
    expect(league.countingStagesMode, LeaguePointsCountingMode.allStages);
  });
}
