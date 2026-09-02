import {
  REGISTRATION_WIZARD_STEPS,
  registrationStepFromParam,
  resolveRegistrationStep,
  type RegistrationStepInput,
  type RegistrationWizardStep,
} from './registration-wizard-step';

/** Espelho de `registration_wizard_step_test.dart` (app). O porteiro é o único ponto em que as
 *  duas superfícies TÊM de concordar: um atleta que começa a inscrição no celular e volta pelo
 *  portal não pode cair num passo diferente. Divergiu aqui, divergiu o produto. */
function input(overrides: Partial<RegistrationStepInput> = {}): RegistrationStepInput {
  return {
    categoryResolved: true,
    hasReceivedInvite: false,
    hasSentInvitePending: false,
    hasRegistration: false,
    lgpdAccepted: false,
    partnerPending: false,
    uniformRequired: false,
    uniformComplete: true,
    isPaid: false,
    levelConfirmationPending: false,
    requestedStep: null,
    requestedStepWaitingOnly: false,
    ...overrides,
  };
}

describe('resolveRegistrationStep — ordem das checagens', () => {
  it('sem categoria resolvida abre a categoria', () => {
    expect(resolveRegistrationStep(input({ categoryResolved: false }))).toBe('categoria');
  });

  it('categoria vence tudo: nem convite recebido passa na frente', () => {
    expect(resolveRegistrationStep(input({ categoryResolved: false, hasReceivedInvite: true }))).toBe('categoria');
  });

  it('convite recebido pendente abre as condições', () => {
    expect(resolveRegistrationStep(input({ hasReceivedInvite: true }))).toBe('condicoes');
  });

  // Sem o qualificador `&& !hasRegistration`, quem tem reserva solo aberta e recebe convite
  // fica preso em "condições" — sem pagar e sem recusar, com o relógio da vaga correndo.
  it('convite recebido COM inscrição já criada não prende nas condições', () => {
    expect(
      resolveRegistrationStep(input({ hasReceivedInvite: true, hasRegistration: true, partnerPending: true })),
    ).toBe('parceiro');
  });

  it('sem inscrição e sem aceite abre o consentimento', () => {
    expect(resolveRegistrationStep(input())).toBe('consentimento');
  });

  it('sem inscrição com aceite abre as condições', () => {
    expect(resolveRegistrationStep(input({ lgpdAccepted: true }))).toBe('condicoes');
  });

  it('inscrição com parceiro pendente e SEM convite abre o parceiro', () => {
    expect(resolveRegistrationStep(input({ hasRegistration: true, partnerPending: true }))).toBe('parceiro');
  });

  it('uniforme exigido e incompleto abre o uniforme', () => {
    expect(
      resolveRegistrationStep(input({ hasRegistration: true, uniformRequired: true, uniformComplete: false })),
    ).toBe('uniforme');
  });

  it('uniforme incompleto NÃO segura quem nem tem uniforme na categoria', () => {
    expect(
      resolveRegistrationStep(input({ hasRegistration: true, uniformRequired: false, uniformComplete: false })),
    ).toBe('pagamento');
  });

  it('tudo resolvido menos o pagamento abre o pagamento', () => {
    expect(resolveRegistrationStep(input({ hasRegistration: true }))).toBe('pagamento');
  });

  it('pago e completo abre o sucesso', () => {
    expect(resolveRegistrationStep(input({ hasRegistration: true, isPaid: true }))).toBe('sucesso');
  });

  it('parceiro pendente vence uniforme incompleto', () => {
    expect(
      resolveRegistrationStep(
        input({ hasRegistration: true, partnerPending: true, uniformRequired: true, uniformComplete: false }),
      ),
    ).toBe('parceiro');
  });

  it('uniforme incompleto vence sucesso mesmo com pagamento resolvido', () => {
    expect(
      resolveRegistrationStep(
        input({ hasRegistration: true, isPaid: true, uniformRequired: true, uniformComplete: false }),
      ),
    ).toBe('uniforme');
  });
});

describe('resolveRegistrationStep — convite ENVIADO pendente, sem inscrição ainda', () => {
  it('abre a tela de espera, não a busca de parceiro', () => {
    expect(resolveRegistrationStep(input({ hasSentInvitePending: true }))).toBe('aguardando');
  });

  // Quem já convidou e volta pela notificação não traz `lgpd` na rota; checar o consentimento
  // primeiro o faria refazer o começo do fluxo com um convite em voo.
  it('vence o consentimento quando não há aceite no parâmetro', () => {
    expect(resolveRegistrationStep(input({ hasSentInvitePending: true, lgpdAccepted: false }))).toBe('aguardando');
  });

  it('vence as condições quando o aceite veio no parâmetro', () => {
    expect(resolveRegistrationStep(input({ hasSentInvitePending: true, lgpdAccepted: true }))).toBe('aguardando');
  });

  it('categoria não resolvida ainda vence o convite enviado', () => {
    expect(resolveRegistrationStep(input({ hasSentInvitePending: true, categoryResolved: false }))).toBe('categoria');
  });

  it('convite RECEBIDO vence o enviado: responder vem antes de esperar', () => {
    expect(resolveRegistrationStep(input({ hasSentInvitePending: true, hasReceivedInvite: true }))).toBe('condicoes');
  });

  it('com inscrição já criada e dupla fechada, o convite enviado não muda o passo', () => {
    expect(resolveRegistrationStep(input({ hasSentInvitePending: true, hasRegistration: true }))).toBe('pagamento');
  });

  it('step=pagamento pedido na rota NÃO fura o convite enviado', () => {
    expect(
      resolveRegistrationStep(input({ hasSentInvitePending: true, requestedStep: 'pagamento' })),
    ).toBe('aguardando');
  });
});

describe('resolveRegistrationStep — reserva solo: o convite em voo decide o destino', () => {
  it('com convite enviado, a reserva solo vai para a espera', () => {
    expect(
      resolveRegistrationStep(input({ hasRegistration: true, partnerPending: true, hasSentInvitePending: true })),
    ).toBe('aguardando');
  });

  it('sem convite enviado, a reserva solo continua na busca', () => {
    expect(
      resolveRegistrationStep(input({ hasRegistration: true, partnerPending: true, hasSentInvitePending: false })),
    ).toBe('parceiro');
  });

  it('a espera não sequestra quem já fechou a dupla', () => {
    expect(
      resolveRegistrationStep(input({ hasRegistration: true, partnerPending: false, hasSentInvitePending: true })),
    ).toBe('pagamento');
  });

  it('uniforme pendente ainda perde para a espera', () => {
    expect(
      resolveRegistrationStep(
        input({
          hasRegistration: true,
          partnerPending: true,
          hasSentInvitePending: true,
          uniformRequired: true,
          uniformComplete: false,
        }),
      ),
    ).toBe('aguardando');
  });
});

describe('ordem do fluxo', () => {
  // A ordem é CONTRATO: `resolveRegistrationStep` compara índices para decidir se um passo
  // pedido já está liberado. Mexer nela muda o comportamento de toda rota com `?step=`.
  it('`aguardando` fica entre parceiro e uniforme', () => {
    expect(REGISTRATION_WIZARD_STEPS).toEqual([
      'categoria',
      'consentimento',
      'condicoes',
      'parceiro',
      'aguardando',
      'uniforme',
      'pagamento',
      'sucesso',
    ] as unknown as readonly RegistrationWizardStep[]);
  });
});

describe('o step pedido é preferência, nunca ordem', () => {
  it('pedido de passo JÁ liberado é obedecido', () => {
    expect(
      resolveRegistrationStep(
        input({ hasRegistration: true, uniformRequired: true, uniformComplete: true, requestedStep: 'uniforme' }),
      ),
    ).toBe('uniforme');
  });

  it('pedido de passo AINDA pendente é ignorado', () => {
    expect(
      resolveRegistrationStep(input({ hasRegistration: true, partnerPending: true, requestedStep: 'pagamento' })),
    ).toBe('parceiro');
  });

  it('solo que pagou o integral e espera parceiro cai no parceiro, não no pagamento', () => {
    expect(
      resolveRegistrationStep(
        input({ hasRegistration: true, partnerPending: true, isPaid: true, requestedStep: 'pagamento' }),
      ),
    ).toBe('parceiro');
  });

  it('pedido não fura o consentimento', () => {
    expect(resolveRegistrationStep(input({ requestedStep: 'pagamento' }))).toBe('consentimento');
  });
});

describe('`waiting` caduca quando a dupla fecha', () => {
  // `aguardando` é o índice 4, MENOR que uniforme (5) e pagamento (6): sem a caducidade ele
  // venceria sempre, prendendo na espera justamente quem acabou de fechar a dupla.
  it('com inscrição e dupla formada, waiting é ignorado', () => {
    expect(
      resolveRegistrationStep(
        input({ hasRegistration: true, partnerPending: false, requestedStep: 'aguardando', requestedStepWaitingOnly: true }),
      ),
    ).toBe('pagamento');
  });

  it('com inscrição, dupla formada e uniforme pendente, cai no uniforme', () => {
    expect(
      resolveRegistrationStep(
        input({
          hasRegistration: true,
          partnerPending: false,
          uniformRequired: true,
          uniformComplete: false,
          requestedStep: 'aguardando',
          requestedStepWaitingOnly: true,
        }),
      ),
    ).toBe('uniforme');
  });

  it('reserva solo COM convite: a espera pedida coincide com a natural', () => {
    expect(
      resolveRegistrationStep(
        input({
          hasRegistration: true,
          partnerPending: true,
          hasSentInvitePending: true,
          requestedStep: 'aguardando',
          requestedStepWaitingOnly: true,
        }),
      ),
    ).toBe('aguardando');
  });

  it('sem inscrição nenhuma, waiting vale', () => {
    expect(
      resolveRegistrationStep(
        input({ hasSentInvitePending: true, requestedStep: 'aguardando', requestedStepWaitingOnly: true }),
      ),
    ).toBe('aguardando');
  });

  it('`parceiro` NÃO caduca: segue obedecido com dupla formada', () => {
    expect(
      resolveRegistrationStep(
        input({ hasRegistration: true, partnerPending: false, requestedStep: 'parceiro', requestedStepWaitingOnly: false }),
      ),
    ).toBe('parceiro');
  });
});

describe('folha de confirmação de nível', () => {
  it('devida, quem começa do zero passa pela tela 1 em vez do consentimento', () => {
    expect(resolveRegistrationStep(input({ levelConfirmationPending: true }))).toBe('categoria');
  });

  it('não devida, segue direto para o consentimento', () => {
    expect(resolveRegistrationStep(input({ levelConfirmationPending: false }))).toBe('consentimento');
  });

  it('não segura quem já tem inscrição', () => {
    expect(resolveRegistrationStep(input({ levelConfirmationPending: true, hasRegistration: true }))).toBe('pagamento');
  });

  it('não segura quem já aceitou o termo no parâmetro', () => {
    expect(resolveRegistrationStep(input({ levelConfirmationPending: true, lgpdAccepted: true }))).toBe('condicoes');
  });

  it('não segura quem responde a um convite recebido', () => {
    expect(resolveRegistrationStep(input({ levelConfirmationPending: true, hasReceivedInvite: true }))).toBe('condicoes');
  });

  it('pedido de pagamento não fura a tela 1', () => {
    expect(
      resolveRegistrationStep(input({ levelConfirmationPending: true, requestedStep: 'pagamento' })),
    ).toBe('categoria');
  });
});

describe('registrationStepFromParam', () => {
  it('`waiting` vira a tela de ESPERA E marca que caduca', () => {
    expect(registrationStepFromParam('waiting')).toEqual({ step: 'aguardando', waitingOnly: true });
  });

  // A caducidade acompanha a ETAPA, não a grafia — amarrá-la em `value === 'waiting'` deixava
  // a grafia nova passar batido pela regra.
  it('`aguardando` é a mesma etapa e caduca igual', () => {
    expect(registrationStepFromParam('aguardando')).toEqual({ step: 'aguardando', waitingOnly: true });
  });

  it('`partner` vira parceiro SEM caducar', () => {
    expect(registrationStepFromParam('partner')).toEqual({ step: 'parceiro', waitingOnly: false });
  });

  it('`payment` vira pagamento sem caducar', () => {
    expect(registrationStepFromParam('payment')).toEqual({ step: 'pagamento', waitingOnly: false });
  });

  it('aceita maiúsculas e espaços das rotas antigas', () => {
    expect(registrationStepFromParam('  UNIFORM ')).toEqual({ step: 'uniforme', waitingOnly: false });
  });

  it('vazio e desconhecido não viram pedido nenhum', () => {
    expect(registrationStepFromParam('')).toBeNull();
    expect(registrationStepFromParam(null)).toBeNull();
    expect(registrationStepFromParam('sucesso')).toBeNull();
    expect(registrationStepFromParam('qualquer-coisa')).toBeNull();
  });
});
