import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/sports/sport_catalog.dart';
import 'package:nexago_app/features/athlete/domain/athlete_firestore_codes.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_options.dart';
import 'package:nexago_app/features/athlete/onboarding/domain/athlete_onboarding_options.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_draft.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_logic.dart';
import 'package:nexago_app/features/organizer_public_profile/domain/organizer_public_profile_logic.dart';
import 'package:nexago_app/features/tournaments/domain/category_level_eligibility.dart';

import 'sport_vectors_data.dart';

void main() {
  group('vetores compartilhados com functions e portais', () {
    test('normaliza', () {
      for (final (input, want) in kSportNormalizeVectors) {
        expect(SportCatalog.normalizeKey(input), want, reason: input);
      }
    });
    test('resolve', () {
      for (final (input, want) in kSportResolveVectors) {
        expect(SportCatalog.resolve(input)?.code, want, reason: input);
      }
    });
    test('title case', () {
      for (final (input, want) in kSportTitleCaseVectors) {
        expect(SportCatalog.titleCase(input), want, reason: input);
      }
    });
  });

  test('rótulo: conhecido, desconhecido e vazio', () {
    expect(SportCatalog.labelOf('beach_tennis'), 'Beach tennis');
    expect(SportCatalog.labelOf('padel'), 'Padel');
    expect(SportCatalog.labelOf('  '), isNull);
    expect(SportCatalog.labelOf(null), isNull);
  });

  test('enum do wizard é exatamente o conjunto competition do catálogo', () {
    expect(
      TournamentSport.values.map((s) => s.name).toList(),
      SportCatalog.withSupport(
        SportSupport.competition,
      ).map((e) => e.code).toList(),
    );
  });

  test('pontes e listas do app leem do catálogo', () {
    expect(
      CategoryLevelEligibility.tournamentSportToLevelSportCode('beach_tennis'),
      'BEACH_TENNIS',
    );
    expect(
      AthleteFirestoreCodes.sportAppToFirestore('footvolley'),
      'FUTEVOLEI',
    );
    expect(
      AthleteFirestoreCodes.sportFirestoreToApp('futevolei'),
      'footvolley',
    );
    expect(
      AthleteFirestoreCodes.sportFirestoreToLabel('BEACH_TENNIS'),
      'Beach tennis',
    );
    expect(AthleteProfileOptions.sports, [
      for (final e in kSportCatalog) e.label,
    ]);
    expect(AthleteOnboardingOptions.sports.map((o) => o.id).toList(), [
      for (final e in kSportCatalog) e.appId,
    ]);
    expect(AthleteOnboardingOptions.sports.map((o) => o.label).toList(), [
      for (final e in kSportCatalog) e.label,
    ]);
    expect(sportLabel(TournamentSport.footvolley), 'Futevôlei');
    expect(organizerSportLabel('beach_tennis'), 'Beach tennis');
  });
}
