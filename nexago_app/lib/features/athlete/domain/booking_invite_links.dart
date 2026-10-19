import '../../../core/links/nexago_links.dart';

/// Link público do convite para jogar: `/convite/:inviteId` no portal do
/// atleta. O Android abre o app (App Link desde o 1.0.1); o iOS passa a abrir
/// com o `/convite/*` no `apple-app-site-association`.
String bookingInviteUrl(String inviteId) =>
    '$kAthletePortalBaseUrl/convite/${Uri.encodeComponent(inviteId)}';

const _weekdays = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

/// "sábado, 24/10 às 19:00" (horário de parede da reserva).
String bookingInviteWhenLabel(DateTime startAt) {
  final weekday = _weekdays[startAt.weekday - 1];
  String two(int v) => v.toString().padLeft(2, '0');
  return '$weekday, ${two(startAt.day)}/${two(startAt.month)} '
      'às ${two(startAt.hour)}:${two(startAt.minute)}';
}

/// Texto do link compartilhado (WhatsApp etc.). A hashtag da campanha entra no
/// funil `nexaShareText`, não aqui.
String bookingInviteShareMessage({
  required String arenaName,
  required DateTime startAt,
  required String inviteId,
  int openSlots = 0,
}) {
  final arena = arenaName.trim().isEmpty ? 'na arena' : 'na ${arenaName.trim()}';
  final slots = switch (openSlots) {
    <= 0 => '',
    1 => ' Falta 1 pra fechar o jogo.',
    _ => ' Faltam $openSlots pra fechar o jogo.',
  };
  return 'Bora jogar? Tenho quadra $arena, ${bookingInviteWhenLabel(startAt)}.'
      '$slots Confirma sua vaga pelo nexaGO: ${bookingInviteUrl(inviteId)}';
}
