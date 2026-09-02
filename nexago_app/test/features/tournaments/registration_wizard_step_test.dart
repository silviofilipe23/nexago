// O porteiro do wizard de inscrição. A ORDEM das checagens é o contrato —
// ver docs/superpowers/specs/2026-09-01-app-registration-wizard-design.md.
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/registration_wizard_step.dart';

RegistrationStepInput input({
  bool categoryResolved = true,
  bool hasReceivedInvite = false,
  bool hasSentInvitePending = false,
  bool hasRegistration = false,
  bool lgpdAccepted = false,
  bool partnerPending = false,
  bool uniformRequired = false,
  bool uniformComplete = true,
  bool isPaid = false,
  bool levelConfirmationPending = false,
  RegistrationWizardStep? requestedStep,
  bool requestedStepWaitingOnly = false,
}) {
  return RegistrationStepInput(
    levelConfirmationPending: levelConfirmationPending,
    requestedStepWaitingOnly: requestedStepWaitingOnly,
    categoryResolved: categoryResolved,
    hasReceivedInvite: hasReceivedInvite,
    hasSentInvitePending: hasSentInvitePending,
    hasRegistration: hasRegistration,
    lgpdAccepted: lgpdAccepted,
    partnerPending: partnerPending,
    uniformRequired: uniformRequired,
    uniformComplete: uniformComplete,
    isPaid: isPaid,
    requestedStep: requestedStep,
  );
}

void main() {
  group('ordem das checagens', () {
    test('sem categoria resolvida abre a categoria', () {
      expect(
        resolveRegistrationStep(input(categoryResolved: false)),
        RegistrationWizardStep.categoria,
      );
    });

    test('categoria vence tudo: nem convite recebido passa na frente', () {
      expect(
        resolveRegistrationStep(
          input(categoryResolved: false, hasReceivedInvite: true),
        ),
        RegistrationWizardStep.categoria,
      );
    });

    test('convite recebido pendente abre as condições', () {
      expect(
        resolveRegistrationStep(input(hasReceivedInvite: true)),
        RegistrationWizardStep.condicoes,
      );
    });

    test(
      'convite recebido COM inscrição existente resolve para o passo '
      'pendente, não para as condições',
      () {
        // A CF permite convidar quem tem reserva solo aberta — o plano dela é
        // ANEXAR o convidado à inscrição que já existe. Sem o qualificador
        // `&& !hasRegistration` (que a regra pré-existente do projeto tem, em
        // `registrationCardState`) esse atleta ficava preso em "condições":
        // sem pagar, sem recusar, com o relógio da vaga correndo.
        expect(
          resolveRegistrationStep(
            input(
              hasReceivedInvite: true,
              hasRegistration: true,
              partnerPending: true,
            ),
          ),
          RegistrationWizardStep.parceiro,
        );
        // E, com a dupla já fechada, chega ao pagamento.
        expect(
          resolveRegistrationStep(
            input(hasReceivedInvite: true, hasRegistration: true),
          ),
          RegistrationWizardStep.pagamento,
        );
      },
    );

    test('sem inscrição e sem aceite abre o consentimento', () {
      expect(
        resolveRegistrationStep(input()),
        RegistrationWizardStep.consentimento,
      );
    });

    test('sem inscrição com aceite abre as condições', () {
      expect(
        resolveRegistrationStep(input(lgpdAccepted: true)),
        RegistrationWizardStep.condicoes,
      );
    });

    test('inscrição com parceiro pendente abre o parceiro', () {
      expect(
        resolveRegistrationStep(
          input(hasRegistration: true, partnerPending: true),
        ),
        RegistrationWizardStep.parceiro,
      );
    });

    test('uniforme exigido e incompleto abre o uniforme', () {
      expect(
        resolveRegistrationStep(
          input(
            hasRegistration: true,
            uniformRequired: true,
            uniformComplete: false,
          ),
        ),
        RegistrationWizardStep.uniforme,
      );
    });

    test('uniforme incompleto NÃO segura quem nem tem uniforme na categoria', () {
      expect(
        resolveRegistrationStep(
          input(hasRegistration: true, uniformComplete: false),
        ),
        RegistrationWizardStep.pagamento,
      );
    });

    test('tudo resolvido menos o pagamento abre o pagamento', () {
      expect(
        resolveRegistrationStep(input(hasRegistration: true)),
        RegistrationWizardStep.pagamento,
      );
    });

    test('pago e completo abre o sucesso', () {
      expect(
        resolveRegistrationStep(input(hasRegistration: true, isPaid: true)),
        RegistrationWizardStep.sucesso,
      );
    });

    test('parceiro pendente vence uniforme incompleto', () {
      // Estado real: atleta reservou vaga solo, escolheu o uniforme, mas parceiro
      // ainda não confirmou. Parceiro deve vencer (estar antes na ordem).
      expect(
        resolveRegistrationStep(
          input(
            hasRegistration: true,
            partnerPending: true,
            uniformRequired: true,
            uniformComplete: false,
          ),
        ),
        RegistrationWizardStep.parceiro,
      );
    });

    test('uniforme incompleto vence sucesso mesmo com pagamento resolvido', () {
      // Estado alcançável pela declaração de pagamento direto ("Já paguei"):
      // o atleta declara que já pagou (isPaid: true) mas o uniforme da categoria
      // ainda não foi preenchido. Uniforme é obrigatório e deve ser resolvido
      // antes do sucesso.
      expect(
        resolveRegistrationStep(
          input(
            hasRegistration: true,
            uniformRequired: true,
            uniformComplete: false,
            isPaid: true,
          ),
        ),
        RegistrationWizardStep.uniforme,
      );
    });
  });

  // Convidar alguém NÃO cria inscrição: o backend só cria quando o convidado
  // aceita. Existe portanto um estado real e comum — convite em voo, nenhuma
  // inscrição — em que o atleta voltando por push/Home não traz `lgpd` na
  // rota. Sem esta regra ele refaria consentimento e condições com o convite
  // já enviado; era o que a tela única resolvia consultando os enviados.
  group('convite ENVIADO pendente, sem inscrição ainda', () {
    test('abre a tela de espera, não a busca de parceiro', () {
      // Reabrir a busca logo depois de escolher alguém é o que a etapa
      // `aguardando` existe para evitar.
      final step = resolveRegistrationStep(input(hasSentInvitePending: true));

      expect(step, RegistrationWizardStep.aguardando);
      expect(step, isNot(RegistrationWizardStep.parceiro));
    });

    test('vence o consentimento quando não há aceite no parâmetro', () {
      // O caso do atleta que volta por notificação: sem `lgpd=1` na rota.
      final step = resolveRegistrationStep(
        input(hasSentInvitePending: true, lgpdAccepted: false),
      );

      expect(step, RegistrationWizardStep.aguardando);
      expect(step, isNot(RegistrationWizardStep.consentimento));
    });

    test('vence as condições quando o aceite veio no parâmetro', () {
      final step = resolveRegistrationStep(
        input(hasSentInvitePending: true, lgpdAccepted: true),
      );

      expect(step, RegistrationWizardStep.aguardando);
      expect(step, isNot(RegistrationWizardStep.condicoes));
    });

    test('categoria não resolvida ainda vence o convite enviado', () {
      final step = resolveRegistrationStep(
        input(categoryResolved: false, hasSentInvitePending: true),
      );

      expect(step, RegistrationWizardStep.categoria);
      expect(step, isNot(RegistrationWizardStep.aguardando));
    });

    test('convite RECEBIDO vence o enviado: responder vem antes de esperar', () {
      final step = resolveRegistrationStep(
        input(hasReceivedInvite: true, hasSentInvitePending: true),
      );

      expect(step, RegistrationWizardStep.condicoes);
      expect(step, isNot(RegistrationWizardStep.aguardando));
    });

    test('com inscrição já criada, o convite enviado não muda o passo', () {
      // O convite aceito virou inscrição; quem manda daqui em diante é ela.
      final step = resolveRegistrationStep(
        input(hasSentInvitePending: true, hasRegistration: true),
      );

      expect(step, RegistrationWizardStep.pagamento);
      expect(step, isNot(RegistrationWizardStep.aguardando));
    });

    test('step=payment pedido na rota NÃO fura o convite enviado', () {
      final step = resolveRegistrationStep(
        input(
          hasSentInvitePending: true,
          requestedStep: RegistrationWizardStep.pagamento,
        ),
      );

      expect(step, RegistrationWizardStep.aguardando);
      expect(step, isNot(RegistrationWizardStep.pagamento));
    });
  });

  // A ordem do enum é contrato: `resolveRegistrationStep` compara `index`
  // para decidir se um passo pedido já está liberado. `aguardando` entrou
  // ENTRE parceiro e uniforme, e é isso que faz `?step=uniform` continuar
  // valendo para quem já fechou a dupla e `?step=waiting` não furar o
  // pagamento.
  group('lugar de `aguardando` na ordem', () {
    test('fica entre parceiro e uniforme', () {
      expect(
        RegistrationWizardStep.aguardando.index,
        greaterThan(RegistrationWizardStep.parceiro.index),
      );
      expect(
        RegistrationWizardStep.aguardando.index,
        lessThan(RegistrationWizardStep.uniforme.index),
      );
    });

    test('a ordem completa do fluxo é a do enum', () {
      expect(RegistrationWizardStep.values, [
        RegistrationWizardStep.categoria,
        RegistrationWizardStep.consentimento,
        RegistrationWizardStep.condicoes,
        RegistrationWizardStep.parceiro,
        RegistrationWizardStep.aguardando,
        RegistrationWizardStep.uniforme,
        RegistrationWizardStep.pagamento,
        RegistrationWizardStep.sucesso,
      ]);
    });

    test('pedido de espera é obedecido quando é a etapa natural', () {
      expect(
        resolveRegistrationStep(
          input(
            hasSentInvitePending: true,
            requestedStep: RegistrationWizardStep.aguardando,
            requestedStepWaitingOnly: true,
          ),
        ),
        RegistrationWizardStep.aguardando,
      );
    });
  });

  group('o step pedido é preferência, nunca ordem', () {
    test('pedido de passo JÁ liberado é obedecido', () {
      // Inscrição só devendo pagamento; o atleta quer rever o uniforme.
      expect(
        resolveRegistrationStep(
          input(
            hasRegistration: true,
            uniformRequired: true,
            requestedStep: RegistrationWizardStep.uniforme,
          ),
        ),
        RegistrationWizardStep.uniforme,
      );
    });

    test('pedido de passo AINDA pendente é ignorado', () {
      // "Continuar inscrição" manda step=payment sempre; quem deve o parceiro
      // tem que cair no parceiro, não no pagamento.
      expect(
        resolveRegistrationStep(
          input(
            hasRegistration: true,
            partnerPending: true,
            requestedStep: RegistrationWizardStep.pagamento,
          ),
        ),
        RegistrationWizardStep.parceiro,
      );
    });

    test('solo que pagou o integral e espera parceiro cai no parceiro', () {
      expect(
        resolveRegistrationStep(
          input(
            hasRegistration: true,
            partnerPending: true,
            isPaid: true,
            requestedStep: RegistrationWizardStep.pagamento,
          ),
        ),
        RegistrationWizardStep.parceiro,
      );
    });

    test('pedido não fura o consentimento', () {
      expect(
        resolveRegistrationStep(
          input(requestedStep: RegistrationWizardStep.pagamento),
        ),
        RegistrationWizardStep.consentimento,
      );
    });
  });

  // `?step=waiting` significa "esperando o parceiro". Ele aponta para
  // `parceiro` (índice 3), MENOR que todo passo natural depois da inscrição —
  // então, tratado como um pedido comum, venceria sempre. Três entradas reais
  // mandam `waiting` COM inscrição já criada (o aceite do convite, o "convite
  // já aceito" e o card de convite enviado que diz "Pagar inscrição").
  group('`waiting` caduca quando a dupla fecha', () {
    test('com inscrição e dupla formada, waiting é ignorado', () {
      final step = resolveRegistrationStep(
        input(
          hasRegistration: true,
          partnerPending: false,
          requestedStep: RegistrationWizardStep.aguardando,
          requestedStepWaitingOnly: true,
        ),
      );

      expect(step, RegistrationWizardStep.pagamento);
      expect(step, isNot(RegistrationWizardStep.aguardando));
    });

    test('com inscrição, dupla formada e uniforme pendente, cai no uniforme', () {
      final step = resolveRegistrationStep(
        input(
          hasRegistration: true,
          uniformRequired: true,
          uniformComplete: false,
          requestedStep: RegistrationWizardStep.aguardando,
          requestedStepWaitingOnly: true,
        ),
      );

      expect(step, RegistrationWizardStep.uniforme);
      expect(step, isNot(RegistrationWizardStep.aguardando));
    });

    test(
      'com inscrição e parceiro ainda pendente, cai no parceiro — a espera '
      'pedida não pula o passo que falta',
      () {
        // Reserva solo em aberto: o passo natural é o do parceiro (índice 3),
        // ANTES de `aguardando` (4). Um pedido posterior nunca fura o passo
        // pendente, então a tela de espera não rouba a vez da tela onde o
        // atleta ainda pode convidar alguém ou garantir a vaga.
        final step = resolveRegistrationStep(
          input(
            hasRegistration: true,
            partnerPending: true,
            requestedStep: RegistrationWizardStep.aguardando,
            requestedStepWaitingOnly: true,
          ),
        );

        expect(step, RegistrationWizardStep.parceiro);
        expect(step, isNot(RegistrationWizardStep.aguardando));
      },
    );

    test('sem inscrição nenhuma, waiting vale', () {
      expect(
        resolveRegistrationStep(
          input(
            hasSentInvitePending: true,
            requestedStep: RegistrationWizardStep.aguardando,
            requestedStepWaitingOnly: true,
          ),
        ),
        RegistrationWizardStep.aguardando,
      );
    });

    test('`partner` (elenco) NÃO caduca: segue obedecido com dupla formada', () {
      // `tournamentRegistrationRosterParams` manda `step=partner` para abrir o
      // elenco de uma equipe trio+ que já tem inscrição.
      expect(
        resolveRegistrationStep(
          input(
            hasRegistration: true,
            partnerPending: false,
            requestedStep: RegistrationWizardStep.parceiro,
          ),
        ),
        RegistrationWizardStep.parceiro,
      );
    });
  });

  group('folha de confirmação de nível', () {
    test('devida, quem começa do zero passa pela tela 1 em vez do consentimento', () {
      final step = resolveRegistrationStep(input(levelConfirmationPending: true));

      expect(step, RegistrationWizardStep.categoria);
      expect(step, isNot(RegistrationWizardStep.consentimento));
    });

    test('não devida, segue direto para o consentimento', () {
      expect(
        resolveRegistrationStep(input(levelConfirmationPending: false)),
        RegistrationWizardStep.consentimento,
      );
    });

    test('não segura quem já tem inscrição', () {
      final step = resolveRegistrationStep(
        input(hasRegistration: true, levelConfirmationPending: true),
      );

      expect(step, RegistrationWizardStep.pagamento);
      expect(step, isNot(RegistrationWizardStep.categoria));
    });

    test('não segura quem já aceitou o termo no parâmetro', () {
      // Veio da tela de consentimento, que só é alcançável pela tela 1 — a
      // folha já rodou lá.
      final step = resolveRegistrationStep(
        input(lgpdAccepted: true, levelConfirmationPending: true),
      );

      expect(step, RegistrationWizardStep.condicoes);
      expect(step, isNot(RegistrationWizardStep.categoria));
    });

    test('não segura quem responde a um convite recebido', () {
      final step = resolveRegistrationStep(
        input(hasReceivedInvite: true, levelConfirmationPending: true),
      );

      expect(step, RegistrationWizardStep.condicoes);
      expect(step, isNot(RegistrationWizardStep.categoria));
    });

    test('pedido de pagamento não fura a tela 1', () {
      final step = resolveRegistrationStep(
        input(
          levelConfirmationPending: true,
          requestedStep: RegistrationWizardStep.pagamento,
        ),
      );

      expect(step, RegistrationWizardStep.categoria);
      expect(step, isNot(RegistrationWizardStep.pagamento));
    });
  });

  group('registrationStepFromParam', () {
    test('`waiting` vira a tela de ESPERA E marca que caduca', () {
      // O nome do parâmetro sempre quis dizer "esperando o parceiro";
      // apontá-lo para a busca de parceiro era só a falta da tela.
      final request = registrationStepFromParam('waiting');

      expect(request?.step, RegistrationWizardStep.aguardando);
      expect(request?.step, isNot(RegistrationWizardStep.parceiro));
      expect(request?.waitingOnly, isTrue);
    });

    test('`aguardando` é a mesma etapa e caduca igual', () {
      // A caducidade acompanha a ETAPA, não a grafia: a escrita nova não pode
      // escapar da regra que impede a espera de furar o pagamento.
      final request = registrationStepFromParam('aguardando');

      expect(request?.step, RegistrationWizardStep.aguardando);
      expect(request?.waitingOnly, isTrue);
    });

    test('`partner` vira parceiro SEM caducar', () {
      final request = registrationStepFromParam('partner');

      expect(request?.step, RegistrationWizardStep.parceiro);
      expect(request?.waitingOnly, isFalse);
    });

    test('`payment` vira pagamento sem caducar', () {
      final request = registrationStepFromParam('payment');

      expect(request?.step, RegistrationWizardStep.pagamento);
      expect(request?.waitingOnly, isFalse);
    });

    test('vazio e desconhecido não viram pedido nenhum', () {
      expect(registrationStepFromParam(null), isNull);
      expect(registrationStepFromParam('  '), isNull);
      expect(registrationStepFromParam('sucesso'), isNull);
    });
  });
}
