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
    this.hasSentInvitePending = false,
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

  /// Passo pedido na rota (`?step=`). PREFERÊNCIA, nunca ordem.
  final RegistrationWizardStep? requestedStep;
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
  if (requested != null && requested.index <= natural.index) return requested;
  return natural;
}

RegistrationWizardStep _naturalStep(RegistrationStepInput input) {
  if (!input.categoryResolved) return RegistrationWizardStep.categoria;
  if (input.hasReceivedInvite) return RegistrationWizardStep.condicoes;
  if (!input.hasRegistration) {
    // Convite enviado e ainda sem resposta: a inscrição só nasce no aceite,
    // então o estado de ESPERA mora na tela do parceiro. Vem antes do
    // consentimento porque quem já convidou não pode ser mandado de volta ao
    // começo do fluxo só por não trazer `lgpd` na rota.
    if (input.hasSentInvitePending) return RegistrationWizardStep.parceiro;
    return input.lgpdAccepted
        ? RegistrationWizardStep.condicoes
        : RegistrationWizardStep.consentimento;
  }
  if (input.partnerPending) return RegistrationWizardStep.parceiro;
  if (input.uniformRequired && !input.uniformComplete) {
    return RegistrationWizardStep.uniforme;
  }
  if (!input.isPaid) return RegistrationWizardStep.pagamento;
  return RegistrationWizardStep.sucesso;
}

/// Nome do passo no query param `?step=`, e o caminho inverso.
///
/// `waiting` é aceito na leitura porque rotas antigas ainda o mandam (o app
/// instalado na loja continua gerando esses links por um tempo): ele significa
/// "esperando o parceiro", que no wizard é a tela do parceiro.
const _stepNames = <String, RegistrationWizardStep>{
  'categoria': RegistrationWizardStep.categoria,
  'consentimento': RegistrationWizardStep.consentimento,
  'condicoes': RegistrationWizardStep.condicoes,
  'partner': RegistrationWizardStep.parceiro,
  'parceiro': RegistrationWizardStep.parceiro,
  'waiting': RegistrationWizardStep.parceiro,
  'uniform': RegistrationWizardStep.uniforme,
  'uniforme': RegistrationWizardStep.uniforme,
  'payment': RegistrationWizardStep.pagamento,
  'pagamento': RegistrationWizardStep.pagamento,
};

RegistrationWizardStep? registrationStepFromParam(String? raw) {
  final value = raw?.trim().toLowerCase() ?? '';
  if (value.isEmpty) return null;
  return _stepNames[value];
}
