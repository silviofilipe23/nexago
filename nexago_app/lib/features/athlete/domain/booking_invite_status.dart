/// Decide se um convite de reserva (`bookingInvites/{id}`) pode ser exibido
/// com o botão "Quero jogar!" ativo / aceito com sucesso, dado o estado atual
/// do convite E da reserva original.
///
/// Cobre dois casos que o convite sozinho não detecta:
/// - o convite já foi aceito por outra pessoa (evita que um segundo usuário
///   também consiga aceitar, já que o convite não é de uso único por design);
/// - a reserva original foi cancelada depois que o convite foi gerado (o
///   documento do convite guarda uma cópia dos dados no momento da criação e
///   não reflete cancelamentos posteriores).
///
/// Retorna `null` quando está tudo certo para seguir o fluxo normal, ou a
/// mensagem PT a mostrar ao usuário quando bloqueado.
String? resolveBookingInviteBlockedReason({
  required String inviteStatus,
  required bool inviteExpired,
  required bool bookingExists,
  String? bookingStatus,
}) {
  if (inviteExpired) return 'Este convite expirou.';
  if (inviteStatus == 'accepted') return 'Este convite já foi aceito.';
  if (inviteStatus != 'pending') return 'Este convite não está mais disponível.';
  if (!bookingExists ||
      bookingStatus == 'canceled' ||
      bookingStatus == 'cancelled') {
    return 'Esta reserva foi cancelada.';
  }
  return null;
}
