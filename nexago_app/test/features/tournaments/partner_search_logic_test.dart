import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/features/tournaments/domain/partner_search_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_logic.dart';
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
    const other = AppUserProfile(uid: 'o', gender: 'Outro', fullName: 'D');

    test('filters masculino category keeping athletes without gender', () {
      // Gênero vazio aparece com aviso em vez de sumir em silêncio;
      // o aceite valida no servidor.
      final result = filterPartnersByCategoryGender(
        [male, female, noGender],
        'Masculino',
      );
      expect(result.map((u) => u.uid), ['m', 'x']);
    });

    test('matches legacy lowercase gender values', () {
      const legacyMale = AppUserProfile(uid: 'lm', gender: 'masculino');
      expect(
        filterPartnersByCategoryGender([legacyMale], 'Masculino').length,
        1,
      );
    });

    test('no filter for misto', () {
      final result = filterPartnersByCategoryGender(
        [male, female, noGender, other],
        'Misto',
      );
      expect(result.length, 4);
    });

    test('filters feminino category keeping athletes without gender', () {
      // Mesma regra do masculino: vazio aparece, aceite valida no servidor.
      final result = filterPartnersByCategoryGender(
        [male, female, noGender],
        'Feminino',
      );
      expect(result.map((u) => u.uid), ['f', 'x']);
    });

    test('filters canonical Firestore genderType male/female/mixed', () {
      expect(
        filterPartnersByCategoryGender([male, female], 'male')
            .map((u) => u.uid),
        ['m'],
      );
      expect(
        filterPartnersByCategoryGender([male, female], 'female')
            .map((u) => u.uid),
        ['f'],
      );
      expect(
        filterPartnersByCategoryGender([male, female], 'mixed').length,
        2,
      );
    });

    test('includes athletes without gender for restricted categories', () {
      // Antes era filtrado e o convidante achava que o parceiro não existia.
      expect(
        filterPartnersByCategoryGender([noGender], 'male').map((u) => u.uid),
        ['x'],
      );
    });

    test('excludes declared gender Outro in masculino and feminino', () {
      expect(
        filterPartnersByCategoryGender([other], 'Masculino'),
        isEmpty,
      );
      expect(
        filterPartnersByCategoryGender([other], 'Feminino'),
        isEmpty,
      );
    });
  });

  group('partnerGenderPendencyLabel', () {
    const noGender = AppUserProfile(uid: 'x', fullName: 'C');

    test('flags missing gender in fixed-gender category', () {
      expect(
        partnerGenderPendencyLabel(noGender, 'Masculino'),
        'Sem gênero no perfil',
      );
    });

    test('returns null for misto category', () {
      expect(partnerGenderPendencyLabel(noGender, 'Misto'), isNull);
    });

    test('returns null when gender matches category', () {
      const female = AppUserProfile(uid: 'f', gender: 'Feminino');
      expect(partnerGenderPendencyLabel(female, 'Feminino'), isNull);
    });

    test('returns null for declared gender Outro', () {
      // 'Outro' é preenchido; a pendência é só sobre cadastro incompleto.
      const other = AppUserProfile(uid: 'o', gender: 'Outro');
      expect(partnerGenderPendencyLabel(other, 'Masculino'), isNull);
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

    test('strips @ from nickname for display', () {
      expect(
        appUserDisplayName(
          const AppUserProfile(
            uid: '1',
            nickname: '@enzo',
            fullName: 'Enzo Ribeiro',
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

  group('filterPartnersByQuery', () {
    const users = [
      AppUserProfile(uid: '1', nickname: 'Enzo', fullName: 'Enzo Ribeiro'),
      AppUserProfile(uid: '2', fullName: 'Maria Silva', email: 'maria@test.com'),
    ];

    test('returns all when query is empty', () {
      expect(filterPartnersByQuery(users, ''), users);
    });

    test('matches nickname fullName or email', () {
      expect(
        filterPartnersByQuery(users, 'enzo').map((u) => u.uid),
        ['1'],
      );
      expect(
        filterPartnersByQuery(users, 'maria@test').map((u) => u.uid),
        ['2'],
      );
    });
  });

  group('sortPartnersForDisplay', () {
    test('sorts by display name', () {
      final sorted = sortPartnersForDisplay([
        const AppUserProfile(uid: '2', fullName: 'Zeca'),
        const AppUserProfile(uid: '1', fullName: 'Ana'),
      ]);
      expect(sorted.map((u) => u.uid), ['1', '2']);
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

  // Categoria de EQUIPE não usa `genderType`: a composição é que manda. Livre
  // e misto exato não filtram (a composição completa é conta do backend, que
  // valida elenco + convites pendentes); só equipe de gênero único filtra.
  group('categoryGenderForPartnerFilter em categoria de equipe', () {
    TournamentCategoryOffer team({
      int? men,
      int? women,
      bool free = false,
      String genderType = 'Mix',
    }) {
      return TournamentCategoryOffer(
        id: 'quarteto',
        name: 'Quarteto Misto',
        entryFee: 200,
        level: 'A',
        teamSize: 4,
        genderFree: free,
        genderType: genderType,
        genderCompositionMen: men,
        genderCompositionWomen: women,
      );
    }

    test('equipe só de homens filtra por masculino', () {
      expect(
        genderTagFromText(categoryGenderForPartnerFilter(team(men: 4, women: 0))),
        'MASCULINO',
      );
    });

    test('equipe só de mulheres filtra por feminino', () {
      expect(
        genderTagFromText(categoryGenderForPartnerFilter(team(men: 0, women: 4))),
        'FEMININO',
      );
    });

    test('equipe mista exata não filtra', () {
      expect(
        genderTagFromText(categoryGenderForPartnerFilter(team(men: 2, women: 2))),
        anyOf(isNull, 'MISTO'),
      );
    });

    test('equipe livre não filtra', () {
      expect(
        genderTagFromText(categoryGenderForPartnerFilter(team(free: true))),
        anyOf(isNull, 'MISTO'),
      );
    });

    // O nome da categoria não pode virar filtro em equipe: "Quarteto
    // Masculino Livre" filtraria homens numa equipe que aceita todo mundo.
    test('nome da categoria não vira filtro em equipe livre', () {
      final offer = TournamentCategoryOffer(
        id: 'q',
        name: 'Quarteto Masculino e Feminino',
        entryFee: 200,
        level: 'A',
        teamSize: 4,
        genderFree: true,
        genderType: '',
      );

      expect(
        genderTagFromText(categoryGenderForPartnerFilter(offer)),
        anyOf(isNull, 'MISTO'),
      );
    });
  });
}
