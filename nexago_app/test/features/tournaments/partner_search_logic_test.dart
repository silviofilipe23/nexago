import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/app_user_profile.dart';
import 'package:nexago_app/features/tournaments/domain/partner_search_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_logic.dart';

void main() {
  group('nicknameSearchPrefixes', () {
    test('returns case variants for multi-char term', () {
      final prefixes = nicknameSearchPrefixes('Enzo');
      expect(prefixes, contains('Enzo'));
      expect(prefixes, contains('enzo'));
      expect(prefixes, contains('ENZO'));
    });

    test('returns empty for blank term', () {
      expect(nicknameSearchPrefixes('  '), isEmpty);
    });
  });

  group('filterPartnersByCategoryGender', () {
    const male = AppUserProfile(uid: 'm', gender: 'Masculino', fullName: 'A');
    const female = AppUserProfile(uid: 'f', gender: 'Feminino', fullName: 'B');
    const noGender = AppUserProfile(uid: 'x', fullName: 'C');

    test('filters masculino category', () {
      final result = filterPartnersByCategoryGender(
        [male, female, noGender],
        'Masculino',
      );
      expect(result.map((u) => u.uid), ['m']);
    });

    test('no filter for misto', () {
      final result = filterPartnersByCategoryGender(
        [male, female, noGender],
        'Misto',
      );
      expect(result.length, 3);
    });
  });

  group('appUserDisplayName', () {
    test('prefers nickname then fullName then email', () {
      expect(
        appUserDisplayName(
          const AppUserProfile(
            uid: '1',
            nickname: 'enzo',
            fullName: 'Enzo Ribeiro',
            email: 'e@test.com',
          ),
        ),
        'enzo',
      );
    });
  });

  group('partnerCandidateFromProfile', () {
    test('maps profile to candidate', () {
      final candidate = partnerCandidateFromProfile(
        const AppUserProfile(
          uid: 'u1',
          fullName: 'Enzo Ribeiro',
          email: 'enzo@test.com',
        ),
        tagLabel: 'Mesma arena',
      );

      expect(candidate.userId, 'u1');
      expect(candidate.name, 'Enzo Ribeiro');
      expect(candidate.tagLabel, 'Mesma arena');
    });
  });

  group('partnerResultsHeader', () {
    test('formats count and category badge', () {
      const category = TournamentCategoryOffer(
        id: 'sub19',
        name: 'Sub 19',
        entryFee: 90,
        level: 'S19',
      );

      expect(
        partnerResultsHeader(count: 3, category: category),
        '3 RESULTADOS · S19',
      );
    });
  });
}
