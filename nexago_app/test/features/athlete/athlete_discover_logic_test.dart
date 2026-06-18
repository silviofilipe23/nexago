import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_discover_logic.dart';
import 'package:nexago_app/features/athlete/domain/athlete_discover_models.dart';
import 'package:nexago_app/features/athlete/domain/athlete_privacy_preferences.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_public_profile_models.dart';

AthleteProfile _profile({
  String id = 'a1',
  String name = 'Rafael Antunes',
  String gender = 'masculino',
  String city = 'Goiânia',
  String? state = 'GO',
  String sport = 'Vôlei de praia',
  String level = 'Iniciante',
  String? category = 'Cat A',
  String? primarySportId = 'VOLEI_PRAIA',
  bool lookingForPartner = false,
  bool onboardingCompleted = true,
  bool privateProfile = false,
}) {
  return AthleteProfile(
    id: id,
    name: name,
    gender: gender,
    city: city,
    state: state,
    sport: sport,
    level: level,
    category: category,
    primarySportFirestoreId: primarySportId,
    lookingForPartner: lookingForPartner,
    onboardingCompleted: onboardingCompleted,
    privacyPreferences: privateProfile
        ? const AthletePrivacyPreferences(
            profileVisibility: AthleteProfileVisibility.private,
          )
        : AthletePrivacyPreferences.defaults,
  );
}

AthleteDiscoverEntry _entry({
  AthleteProfile? profile,
  int? rank,
  int points = 100,
}) {
  final p = profile ?? _profile();
  return buildDiscoverEntry(
    profile: p,
    ranking: AthletePublicRankingSnapshot(rank: rank, points: points),
  );
}

void main() {
  group('applyDiscoverFilters', () {
    test('excludes private profiles', () {
      final entries = [
        _entry(profile: _profile(id: '1')),
        _entry(profile: _profile(id: '2', privateProfile: true)),
      ];
      final result = applyDiscoverFilters(
        entries: entries,
        filters: AthleteDiscoverFilters.defaults,
      );
      expect(result, hasLength(1));
      expect(result.first.userId, '1');
    });

    test('filters by quick level Intermediário', () {
      final entries = [
        _entry(
          profile: _profile(id: '1', level: 'Iniciante'),
        ),
        _entry(
          profile: _profile(id: '2', level: 'Intermediário'),
        ),
      ];
      final result = applyDiscoverFilters(
        entries: entries,
        filters: const AthleteDiscoverFilters(
          quickLevel: AthleteDiscoverQuickLevel.intermediario,
        ),
      );
      expect(result.single.userId, '2');
    });

    test('maps legacy Básico to Iniciante quick filter', () {
      final entries = [
        _entry(
          profile: _profile(id: '1', level: 'Básico'),
        ),
        _entry(
          profile: _profile(id: '2', level: 'Open'),
        ),
      ];
      final result = applyDiscoverFilters(
        entries: entries,
        filters: const AthleteDiscoverFilters(
          quickLevel: AthleteDiscoverQuickLevel.iniciante,
        ),
      );
      expect(result.single.userId, '1');
    });

    test('excludes athletes without level when level filter is active', () {
      final entries = [
        _entry(
          profile: _profile(id: '1', level: ''),
        ),
        _entry(
          profile: _profile(id: '2', level: 'Open'),
        ),
      ];
      final result = applyDiscoverFilters(
        entries: entries,
        filters: const AthleteDiscoverFilters(
          quickLevel: AthleteDiscoverQuickLevel.open,
        ),
      );
      expect(result.single.userId, '2');
    });

    test('filters by gender', () {
      final entries = [
        _entry(
          profile: _profile(id: '1', gender: 'masculino'),
        ),
        _entry(
          profile: _profile(id: '2', gender: 'feminino'),
        ),
      ];
      final result = applyDiscoverFilters(
        entries: entries,
        filters: const AthleteDiscoverFilters(
          gender: AthleteDiscoverGenderFilter.female,
        ),
      );
      expect(result.single.userId, '2');
    });

    test('filters by search query', () {
      final entries = [
        _entry(
          profile: _profile(id: '1', name: 'Rafael'),
        ),
        _entry(
          profile: _profile(id: '2', name: 'Marina'),
        ),
      ];
      final result = applyDiscoverFilters(
        entries: entries,
        filters: AthleteDiscoverFilters.defaults,
        searchQuery: 'marina',
      );
      expect(result.single.userId, '2');
    });
  });

  group('discoverFirestoreConstraints', () {
    test('maps gender filter to Firestore value', () {
      expect(
        discoverGenderFirestoreValue(AthleteDiscoverGenderFilter.male),
        'Masculino',
      );
      expect(
        discoverGenderFirestoreValue(AthleteDiscoverGenderFilter.female),
        'Feminino',
      );
      expect(
        discoverGenderFirestoreValue(AthleteDiscoverGenderFilter.all),
        isNull,
      );
    });

    test('builds constraints from active filters', () {
      final constraints = discoverFirestoreConstraints(
        const AthleteDiscoverFilters(
          gender: AthleteDiscoverGenderFilter.female,
          lookingForPartnerOnly: true,
          sportFirestoreId: 'VOLEI_PRAIA',
        ),
      );
      expect(constraints.gender, 'Feminino');
      expect(constraints.lookingForPartnerOnly, isTrue);
      expect(constraints.sportFirestoreId, 'VOLEI_PRAIA');
      expect(constraints.isEmpty, isFalse);
    });

    test('defaults produce empty constraints', () {
      expect(
        discoverFirestoreConstraints(AthleteDiscoverFilters.defaults).isEmpty,
        isTrue,
      );
    });
  });

  group('discoverSportIdsForProfile', () {
    test('includes primary and secondary sports', () {
      final profile = _profile(
        primarySportId: 'VOLEI_PRAIA',
      ).copyWith(secondarySportFirestoreIds: const ['BEACH_TENNIS', 'TENIS']);
      expect(
        discoverSportIdsForProfile(profile),
        containsAll(['VOLEI_PRAIA', 'BEACH_TENNIS', 'TENIS']),
      );
    });
  });

  group('sortDiscoverEntries', () {
    test('sorts by ranking position', () {
      final entries = [
        _entry(profile: _profile(id: '1'), rank: 5, points: 100),
        _entry(profile: _profile(id: '2'), rank: 2, points: 200),
      ];
      final sorted = sortDiscoverEntries(
        entries: entries,
        sort: AthleteDiscoverSort.ranking,
      );
      expect(sorted.map((e) => e.userId).toList(), ['2', '1']);
    });

    test('sorts by level segments', () {
      final entries = [
        _entry(
          profile: _profile(id: '1', level: 'Iniciante'),
        ),
        _entry(
          profile: _profile(id: '2', level: 'Open'),
        ),
      ];
      final sorted = sortDiscoverEntries(
        entries: entries,
        sort: AthleteDiscoverSort.level,
      );
      // Sort por nível é decrescente: Open (3) vem antes de Iniciante (1).
      expect(sorted.first.userId, '2');
    });
  });
}
