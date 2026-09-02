/** O porteiro do wizard de inscrição: dado o estado DERIVADO da inscrição, devolve em qual
 *  etapa o atleta deve estar.
 *
 *  Porte fiel de `registration_wizard_step.dart` (app Flutter). As duas superfícies têm de
 *  concordar sobre o passo — um atleta que abandona a inscrição no celular e volta pelo portal
 *  não pode cair num passo diferente. Mexeu aqui, mexa lá (e nos dois testes).
 *
 *  Puro de propósito — sem Angular, sem Firestore, sem signals. É onde a regra mora e o que os
 *  testes exercitam; a rota só obedece.
 *
 *  O passo NÃO é estado de sessão. Guardá-lo em memória foi exatamente o beco sem saída da
 *  vaga solo pendente: quem reservava sem parceiro entrava sem o id na rota, caía no passo de
 *  categoria e não achava mais o convite. */

/** Etapas na ORDEM do fluxo. A ordem é contrato: `resolveRegistrationStep` compara o índice
 *  para decidir se um passo pedido já está liberado. */
export const REGISTRATION_WIZARD_STEPS = [
  'categoria',
  'consentimento',
  'condicoes',
  'parceiro',
  // "Aguardando a dupla": o convite saiu e o parceiro ainda não respondeu. Mora ENTRE parceiro
  // e uniforme porque é o que vem depois de convidar e antes de configurar a inscrição — que
  // nem existe ainda, já que o backend só a cria no aceite.
  'aguardando',
  'uniforme',
  'pagamento',
  'sucesso',
] as const;

export type RegistrationWizardStep = (typeof REGISTRATION_WIZARD_STEPS)[number];

export function registrationStepIndex(step: RegistrationWizardStep): number {
  return REGISTRATION_WIZARD_STEPS.indexOf(step);
}

/** Entradas do porteiro, todas já resolvidas pela camada de dados. */
export interface RegistrationStepInput {
  /** A categoria da rota existe no torneio. */
  readonly categoryResolved: boolean;

  /** Existe convite de parceiro pendente PARA o atleta nesta categoria. */
  readonly hasReceivedInvite: boolean;

  /** O atleta JÁ convidou alguém nesta categoria e o convite segue pendente.
   *
   *  Convidar não cria inscrição — o backend só cria quando o convidado aceita. Sem este
   *  sinal, quem voltasse pela notificação ou pelo painel (sem `lgpd` na rota) cairia no
   *  consentimento e refaria o aceite e as condições com um convite já em voo.
   *
   *  O mesmo sinal separa os dois destinos da reserva solo: com convite em voo o destino é a
   *  espera, sem convite é a busca de parceiro. */
  readonly hasSentInvitePending: boolean;

  readonly hasRegistration: boolean;

  /** Aceite do termo já dado — pela inscrição existente ou pelo parâmetro que atravessa o
   *  fluxo antes de a inscrição existir. */
  readonly lgpdAccepted: boolean;

  readonly partnerPending: boolean;
  readonly uniformRequired: boolean;
  readonly uniformComplete: boolean;
  readonly isPaid: boolean;

  /** A folha de confirmação de nível (anti-sandbagging) ainda é devida neste esporte.
   *
   *  Ela mora na SAÍDA da tela 1, então quem começa uma inscrição sem passar por lá a
   *  perderia: as entradas que já trazem `categoria` iriam direto ao consentimento. */
  readonly levelConfirmationPending: boolean;

  /** Passo pedido na rota (`?step=`). PREFERÊNCIA, nunca ordem. */
  readonly requestedStep?: RegistrationWizardStep | null;

  /** O pedido veio de `?step=waiting`, que não é o mesmo que `partner`.
   *
   *  `waiting` significa "esperando o parceiro" e só vale enquanto a dupla não fechou.
   *  Obedecê-lo depois do aceite prenderia na tela de espera justamente quem acabou de fechar
   *  a dupla e só devia o pagamento — e `aguardando` (índice 4) vence qualquer passo natural
   *  posterior. */
  readonly requestedStepWaitingOnly: boolean;
}

/** Etapa em que o atleta deve estar.
 *
 *  A ordem das checagens é o contrato — ver a spec. O passo pedido na rota só é obedecido
 *  quando aponta para uma etapa **já liberada** (índice menor ou igual ao natural): assim
 *  "voltar para rever o uniforme" funciona e "pular direto para o pagamento" não. */
export function resolveRegistrationStep(input: RegistrationStepInput): RegistrationWizardStep {
  const natural = naturalStep(input);
  const requested = input.requestedStep ?? null;
  if (requested == null) return natural;

  // `waiting` caduca quando a dupla fecha. Ele aponta para `aguardando` (índice 4), que é
  // MENOR que todo passo natural depois da inscrição — então, sem esta saída, ele venceria
  // sempre e prenderia na tela de espera quem acabou de aceitar o convite e só devia pagar.
  if (input.requestedStepWaitingOnly && input.hasRegistration && !input.partnerPending) {
    return natural;
  }

  return registrationStepIndex(requested) <= registrationStepIndex(natural) ? requested : natural;
}

function naturalStep(input: RegistrationStepInput): RegistrationWizardStep {
  if (!input.categoryResolved) return 'categoria';
  // `&& !hasRegistration` é o qualificador da regra pré-existente do projeto
  // (`categoryStatusOf`/`registrationCardState`), perdido na tradução para o porteiro.
  // Receber convite COM inscrição já criada é um caso normal, não uma contradição: a CF
  // permite convidar quem tem reserva solo aberta (`partnerPending`), porque o plano dela é
  // ANEXAR o convidado à inscrição que já existe (modo "attach"). Sem o qualificador esse
  // atleta ficava preso em "condições" — sem pagar, sem recusar, com o relógio da vaga
  // correndo.
  if (input.hasReceivedInvite && !input.hasRegistration) return 'condicoes';
  if (!input.hasRegistration) {
    // Convite enviado e ainda sem resposta: a inscrição só nasce no aceite, então o estado de
    // ESPERA tem tela própria — mandar de volta à busca de parceiro reabria o campo de busca
    // para quem acabou de escolher alguém. Vem antes do consentimento porque quem já convidou
    // não pode ser mandado de volta ao começo do fluxo só por não trazer `lgpd` na rota.
    if (input.hasSentInvitePending) return 'aguardando';
    if (input.lgpdAccepted) return 'condicoes';
    // A folha de nível abre na SAÍDA da tela 1 — quem começa do zero tem de passar por lá
    // antes do consentimento, senão o gate anti-sandbagging some para quem entra por um card
    // de categoria.
    return input.levelConfirmationPending ? 'categoria' : 'consentimento';
  }
  if (input.partnerPending) {
    // Reserva solo: os dois caminhos convergem aqui, e o que os separa é ter ou não convite
    // em voo. Com convite enviado, a espera é a MESMA do convite "no vácuo". Sem convite, quem
    // reservou sozinho ainda PRECISA da busca: é lá que ele convida.
    return input.hasSentInvitePending ? 'aguardando' : 'parceiro';
  }
  if (input.uniformRequired && !input.uniformComplete) return 'uniforme';
  if (!input.isPaid) return 'pagamento';
  return 'sucesso';
}

/** Pedido de passo lido do `?step=`: a etapa e se ela CADUCA quando a dupla fecha (só
 *  `waiting`/`aguardando` caduca). */
export interface RegistrationStepRequest {
  readonly step: RegistrationWizardStep;
  readonly waitingOnly: boolean;
}

/** Nome do passo no query param `?step=`.
 *
 *  `waiting` é aceito na leitura porque rotas antigas ainda o mandam (o app instalado na loja
 *  continua gerando esses links por um tempo): ele significa "esperando o parceiro", que é
 *  exatamente a etapa `aguardando`.
 *
 *  Ele NÃO é sinônimo de `partner`: `partner` vale sempre que a etapa já estiver liberada,
 *  enquanto `waiting` caduca no momento em que a dupla fecha. */
const STEP_NAMES: Readonly<Record<string, RegistrationWizardStep>> = {
  categoria: 'categoria',
  consentimento: 'consentimento',
  consent: 'consentimento',
  condicoes: 'condicoes',
  terms: 'condicoes',
  partner: 'parceiro',
  parceiro: 'parceiro',
  waiting: 'aguardando',
  aguardando: 'aguardando',
  uniform: 'uniforme',
  uniforme: 'uniforme',
  payment: 'pagamento',
  pagamento: 'pagamento',
};

export function registrationStepFromParam(raw: string | null | undefined): RegistrationStepRequest | null {
  const value = (raw ?? '').trim().toLowerCase();
  if (value.length === 0) return null;
  const step = STEP_NAMES[value];
  if (step == null) return null;
  // A caducidade acompanha a ETAPA, não a grafia: `waiting` e `aguardando` pedem a mesma tela
  // de espera, e as duas têm de caducar quando a dupla fecha. Amarrar em `value === 'waiting'`
  // deixava a grafia nova passar batido pela regra.
  return { step, waitingOnly: step === 'aguardando' };
}

/** Segmento de rota de cada passo, sob `/torneios/:id/inscricao`.
 *
 *  `sucesso` não tem rota própria no portal: a inscrição pronta é a aba "minha inscrição" do
 *  torneio, que já existe e já mostra elenco, pagamento e compartilhamento. */
export const REGISTRATION_STEP_PATHS: Readonly<Record<Exclude<RegistrationWizardStep, 'sucesso'>, string>> = {
  categoria: 'categoria',
  consentimento: 'consentimento',
  condicoes: 'condicoes',
  parceiro: 'parceiro',
  aguardando: 'aguardando',
  uniforme: 'uniforme',
  pagamento: 'pagamento',
};
