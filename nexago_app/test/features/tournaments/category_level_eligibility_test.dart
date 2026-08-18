import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/tournaments/domain/category_level_eligibility.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

TournamentCategoryOffer _offer(String level, {String minLevel = ''}) =>
    TournamentCategoryOffer(
      id: 'c-$level',
      name: level.isEmpty ? 'Livre' : level,
      entryFee: 0,
      level: level,
      minLevel: minLevel,
    );

AthleteProfile _athlete(
  String level, {
  Map<String, String> levelsBySportFirestore = const {},
  Map<String, bool> levelLocked = const {},
}) =>
    AthleteProfile(
      id: 'a',
      name: 'Atleta',
      sport: 'Vôlei de praia',
      level: level,
      city: 'Goiânia',
      levelsBySportFirestore: levelsBySportFirestore,
      levelLocked: levelLocked,
    );

void main() {
  group('levelRank', () {
    test('labels, códigos e legados', () {
      // Ranks unificados: legados como o degrau inferior do split da escada
      // de 7 (iniciante→0, intermediario→2, open→6).
      expect(CategoryLevelEligibility.levelRank('Iniciante'), 0);
      expect(CategoryLevelEligibility.levelRank('iniciante'), 0);
      expect(CategoryLevelEligibility.levelRank('Intermediário'), 2);
      expect(CategoryLevelEligibility.levelRank('intermediario'), 2);
      expect(CategoryLevelEligibility.levelRank('Open'), 6);
      expect(CategoryLevelEligibility.levelRank('open'), 6);
      expect(CategoryLevelEligibility.levelRank('Básico'), 0);
      expect(CategoryLevelEligibility.levelRank('livre'), 6);
      expect(CategoryLevelEligibility.levelRank(''), isNull);
      expect(CategoryLevelEligibility.levelRank('xpto'), isNull);
    });

    test('escada de 7 níveis do vôlei (labels e códigos)', () {
      expect(CategoryLevelEligibility.levelRank('Iniciante 1'), 0);
      expect(CategoryLevelEligibility.levelRank('iniciante_1'), 0);
      expect(CategoryLevelEligibility.levelRank('Iniciante 2'), 1);
      expect(CategoryLevelEligibility.levelRank('iniciante_2'), 1);
      expect(CategoryLevelEligibility.levelRank('Intermediário 1'), 2);
      expect(CategoryLevelEligibility.levelRank('intermediario_1'), 2);
      expect(CategoryLevelEligibility.levelRank('Intermediário 2'), 3);
      expect(CategoryLevelEligibility.levelRank('intermediario_2'), 3);
    });

    test('escada de 7: Avançado rankeia 4/5 e Open 6', () {
      expect(CategoryLevelEligibility.levelRank('avancado_1'), 4);
      expect(CategoryLevelEligibility.levelRank('Avançado 2'), 5);
      expect(CategoryLevelEligibility.levelRank('open'), 6);
      expect(CategoryLevelEligibility.levelRank('livre'), 6);
    });

    test('hierarquia crescente', () {
      expect(
        CategoryLevelEligibility.levelRank('iniciante')! <
            CategoryLevelEligibility.levelRank('intermediario')!,
        isTrue,
      );
      expect(
        CategoryLevelEligibility.levelRank('intermediario')! <
            CategoryLevelEligibility.levelRank('open')!,
        isTrue,
      );
    });
  });

  group('piso de nível (minLevel)', () {
    test('piso: atleta abaixo do minLevel é barrado, dentro da faixa entra',
        () {
      final elite = _offer('Open', minLevel: 'Avançado 1');
      expect(
          CategoryLevelEligibility.isCategoryEligibleForLevel(elite, 3), false);
      expect(
          CategoryLevelEligibility.isCategoryEligibleForLevel(elite, 4), true);
      expect(
          CategoryLevelEligibility.isCategoryEligibleForLevel(elite, 6), true);
    });

    test('offer sem minLevel se comporta como hoje', () {
      final livre = _offer('Open', minLevel: '');
      expect(
          CategoryLevelEligibility.isCategoryEligibleForLevel(livre, 0), true);
    });

    test('categoryMinLevelRank: ausente/desconhecido → 0 (sem piso)', () {
      expect(CategoryLevelEligibility.categoryMinLevelRank(_offer('Open')), 0);
      expect(
        CategoryLevelEligibility.categoryMinLevelRank(
          _offer('Open', minLevel: 'xpto'),
        ),
        0,
      );
    });

    test('minLevelBlockMessage cita o piso e o nível do atleta', () {
      final elite = _offer('Open', minLevel: 'Avançado 1');
      final message = CategoryLevelEligibility.minLevelBlockMessage(
        elite,
        _athlete('Intermediário 2'),
      );
      expect(message, contains('Avançado 1'));
      expect(message, contains('Intermediário 2'));
    });
  });

  group('categoryLevelRank', () {
    test('lê o nível da categoria', () {
      expect(
          CategoryLevelEligibility.categoryLevelRank(_offer('Iniciante')), 0);
      expect(
        CategoryLevelEligibility.categoryLevelRank(_offer('Intermediário')),
        2,
      );
      expect(
        CategoryLevelEligibility.categoryLevelRank(_offer('Intermediário 2')),
        3,
      );
      expect(CategoryLevelEligibility.categoryLevelRank(_offer('Open')), 6);
    });

    test('categoria sem nível → Open', () {
      expect(CategoryLevelEligibility.categoryLevelRank(_offer('')), 6);
    });
  });

  group('athleteLevelRank', () {
    test('usa o nível do perfil', () {
      expect(CategoryLevelEligibility.athleteLevelRank(_athlete('Open')), 6);
      expect(
        CategoryLevelEligibility.athleteLevelRank(_athlete('Intermediário')),
        2,
      );
    });

    test('sem perfil/nível → Iniciante (permissivo)', () {
      expect(CategoryLevelEligibility.athleteLevelRank(null), 0);
      expect(CategoryLevelEligibility.athleteLevelRank(_athlete('')), 0);
    });

    test('usa nível por esporte do torneio quando disponível', () {
      final a = _athlete(
        'iniciante',
        levelsBySportFirestore: {'VOLEI_PRAIA': 'open'},
      );
      expect(
        CategoryLevelEligibility.athleteLevelRank(
          a,
          tournamentSport: 'beachVolleyball',
        ),
        6,
      );
      // Esporte diferente cai no nível global.
      expect(
        CategoryLevelEligibility.athleteLevelRank(
          a,
          tournamentSport: 'indoorVolleyball',
        ),
        0,
      );
    });

    test('esporte com código mas sem nível salvo cai no global', () {
      final a = _athlete(
        'open',
        levelsBySportFirestore: {'VOLEI_PRAIA': 'iniciante'},
      );
      expect(
        CategoryLevelEligibility.athleteLevelRank(
          a,
          tournamentSport: 'footvolley',
        ),
        6,
      );
    });
  });

  group('tournamentSportToLevelSportCode', () {
    test('mapeia esportes de torneio para o código do perfil', () {
      expect(
        CategoryLevelEligibility.tournamentSportToLevelSportCode(
          'beachVolleyball',
        ),
        'VOLEI_PRAIA',
      );
      expect(
        CategoryLevelEligibility.tournamentSportToLevelSportCode(
          'indoorVolleyball',
        ),
        'VOLEI_QUADRA',
      );
      expect(
        CategoryLevelEligibility.tournamentSportToLevelSportCode('footvolley'),
        'FUTEVOLEI',
      );
      expect(
        CategoryLevelEligibility.tournamentSportToLevelSportCode('beachTennis'),
        'BEACH_TENNIS',
      );
      expect(
        CategoryLevelEligibility.tournamentSportToLevelSportCode('xadrez'),
        isNull,
      );
    });
  });

  group('isCategoryEligibleForAthlete por esporte', () {
    test('atleta Open no vôlei de praia não pode categoria Intermediário', () {
      final a = _athlete(
        'iniciante',
        levelsBySportFirestore: {'VOLEI_PRAIA': 'open'},
      );
      expect(
        CategoryLevelEligibility.isCategoryEligibleForAthlete(
          _offer('Intermediário'),
          a,
          tournamentSport: 'beachVolleyball',
        ),
        isFalse,
      );
      expect(
        CategoryLevelEligibility.isCategoryEligibleForAthlete(
          _offer('Open'),
          a,
          tournamentSport: 'beachVolleyball',
        ),
        isTrue,
      );
    });
  });

  group('isCategoryEligibleForAthlete', () {
    test('atleta Iniciante pode tudo', () {
      final a = _athlete('Iniciante');
      expect(
        CategoryLevelEligibility.isCategoryEligibleForAthlete(
          _offer('Iniciante'),
          a,
        ),
        isTrue,
      );
      expect(
        CategoryLevelEligibility.isCategoryEligibleForAthlete(
          _offer('Open'),
          a,
        ),
        isTrue,
      );
    });

    test('atleta Intermediário não pode Iniciante', () {
      final a = _athlete('Intermediário');
      expect(
        CategoryLevelEligibility.isCategoryEligibleForAthlete(
          _offer('Iniciante'),
          a,
        ),
        isFalse,
      );
      expect(
        CategoryLevelEligibility.isCategoryEligibleForAthlete(
          _offer('Intermediário'),
          a,
        ),
        isTrue,
      );
      expect(
        CategoryLevelEligibility.isCategoryEligibleForAthlete(
          _offer('Open'),
          a,
        ),
        isTrue,
      );
    });

    test('atleta Open só pode Open', () {
      final a = _athlete('Open');
      expect(
        CategoryLevelEligibility.isCategoryEligibleForAthlete(
          _offer('Iniciante'),
          a,
        ),
        isFalse,
      );
      expect(
        CategoryLevelEligibility.isCategoryEligibleForAthlete(
          _offer('Intermediário'),
          a,
        ),
        isFalse,
      );
      expect(
        CategoryLevelEligibility.isCategoryEligibleForAthlete(
          _offer('Open'),
          a,
        ),
        isTrue,
      );
    });
  });

  group('blockMessage', () {
    test('cita o nível do atleta', () {
      expect(
        CategoryLevelEligibility.blockMessage(_athlete('Open')),
        contains('Open'),
      );
    });
  });

  group('needsLevelConfirmation', () {
    test('esporte mapeado e ainda não travado → precisa confirmar', () {
      final a = _athlete('open', levelLocked: {'VOLEI_QUADRA': true});
      expect(
        CategoryLevelEligibility.needsLevelConfirmation(
          a,
          tournamentSport: 'beachVolleyball',
        ),
        isTrue,
      );
    });

    test('esporte já travado (levelLocked true) → não precisa confirmar', () {
      final a = _athlete('open', levelLocked: {'VOLEI_PRAIA': true});
      expect(
        CategoryLevelEligibility.needsLevelConfirmation(
          a,
          tournamentSport: 'beachVolleyball',
        ),
        isFalse,
      );
    });

    test('esporte do torneio sem equivalente no perfil → não precisa confirmar',
        () {
      final a = _athlete('open');
      expect(
        CategoryLevelEligibility.needsLevelConfirmation(
          a,
          tournamentSport: 'xadrez',
        ),
        isFalse,
      );
    });

    test('perfil nulo → não precisa confirmar', () {
      expect(
        CategoryLevelEligibility.needsLevelConfirmation(
          null,
          tournamentSport: 'beachVolleyball',
        ),
        isFalse,
      );
    });

    test('mapa levelLocked vazio (nunca travou) → precisa confirmar', () {
      final a = _athlete('iniciante');
      expect(
        CategoryLevelEligibility.needsLevelConfirmation(
          a,
          tournamentSport: 'footvolley',
        ),
        isTrue,
      );
    });
  });

  group('resolveLevelConfirmationPrompt', () {
    // Achado do review (I1): ler `athleteProfileProvider.valueOrNull`
    // decide com `null` tanto quando o perfil está ausente quanto quando o
    // stream SÓ AINDA NÃO EMITIU — o gate pulava em silêncio no segundo
    // caso. Este teste prova que a função espera o Future resolver ANTES
    // de decidir, em vez de tratar "ainda pendente" como "sem perfil".
    test(
      'aguarda o Future resolver antes de decidir — não decide com o perfil '
      'ainda carregando',
      () async {
        final completer = Completer<AthleteProfile?>();
        var resolved = false;

        final future = CategoryLevelEligibility.resolveLevelConfirmationPrompt(
          completer.future,
          tournamentSport: 'beachVolleyball',
        )..then((_) => resolved = true);

        // "Perfil ainda carregando": o Future não completou. Se a função
        // decidisse com um snapshot `null` nesse instante (regressão I1),
        // já teria resolvido aqui — não deve.
        await Future<void>.delayed(Duration.zero);
        expect(resolved, isFalse);

        completer.complete(_athlete('iniciante_1'));
        final prompt = await future;

        expect(resolved, isTrue);
        expect(prompt, isNotNull);
        expect(prompt!.levelLabel, 'Iniciante 1');
        expect(prompt.sportLabel, 'Vôlei de praia');
      },
    );

    test('esporte ainda não travado → prompt com nível e esporte em PT',
        () async {
      final a = _athlete(
        'open',
        levelsBySportFirestore: {'FUTEVOLEI': 'avancado_1'},
      );
      final prompt =
          await CategoryLevelEligibility.resolveLevelConfirmationPrompt(
        Future.value(a),
        tournamentSport: 'footvolley',
      );
      expect(prompt, isNotNull);
      expect(prompt!.levelLabel, 'Avançado 1');
      expect(prompt.sportLabel, 'Futevôlei');
    });

    test('esporte já travado → null (não pede confirmação)', () async {
      final a = _athlete('open', levelLocked: {'VOLEI_PRAIA': true});
      final prompt =
          await CategoryLevelEligibility.resolveLevelConfirmationPrompt(
        Future.value(a),
        tournamentSport: 'beachVolleyball',
      );
      expect(prompt, isNull);
    });

    test('perfil realmente ausente (Future resolve com null) → null', () async {
      final prompt =
          await CategoryLevelEligibility.resolveLevelConfirmationPrompt(
        Future.value(null),
        tournamentSport: 'beachVolleyball',
      );
      expect(prompt, isNull);
    });

    test('erro no Future propaga pro chamador (quem decide bloquear)',
        () async {
      Future<AthleteProfile?> failing() async {
        throw StateError('stream com erro');
      }

      await expectLater(
        CategoryLevelEligibility.resolveLevelConfirmationPrompt(
          failing(),
          tournamentSport: 'beachVolleyball',
        ),
        throwsA(isA<StateError>()),
      );
    });
  });

  // Fix pós-review (calibração de nível, F2): `TournamentPartnerInvitePage` descobria o
  // esporte de um `AsyncValue<TournamentDetail?>` que, no branch de ERRO da árvore de widgets,
  // vira `null` — e `needsLevelConfirmation` tratava "não sei o esporte" IGUAL a "esporte sem
  // equivalente no perfil", pulando a confirmação em SILÊNCIO bem no aceite que pode ser a 1ª
  // inscrição ativa (a que tranca a janela). `resolveLevelConfirmationPromptForTournament`
  // busca o esporte FRESCO em vez de aceitar o valor já resolvido (possivelmente nulo por
  // erro) pelo chamador.
  group('resolveLevelConfirmationPromptForTournament', () {
    test(
      'esporte destravado: pede confirmação com o esporte buscado fresco',
      () async {
        final a = _athlete('iniciante_1');
        final prompt = await CategoryLevelEligibility
            .resolveLevelConfirmationPromptForTournament(
          Future.value(a),
          Future.value('beachVolleyball'),
        );
        expect(prompt, isNotNull);
        expect(prompt!.levelLabel, 'Iniciante 1');
        expect(prompt.sportLabel, 'Vôlei de praia');
      },
    );

    test(
      'esporte genuinamente ausente (Future resolve com null, ex.: torneio '
      'apagado) → null, sem travar em silêncio um caso diferente',
      () async {
        final a = _athlete('iniciante_1');
        final prompt = await CategoryLevelEligibility
            .resolveLevelConfirmationPromptForTournament(
          Future.value(a),
          Future.value(null),
        );
        expect(prompt, isNull);
      },
    );

    test(
      'falha ao buscar o esporte do torneio (branch de erro do provider) '
      'propaga pro chamador — NÃO vira "sem esporte" em silêncio',
      () async {
        Future<String?> failing() async {
          throw StateError('busca do torneio falhou');
        }

        await expectLater(
          CategoryLevelEligibility.resolveLevelConfirmationPromptForTournament(
            Future.value(_athlete('iniciante_1')),
            failing(),
          ),
          throwsA(isA<StateError>()),
        );
      },
    );

    test('falha ao buscar o perfil também propaga pro chamador', () async {
      Future<AthleteProfile?> failing() async {
        throw StateError('perfil com erro');
      }

      await expectLater(
        CategoryLevelEligibility.resolveLevelConfirmationPromptForTournament(
          failing(),
          Future.value('beachVolleyball'),
        ),
        throwsA(isA<StateError>()),
      );
    });

    test('esporte já travado: null, mesmo buscando fresco', () async {
      final a = _athlete('open', levelLocked: {'VOLEI_PRAIA': true});
      final prompt = await CategoryLevelEligibility
          .resolveLevelConfirmationPromptForTournament(
        Future.value(a),
        Future.value('beachVolleyball'),
      );
      expect(prompt, isNull);
    });
  });
}
