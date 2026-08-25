/// Estado do pagamento DIRETO com o organizador
/// (`paymentMode == 'directWithOrganizer'`), do ponto de vista do atleta
/// logado.
///
/// Nesse modo não existe webhook: o dinheiro cai na conta do organizador, fora
/// do app, e o que o sistema registra é a DECLARAÇÃO de cada atleta ("já
/// paguei"). Por isso o fluxo tem dois momentos que a tela precisa distinguir
/// — a dupla declarou (vaga garantida) e o organizador conferiu o extrato
/// (pagamento confirmado de fato).
///
/// Módulo puro. Espelha `direct-payment-state.ts` do portal do atleta: mudou a
/// regra lá, muda aqui.
library;

enum DirectPaymentState {
  /// Ninguém declarou por mim ainda — é a tela do Pix com o botão de declarar.
  idle,

  /// Declarei minha parte; a inscrição fecha quando o parceiro declarar a dele.
  waitingPartner,

  /// A dupla fechou. A vaga vale, mas o organizador ainda não confirmou o
  /// recebimento.
  waitingOrganizer,

  /// O organizador confirmou (ou é inscrição direta anterior a este fluxo).
  confirmed,
}

DirectPaymentState resolveDirectPaymentState({
  required bool isPaid,
  required List<String> sharePaidUids,
  required String? myUid,
  required DateTime? declaredPaidAt,
  required bool paymentVerifiedByOrganizer,
}) {
  final uid = myUid?.trim() ?? '';
  final iDeclared = uid.isNotEmpty && sharePaidUids.contains(uid);

  if (isPaid) {
    // `declaredPaidAt` ausente = inscrição direta fechada ANTES deste fluxo
    // existir. Ela nunca entrou na fila de conferência do organizador (a
    // listagem dele usa a mesma âncora), então seria mentira dizer ao atleta
    // que alguém vai conferir.
    if (declaredPaidAt == null) return DirectPaymentState.confirmed;
    return paymentVerifiedByOrganizer
        ? DirectPaymentState.confirmed
        : DirectPaymentState.waitingOrganizer;
  }

  return iDeclared
      ? DirectPaymentState.waitingPartner
      : DirectPaymentState.idle;
}

/// Só em `idle` o atleta ainda tem o que fazer nesta tela — nos demais o Pix
/// sai do centro e vira consulta (o parceiro ainda pode pedir o código).
bool directPaymentAwaitsAction(DirectPaymentState state) =>
    state == DirectPaymentState.idle;
