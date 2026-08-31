import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/category_age_eligibility.dart';
import 'package:nexago_app/features/tournaments/domain/registration_shell_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

TournamentCategoryOffer offer({
  bool registrationClosed = false,
  bool isCompleted = false,
  int? teamSize,
}) {
  return TournamentCategoryOffer(
    id: 'cat-1',
    name: 'Misto Iniciante',
    entryFee: 140,
    registrationClosed: registrationClosed,
    isCompleted: isCompleted,
    teamSize: teamSize,
  );
}

void main() {
  group('registrationCategoryStatus — ordem das checagens', () {
    // A ordem é contrato, copiada do shell da web. Estes casos existem porque
    // trocar duas linhas de lugar muda o que o atleta vê sem quebrar nada.
    test('já inscrito ganha de encerrada e de lotada', () {
      final status = registrationCategoryStatus(
        offer: offer(registrationClosed: true),
        alreadyRegistered: true,
        spotsLeft: 0,
      );

      expect(status.badge, 'JÁ INSCRITO');
      expect(status.blocked, isFalse);
    });

    // O beco sem saída da inscrição solo pendente: se "JÁ INSCRITO" bloqueasse,
    // quem reservou sem parceiro não teria caminho de volta ao convite.
    test('já inscrito NUNCA bloqueia', () {
      final status = registrationCategoryStatus(
        offer: offer(),
        alreadyRegistered: true,
        spotsLeft: 5,
        eligibility: const RegistrationEligibilityInput(levelBlocked: true),
      );

      expect(status.blocked, isFalse);
      expect(status.isRegistered, isTrue);
    });

    test('encerrada ganha de lotada', () {
      final status = registrationCategoryStatus(
        offer: offer(registrationClosed: true),
        alreadyRegistered: false,
        spotsLeft: 0,
      );

      expect(status.badge, 'ENCERRADA');
      expect(status.blocked, isTrue);
    });

    test('categoria concluída conta como encerrada', () {
      final status = registrationCategoryStatus(
        offer: offer(isCompleted: true),
        alreadyRegistered: false,
        spotsLeft: 8,
      );

      expect(status.badge, 'ENCERRADA');
    });

    test('lotada ganha da elegibilidade', () {
      final status = registrationCategoryStatus(
        offer: offer(),
        alreadyRegistered: false,
        spotsLeft: 0,
        eligibility: const RegistrationEligibilityInput(genderBlocked: true),
      );

      expect(status.badge, 'LOTADO');
    });

    // Capacidade desconhecida (sem teto, ou contagem ainda carregando) não pode
    // virar "LOTADO" no escuro — barraria inscrição válida.
    test('vagas desconhecidas não viram lotado', () {
      final status = registrationCategoryStatus(
        offer: offer(),
        alreadyRegistered: false,
        spotsLeft: null,
      );

      expect(status.badge, isNull);
      expect(status.blocked, isFalse);
    });

    test('categoria livre e elegível não tem selo nem bloqueio', () {
      final status = registrationCategoryStatus(
        offer: offer(),
        alreadyRegistered: false,
        spotsLeft: 3,
      );

      expect(status.badge, isNull);
      expect(status.blocked, isFalse);
      expect(status.message, isNull);
    });
  });

  group('registrationCategoryStatus — elegibilidade', () {
    test('gênero bloqueia com selo próprio', () {
      final status = registrationCategoryStatus(
        offer: offer(),
        alreadyRegistered: false,
        spotsLeft: 3,
        eligibility: const RegistrationEligibilityInput(genderBlocked: true),
      );

      expect(status.badge, 'GÊNERO');
      expect(status.blocked, isTrue);
      expect(status.message, isNotNull);
    });

    test('idade usa o selo e a mensagem do avaliador de idade', () {
      final status = registrationCategoryStatus(
        offer: offer(),
        alreadyRegistered: false,
        spotsLeft: 3,
        eligibility: const RegistrationEligibilityInput(
          ageEligibility: AgeEligibility.missingBirthDate,
        ),
      );

      expect(status.badge, 'COMPLETE SUA DATA DE NASCIMENTO');
      expect(status.blocked, isTrue);
    });

    // Piso e teto de nível dão o mesmo selo mas mensagens diferentes: uma diz
    // "seu nível é acima", a outra "o mínimo é acima do seu".
    test('abaixo do piso e acima do teto se distinguem pela mensagem', () {
      final below = registrationCategoryStatus(
        offer: offer(),
        alreadyRegistered: false,
        spotsLeft: 3,
        eligibility: const RegistrationEligibilityInput(belowMinLevel: true),
      );
      final above = registrationCategoryStatus(
        offer: offer(),
        alreadyRegistered: false,
        spotsLeft: 3,
        eligibility: const RegistrationEligibilityInput(levelBlocked: true),
      );

      expect(below.badge, 'NÍVEL');
      expect(above.badge, 'NÍVEL');
      expect(below.message, isNot(equals(above.message)));
      expect(below.message, contains('mínimo'));
      expect(above.message, contains('acima desta categoria'));
    });
  });

  group('registrationCardState', () {
    test('convite recebido vem antes de tudo', () {
      expect(
        registrationCardState(
          hasReceivedInvite: true,
          hasRegistration: false,
          partnerPending: false,
          isPaid: false,
        ),
        RegistrationCardState.receivedInvite,
      );
    });

    // Aceitar o convite cria a inscrição; a partir daí quem manda é ela, senão
    // o cartão continuaria oferecendo "aceitar" de um convite já respondido.
    test('inscrição existente ganha do convite recebido', () {
      expect(
        registrationCardState(
          hasReceivedInvite: true,
          hasRegistration: true,
          partnerPending: true,
          isPaid: false,
        ),
        RegistrationCardState.awaitingRoster,
      );
    });

    test('sem inscrição e sem convite: reservar vaga', () {
      expect(
        registrationCardState(
          hasReceivedInvite: false,
          hasRegistration: false,
          partnerPending: false,
          isPaid: false,
        ),
        RegistrationCardState.notRegistered,
      );
    });

    test('elenco fechado e não pago: pagamento', () {
      expect(
        registrationCardState(
          hasReceivedInvite: false,
          hasRegistration: true,
          partnerPending: false,
          isPaid: false,
        ),
        RegistrationCardState.awaitingPayment,
      );
    });

    test('pago: confirmada', () {
      expect(
        registrationCardState(
          hasReceivedInvite: false,
          hasRegistration: true,
          partnerPending: false,
          isPaid: true,
        ),
        RegistrationCardState.confirmed,
      );
    });
  });

  group('registrationSummaryStatusLabel', () {
    test('sem inscrição', () {
      expect(
        registrationSummaryStatusLabel(
          hasRegistration: false,
          partnerPending: false,
          isPaid: false,
          isTeamCategory: false,
          rosterCount: 0,
          teamSize: 2,
          sentInviteCount: 0,
        ),
        'Não inscrito',
      );
    });

    test('dupla sem convite enviado', () {
      expect(
        registrationSummaryStatusLabel(
          hasRegistration: true,
          partnerPending: true,
          isPaid: false,
          isTeamCategory: false,
          rosterCount: 1,
          teamSize: 2,
          sentInviteCount: 0,
        ),
        'Falta parceiro',
      );
    });

    test('dupla com um e com vários convites', () {
      String label(int n) => registrationSummaryStatusLabel(
        hasRegistration: true,
        partnerPending: true,
        isPaid: false,
        isTeamCategory: false,
        rosterCount: 1,
        teamSize: 2,
        sentInviteCount: n,
      );

      expect(label(1), 'Convite enviado');
      expect(label(3), 'Convites enviados');
    });

    // Solo pagou o valor integral: a vaga já é dele, e o rótulo diz isso ANTES
    // de contar convites — "Convite enviado" esconderia que a vaga está paga.
    test('solo pago sem parceiro: vaga garantida, com ou sem convites', () {
      String label(int sent) => registrationSummaryStatusLabel(
        hasRegistration: true,
        partnerPending: true,
        isPaid: true,
        isTeamCategory: false,
        rosterCount: 1,
        teamSize: 2,
        sentInviteCount: sent,
      );

      expect(label(0), 'Vaga garantida — falta parceiro');
      expect(label(1), 'Vaga garantida — falta parceiro');
      expect(label(3), 'Vaga garantida — falta parceiro');
    });

    // Em EQUIPE o "pago sem elenco fechado" não existe como estado especial:
    // o rótulo continua sendo o progresso do elenco.
    test('equipe paga com elenco aberto continua mostrando o elenco', () {
      expect(
        registrationSummaryStatusLabel(
          hasRegistration: true,
          partnerPending: true,
          isPaid: true,
          isTeamCategory: true,
          rosterCount: 2,
          teamSize: 4,
          sentInviteCount: 0,
        ),
        'Elenco 2/4',
      );
    });

    test('equipe mostra o elenco', () {
      expect(
        registrationSummaryStatusLabel(
          hasRegistration: true,
          partnerPending: true,
          isPaid: false,
          isTeamCategory: true,
          rosterCount: 3,
          teamSize: 4,
          sentInviteCount: 1,
        ),
        'Elenco 3/4',
      );
    });

    test('fechada e paga', () {
      expect(
        registrationSummaryStatusLabel(
          hasRegistration: true,
          partnerPending: false,
          isPaid: false,
          isTeamCategory: false,
          rosterCount: 2,
          teamSize: 2,
          sentInviteCount: 0,
        ),
        'Aguardando pagamento',
      );
      expect(
        registrationSummaryStatusLabel(
          hasRegistration: true,
          partnerPending: false,
          isPaid: true,
          isTeamCategory: false,
          rosterCount: 2,
          teamSize: 2,
          sentInviteCount: 0,
        ),
        'Confirmada',
      );
    });
  });

  group('registrationRosterNote', () {
    test('dupla sem convite pede busca; com convite pendente vira espera', () {
      expect(
        registrationRosterNote(
          isTeamCategory: false,
          rosterCount: 1,
          teamSize: 2,
          isCaptain: true,
          isPaid: false,
          hasPendingInvite: false,
        ),
        'Vaga reservada! Agora busque e convide seu parceiro de dupla.',
      );
      expect(
        registrationRosterNote(
          isTeamCategory: false,
          rosterCount: 1,
          teamSize: 2,
          isCaptain: true,
          isPaid: false,
          hasPendingInvite: true,
        ),
        'Convite enviado! Agora é só aguardar a resposta do seu parceiro.',
      );
    });

    test('dupla paga mantém a vaga garantida nos dois estados', () {
      expect(
        registrationRosterNote(
          isTeamCategory: false,
          rosterCount: 1,
          teamSize: 2,
          isCaptain: true,
          isPaid: true,
          hasPendingInvite: false,
        ),
        'Vaga garantida! Você pagou o valor integral — convide seu parceiro, '
        'ele entra sem taxa.',
      );
      expect(
        registrationRosterNote(
          isTeamCategory: false,
          rosterCount: 1,
          teamSize: 2,
          isCaptain: true,
          isPaid: true,
          hasPendingInvite: true,
        ),
        'Vaga garantida! Convite enviado — seu parceiro entra sem taxa assim '
        'que aceitar.',
      );
    });

    test('equipe mostra o elenco e o papel de quem olha', () {
      expect(
        registrationRosterNote(
          isTeamCategory: true,
          rosterCount: 2,
          teamSize: 4,
          isCaptain: true,
          isPaid: false,
          hasPendingInvite: true,
        ),
        'Elenco 2/4. Convide os atletas que faltam.',
      );
      expect(
        registrationRosterNote(
          isTeamCategory: true,
          rosterCount: 2,
          teamSize: 4,
          isCaptain: false,
          isPaid: false,
          hasPendingInvite: false,
        ),
        'Elenco 2/4. O capitão está montando o elenco.',
      );
    });
  });

  group('registrationRemainingInviteSlots', () {
    // Depois de convidar, a lista de atletas some: para chamar outra pessoa o
    // atleta cancela o convite pendente. Convites antigos em paralelo seguem
    // valendo — o primeiro aceite fecha e o backend derruba os demais.
    test('dupla fecha a busca enquanto houver convite pendente', () {
      expect(
        registrationRemainingInviteSlots(
          teamSize: null,
          rosterCount: 1,
          pendingInviteCount: 0,
        ),
        1,
      );
      expect(
        registrationRemainingInviteSlots(
          teamSize: null,
          rosterCount: 1,
          pendingInviteCount: 1,
        ),
        0,
      );
      expect(
        registrationRemainingInviteSlots(
          teamSize: null,
          rosterCount: 1,
          pendingInviteCount: 3,
        ),
        0,
      );
    });

    test('equipe desconta elenco e convites pendentes', () {
      expect(
        registrationRemainingInviteSlots(
          teamSize: 4,
          rosterCount: 2,
          pendingInviteCount: 1,
        ),
        1,
      );
    });

    test('nunca devolve negativo', () {
      expect(
        registrationRemainingInviteSlots(
          teamSize: 4,
          rosterCount: 3,
          pendingInviteCount: 3,
        ),
        0,
      );
    });
  });

  group('registrationCardStepNumber', () {
    test('uniforme empurra "Sua inscrição" para o passo 3', () {
      expect(registrationCardStepNumber(uniformRequired: true), 3);
      expect(registrationCardStepNumber(uniformRequired: false), 2);
    });
  });

  group('registrationCategoryStatus — inscrições ainda não abertas', () {
    final opensAt = DateTime(2026, 9, 5, 10, 0);

    test('registrationOpensAt futuro bloqueia com EM BREVE e informa '
        'data e hora', () {
      final status = registrationCategoryStatus(
        offer: offer(),
        alreadyRegistered: false,
        spotsLeft: 5,
        registrationOpensAt: opensAt,
        now: DateTime(2026, 9, 5, 9, 59),
      );

      expect(status.badge, 'EM BREVE');
      expect(status.blocked, isTrue);
      expect(status.message, contains('05/09'));
      expect(status.message, contains('10:00'));
    });

    test('no instante configurado a inscrição abre', () {
      final status = registrationCategoryStatus(
        offer: offer(),
        alreadyRegistered: false,
        spotsLeft: 5,
        registrationOpensAt: opensAt,
        now: opensAt,
      );

      expect(status.blocked, isFalse);
      expect(status.badge, isNull);
    });

    test('já inscrito ganha de EM BREVE', () {
      final status = registrationCategoryStatus(
        offer: offer(),
        alreadyRegistered: true,
        spotsLeft: 5,
        registrationOpensAt: opensAt,
        now: DateTime(2026, 9, 5, 9, 0),
      );

      expect(status.badge, 'JÁ INSCRITO');
      expect(status.blocked, isFalse);
    });

    // Espelha o guard do servidor (`assertTournamentAcceptsRegistration`):
    // o calendário do torneio é checado antes das travas de categoria.
    test('EM BREVE ganha de encerrada e de lotada', () {
      final status = registrationCategoryStatus(
        offer: offer(registrationClosed: true),
        alreadyRegistered: false,
        spotsLeft: 0,
        registrationOpensAt: opensAt,
        now: DateTime(2026, 9, 5, 9, 0),
      );

      expect(status.badge, 'EM BREVE');
      expect(status.blocked, isTrue);
    });

    // Fim da cadeia: antes de abrir, a resposta certa é "quando abre", não
    // "seu gênero/idade/nível não serve" — o atleta nem pode tentar ainda.
    test('EM BREVE ganha da elegibilidade (gênero, idade e nível)', () {
      final status = registrationCategoryStatus(
        offer: offer(),
        alreadyRegistered: false,
        spotsLeft: 5,
        eligibility: const RegistrationEligibilityInput(
          genderBlocked: true,
          levelBlocked: true,
          belowMinLevel: true,
          ageEligibility: AgeEligibility.outOfRange,
        ),
        registrationOpensAt: opensAt,
        now: DateTime(2026, 9, 5, 9, 0),
      );

      expect(status.badge, 'EM BREVE');
      expect(status.blocked, isTrue);
    });

    test('depois de aberto, as travas de categoria voltam a valer', () {
      final status = registrationCategoryStatus(
        offer: offer(registrationClosed: true),
        alreadyRegistered: false,
        spotsLeft: 0,
        registrationOpensAt: opensAt,
        now: DateTime(2026, 9, 5, 10, 1),
      );

      expect(status.badge, 'ENCERRADA');
      expect(status.blocked, isTrue);
    });
  });

  group('registrationHoldNotice — prazo de garantia da vaga', () {
    final now = DateTime(2026, 9, 1, 14, 13);

    test('inscrição sem prazo (antiga, do organizador ou em fila) não mostra nada', () {
      expect(
        registrationHoldNotice(
          holdExpiresAt: null,
          isPaid: false,
          hasLivePartnerInvite: false,
          now: now,
        ),
        isNull,
      );
    });

    test('com convite vivo o relógio some — quem manda ali é o convite', () {
      expect(
        registrationHoldNotice(
          holdExpiresAt: now.add(const Duration(hours: 48, minutes: 30)),
          isPaid: false,
          hasLivePartnerInvite: true,
          now: now,
        ),
        isNull,
      );
    });

    test('paga não tem prazo nenhum', () {
      expect(
        registrationHoldNotice(
          holdExpiresAt: now.add(const Duration(minutes: 20)),
          isPaid: true,
          hasLivePartnerInvite: false,
          now: now,
        ),
        isNull,
      );
    });

    test('elenco fechado sem pagar mostra hora de parede e o que falta', () {
      expect(
        registrationHoldNotice(
          holdExpiresAt: DateTime(2026, 9, 1, 14, 35),
          isPaid: false,
          hasLivePartnerInvite: false,
          now: now,
        ),
        'Vaga garantida até 14:35 · faltam 22 min',
      );
    });

    test('prazo em outro dia carrega a data, senão 14:35 seria hoje', () {
      expect(
        registrationHoldNotice(
          holdExpiresAt: DateTime(2026, 9, 2, 14, 35),
          isPaid: false,
          hasLivePartnerInvite: false,
          now: now,
        ),
        'Vaga garantida até 02/09 14:35 · falta 1 dia',
      );
    });

    test('menos de um minuto não vira "faltam 0 min"', () {
      expect(
        registrationHoldNotice(
          holdExpiresAt: now.add(const Duration(seconds: 30)),
          isPaid: false,
          hasLivePartnerInvite: false,
          now: now,
        ),
        'Vaga garantida até 14:13 · falta menos de 1 min',
      );
    });

    test('vencido avisa que a vaga cai, em vez de contagem negativa', () {
      expect(
        registrationHoldNotice(
          holdExpiresAt: now.subtract(const Duration(minutes: 1)),
          isPaid: false,
          hasLivePartnerInvite: false,
          now: now,
        ),
        'Prazo encerrado — sua vaga será liberada.',
      );
    });

    test('prazo de horas usa hora, não 90 minutos', () {
      expect(
        registrationHoldNotice(
          holdExpiresAt: now.add(const Duration(hours: 2)),
          isPaid: false,
          hasLivePartnerInvite: false,
          now: now,
        ),
        'Vaga garantida até 16:13 · faltam 2 horas',
      );
    });
  });
}
