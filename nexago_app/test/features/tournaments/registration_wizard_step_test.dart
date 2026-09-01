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
  RegistrationWizardStep? requestedStep,
}) {
  return RegistrationStepInput(
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
    test('abre o parceiro, onde mora a espera', () {
      expect(
        resolveRegistrationStep(input(hasSentInvitePending: true)),
        RegistrationWizardStep.parceiro,
      );
    });

    test('vence o consentimento quando não há aceite no parâmetro', () {
      // O caso do atleta que volta por notificação: sem `lgpd=1` na rota.
      final step = resolveRegistrationStep(
        input(hasSentInvitePending: true, lgpdAccepted: false),
      );

      expect(step, RegistrationWizardStep.parceiro);
      expect(step, isNot(RegistrationWizardStep.consentimento));
    });

    test('vence as condições quando o aceite veio no parâmetro', () {
      final step = resolveRegistrationStep(
        input(hasSentInvitePending: true, lgpdAccepted: true),
      );

      expect(step, RegistrationWizardStep.parceiro);
      expect(step, isNot(RegistrationWizardStep.condicoes));
    });

    test('categoria não resolvida ainda vence o convite enviado', () {
      final step = resolveRegistrationStep(
        input(categoryResolved: false, hasSentInvitePending: true),
      );

      expect(step, RegistrationWizardStep.categoria);
      expect(step, isNot(RegistrationWizardStep.parceiro));
    });

    test('convite RECEBIDO vence o enviado: responder vem antes de esperar', () {
      final step = resolveRegistrationStep(
        input(hasReceivedInvite: true, hasSentInvitePending: true),
      );

      expect(step, RegistrationWizardStep.condicoes);
      expect(step, isNot(RegistrationWizardStep.parceiro));
    });

    test('com inscrição já criada, o convite enviado não muda o passo', () {
      // O convite aceito virou inscrição; quem manda daqui em diante é ela.
      final step = resolveRegistrationStep(
        input(hasSentInvitePending: true, hasRegistration: true),
      );

      expect(step, RegistrationWizardStep.pagamento);
      expect(step, isNot(RegistrationWizardStep.parceiro));
    });

    test('step=payment pedido na rota NÃO fura o convite enviado', () {
      final step = resolveRegistrationStep(
        input(
          hasSentInvitePending: true,
          requestedStep: RegistrationWizardStep.pagamento,
        ),
      );

      expect(step, RegistrationWizardStep.parceiro);
      expect(step, isNot(RegistrationWizardStep.pagamento));
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
}
