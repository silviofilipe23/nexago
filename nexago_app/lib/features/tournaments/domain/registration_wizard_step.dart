/// O porteiro do wizard de inscrição: dado o estado DERIVADO da inscrição,
/// devolve em qual etapa o atleta deve estar.
///
/// Puro de propósito — sem Flutter, sem Firestore, sem providers. É onde a
/// regra mora e o que os testes exercitam; a rota só obedece.
///
/// O passo NÃO é estado de sessão. Guardá-lo em `setState` foi exatamente o
/// beco sem saída da vaga solo pendente: quem reservava sem parceiro entrava
/// sem o id na rota, caía no passo de categoria e não achava mais o convite.
library;

/// Etapas na ORDEM do fluxo. A ordem do enum é contrato: `resolveRegistrationStep`
/// compara `index` para decidir se um passo pedido já está liberado.
enum RegistrationWizardStep {
  categoria,
  consentimento,
  condicoes,
  parceiro,
  // "Aguardando a dupla": o convite saiu e o parceiro ainda não respondeu.
  // Mora ENTRE parceiro e uniforme porque é o que vem depois de convidar e
  // antes de configurar a inscrição — que nem existe ainda, já que o backend
  // só a cria no aceite. Inserir no meio desloca os índices de `uniforme`,
  // `pagamento` e `sucesso`; é esperado, eles são relativos.
  aguardando,
  uniforme,
  pagamento,
  sucesso,
}

/// Entradas do porteiro, todas já resolvidas pela camada de dados.
class RegistrationStepInput {
  const RegistrationStepInput({
    required this.categoryResolved,
    required this.hasReceivedInvite,
    required this.hasRegistration,
    required this.lgpdAccepted,
    required this.partnerPending,
    required this.uniformRequired,
    required this.uniformComplete,
    required this.isPaid,
    // Os três abaixo MUDAM a decisão e não têm default: um call site que os
    // esquecesse em silêncio escolheria o passo errado sem o compilador
    // reclamar — e foi exatamente por um deles (`hasSentInvitePending`) que o
    // aceite LGPD se perdia no caminho de volta.
    required this.hasSentInvitePending,
    required this.levelConfirmationPending,
    required this.requestedStepWaitingOnly,
    this.requestedStep,
  });

  /// A categoria da rota existe no torneio.
  final bool categoryResolved;

  /// Existe convite de parceiro pendente PARA o atleta nesta categoria.
  final bool hasReceivedInvite;

  /// O atleta JÁ convidou alguém nesta categoria e o convite segue pendente.
  ///
  /// Convidar não cria inscrição — o backend só cria quando o convidado
  /// aceita. Sem este sinal, o atleta que voltasse por push ou pela Home
  /// (sem `lgpd` na rota) cairia no consentimento e refaria o aceite e as
  /// condições com um convite já em voo.
  final bool hasSentInvitePending;

  final bool hasRegistration;

  /// Aceite do termo já dado — pela inscrição existente ou pelo parâmetro que
  /// atravessa o fluxo antes de a inscrição existir.
  final bool lgpdAccepted;

  final bool partnerPending;
  final bool uniformRequired;
  final bool uniformComplete;
  final bool isPaid;

  /// A folha de confirmação de nível (anti-sandbagging) ainda é devida neste
  /// esporte — o atleta ainda não confirmou que cabe na categoria.
  ///
  /// Ela mora na SAÍDA da tela 1, então quem começa uma inscrição sem passar
  /// por lá a perderia: as entradas que já trazem `categoryId` (cards de
  /// categoria, torneio de categoria única) iriam direto ao consentimento.
  final bool levelConfirmationPending;

  /// Passo pedido na rota (`?step=`). PREFERÊNCIA, nunca ordem.
  final RegistrationWizardStep? requestedStep;

  /// O pedido veio de `?step=waiting`, que não é o mesmo que `partner`.
  ///
  /// `waiting` significa "esperando o parceiro" e só vale enquanto a dupla
  /// não fechou. Obedecê-lo depois do aceite prenderia na tela de espera
  /// justamente quem acabou de fechar a dupla e só devia o pagamento — e
  /// `aguardando` (índice 4) vence qualquer passo natural posterior.
  final bool requestedStepWaitingOnly;
}

/// Etapa em que o atleta deve estar.
///
/// A ordem das checagens é o contrato — ver a spec. O passo pedido na rota só
/// é obedecido quando aponta para uma etapa **já liberada** (índice menor ou
/// igual ao natural): assim "voltar para rever o uniforme" funciona e "pular
/// direto para o pagamento" não.
RegistrationWizardStep resolveRegistrationStep(RegistrationStepInput input) {
  final natural = _naturalStep(input);
  final requested = input.requestedStep;
  if (requested == null) return natural;

  // `waiting` caduca quando a dupla fecha. Ele aponta para `aguardando`
  // (índice 4), que é MENOR que todo passo natural depois da inscrição —
  // então, sem esta saída, ele venceria sempre e prenderia na tela de espera
  // quem acabou de aceitar o convite e só devia o pagamento.
  if (input.requestedStepWaitingOnly &&
      input.hasRegistration &&
      !input.partnerPending) {
    return natural;
  }

  if (requested.index <= natural.index) return requested;
  return natural;
}

RegistrationWizardStep _naturalStep(RegistrationStepInput input) {
  if (!input.categoryResolved) return RegistrationWizardStep.categoria;
  // `&& !hasRegistration` é o qualificador da regra pré-existente do projeto
  // (`registrationCardState`, `registration_shell_logic.dart`), perdido na
  // tradução para o porteiro. Receber convite COM inscrição já criada é um
  // caso normal, não uma contradição: a CF permite convidar quem tem reserva
  // solo aberta (`partnerPending`), porque o plano dela é ANEXAR o convidado
  // à inscrição que já existe (`tournament-partner-invite.ts`, modo "attach").
  // Sem o qualificador esse atleta ficava preso em "condições" — sem pagar,
  // sem recusar, com o relógio da vaga correndo.
  if (input.hasReceivedInvite && !input.hasRegistration) {
    return RegistrationWizardStep.condicoes;
  }
  if (!input.hasRegistration) {
    // Convite enviado e ainda sem resposta: a inscrição só nasce no aceite,
    // então o estado de ESPERA tem tela própria — mandar de volta à busca de
    // parceiro reabria o campo de busca para quem acabou de escolher alguém.
    // Vem antes do consentimento porque quem já convidou não pode ser mandado
    // de volta ao começo do fluxo só por não trazer `lgpd` na rota.
    if (input.hasSentInvitePending) return RegistrationWizardStep.aguardando;
    if (input.lgpdAccepted) return RegistrationWizardStep.condicoes;
    // A folha de nível abre na SAÍDA da tela 1 — quem começa do zero tem de
    // passar por lá antes do consentimento, senão o gate anti-sandbagging
    // some para quem entra por um card de categoria.
    return input.levelConfirmationPending
        ? RegistrationWizardStep.categoria
        : RegistrationWizardStep.consentimento;
  }
  if (input.partnerPending) return RegistrationWizardStep.parceiro;
  if (input.uniformRequired && !input.uniformComplete) {
    return RegistrationWizardStep.uniforme;
  }
  if (!input.isPaid) return RegistrationWizardStep.pagamento;
  return RegistrationWizardStep.sucesso;
}

/// Pedido de passo lido do `?step=`: a etapa e se ela CADUCA quando a dupla
/// fecha (só `waiting` caduca).
typedef RegistrationStepRequest = ({
  RegistrationWizardStep step,
  bool waitingOnly,
});

/// Nome do passo no query param `?step=`, e o caminho inverso.
///
/// `waiting` é aceito na leitura porque rotas antigas ainda o mandam (o app
/// instalado na loja continua gerando esses links por um tempo): ele significa
/// "esperando o parceiro", que é exatamente a etapa `aguardando` — o nome do
/// parâmetro sempre quis dizer isso, e apontá-lo para a busca de parceiro era
/// só a falta da tela.
///
/// Ele NÃO é sinônimo de `partner`: `partner` (o elenco, de
/// `tournamentRegistrationRosterParams`) vale sempre que a etapa já estiver
/// liberada, enquanto `waiting` caduca no momento em que a dupla fecha.
const _stepNames = <String, RegistrationWizardStep>{
  'categoria': RegistrationWizardStep.categoria,
  'consentimento': RegistrationWizardStep.consentimento,
  'condicoes': RegistrationWizardStep.condicoes,
  'partner': RegistrationWizardStep.parceiro,
  'parceiro': RegistrationWizardStep.parceiro,
  'waiting': RegistrationWizardStep.aguardando,
  'aguardando': RegistrationWizardStep.aguardando,
  'uniform': RegistrationWizardStep.uniforme,
  'uniforme': RegistrationWizardStep.uniforme,
  'payment': RegistrationWizardStep.pagamento,
  'pagamento': RegistrationWizardStep.pagamento,
};

RegistrationStepRequest? registrationStepFromParam(String? raw) {
  final value = raw?.trim().toLowerCase() ?? '';
  if (value.isEmpty) return null;
  final step = _stepNames[value];
  if (step == null) return null;
  // A caducidade acompanha a ETAPA, não a grafia: `waiting` e `aguardando`
  // pedem a mesma tela de espera, e as duas têm de caducar quando a dupla
  // fecha. Amarrar em `value == 'waiting'` deixava a grafia nova passar
  // batido pela regra.
  return (
    step: step,
    waitingOnly: step == RegistrationWizardStep.aguardando,
  );
}
