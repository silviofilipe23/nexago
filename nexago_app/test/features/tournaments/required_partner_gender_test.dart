import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/features/tournaments/domain/partner_search_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

/// Em dupla MISTA o gênero exigido do parceiro é RELACIONAL: o oposto de quem
/// já está. O organizador nem tem opção "livre" para dupla — só para equipe —,
/// então Misto ali é mesmo 1 homem + 1 mulher.
void main() {
  TournamentCategoryOffer duo(String genderType) => TournamentCategoryOffer(
    id: 'c1',
    name: 'Categoria',
    entryFee: 140,
    genderType: genderType,
  );

  TournamentCategoryOffer team({
    int teamSize = 4,
    int? men,
    int? women,
    bool free = false,
  }) => TournamentCategoryOffer(
    id: 'c2',
    name: 'Quarteto',
    entryFee: 280,
    genderType: 'mixed',
    teamSize: teamSize,
    genderFree: free,
    genderCompositionMen: men,
    genderCompositionWomen: women,
  );

  AppUserProfile athlete(String uid, String? gender) =>
      AppUserProfile(uid: uid, gender: gender);

  group('requiredPartnerGenderTag — dupla de gênero fixo', () {
    test('devolve o gênero da própria categoria, independente de quem está', () {
      expect(
        requiredPartnerGenderTag(
          offer: duo('Masculino'),
          currentGenders: const ['Masculino'],
        ),
        'MASCULINO',
      );
      expect(
        requiredPartnerGenderTag(offer: duo('Feminino')),
        'FEMININO',
      );
    });
  });

  group('requiredPartnerGenderTag — dupla mista', () {
    test('titular homem exige parceira mulher', () {
      expect(
        requiredPartnerGenderTag(
          offer: duo('mixed'),
          currentGenders: const ['Masculino'],
        ),
        'FEMININO',
      );
    });

    test('titular mulher exige parceiro homem', () {
      expect(
        requiredPartnerGenderTag(
          offer: duo('Misto'),
          currentGenders: const ['F'],
        ),
        'MASCULINO',
      );
    });

    // Sem o gênero de quem convida não dá para calcular o oposto. Esconder
    // metade dos atletas no escuro seria pior que deixar o servidor recusar.
    test('sem gênero conhecido não filtra', () {
      expect(
        requiredPartnerGenderTag(
          offer: duo('mixed'),
          currentGenders: const [null],
        ),
        isNull,
      );
      expect(
        requiredPartnerGenderTag(
          offer: duo('mixed'),
          currentGenders: const ['  '],
        ),
        isNull,
      );
      expect(requiredPartnerGenderTag(offer: duo('mixed')), isNull);
    });

    test('gênero fora de M/F não define oposto', () {
      expect(
        requiredPartnerGenderTag(
          offer: duo('mixed'),
          currentGenders: const ['Outro'],
        ),
        isNull,
      );
    });

    // Categoria que não fala de gênero nenhum não pode virar 1H+1M por padrão.
    test('categoria sem gênero declarado não filtra', () {
      expect(requiredPartnerGenderTag(offer: duo('')), isNull);
    });
  });

  group('requiredPartnerGenderTag — equipe', () {
    test('composição de gênero único filtra sempre', () {
      expect(
        requiredPartnerGenderTag(offer: team(men: 4, women: 0)),
        'MASCULINO',
      );
      expect(
        requiredPartnerGenderTag(offer: team(men: 0, women: 4)),
        'FEMININO',
      );
    });

    test('equipe livre nunca filtra', () {
      expect(
        requiredPartnerGenderTag(
          offer: team(free: true, men: 2, women: 2),
          currentGenders: const ['M', 'M'],
        ),
        isNull,
      );
    });

    // 2H + 2M com as duas cotas abertas: os dois gêneros cabem.
    test('cotas abertas não filtram', () {
      expect(
        requiredPartnerGenderTag(
          offer: team(men: 2, women: 2),
          currentGenders: const ['Masculino'],
        ),
        isNull,
      );
    });

    test('cota masculina fechada passa a exigir mulher', () {
      expect(
        requiredPartnerGenderTag(
          offer: team(men: 2, women: 2),
          currentGenders: const ['Masculino', 'M'],
        ),
        'FEMININO',
      );
    });

    test('cota feminina fechada passa a exigir homem', () {
      expect(
        requiredPartnerGenderTag(
          offer: team(men: 2, women: 2),
          currentGenders: const ['F', 'Feminino'],
        ),
        'MASCULINO',
      );
    });

    test('elenco cheio dos dois lados não filtra (não há vaga)', () {
      expect(
        requiredPartnerGenderTag(
          offer: team(men: 2, women: 2),
          currentGenders: const ['M', 'M', 'F', 'F'],
        ),
        isNull,
      );
    });

    test('equipe sem composição declarada não filtra', () {
      expect(requiredPartnerGenderTag(offer: team()), isNull);
    });
  });

  group('filterPartnersByRequiredGender', () {
    final gente = [
      athlete('m1', 'Masculino'),
      athlete('f1', 'Feminino'),
      athlete('x1', 'Outro'),
      athlete('s1', null),
      athlete('s2', '   '),
    ];

    test('sem exigência devolve todo mundo', () {
      expect(filterPartnersByRequiredGender(gente, null).length, 5);
      expect(filterPartnersByRequiredGender(gente, 'MISTO').length, 5);
    });

    // Quem não declarou fica: sumir em silêncio deixava o convidante achando
    // que o parceiro não existe. O card avisa e o servidor recusa o aceite.
    test('exigir FEMININO tira homens e "Outro", mas mantém sem gênero', () {
      final ids = filterPartnersByRequiredGender(gente, 'FEMININO')
          .map((u) => u.uid)
          .toList();

      expect(ids, ['f1', 's1', 's2']);
    });

    test('exigir MASCULINO espelha o caso', () {
      final ids = filterPartnersByRequiredGender(gente, 'MASCULINO')
          .map((u) => u.uid)
          .toList();

      expect(ids, ['m1', 's1', 's2']);
    });
  });
}
