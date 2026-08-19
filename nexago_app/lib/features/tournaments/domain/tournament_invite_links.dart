import 'package:nexago_app/core/links/nexago_links.dart';

/// Links e textos compartilháveis de convite de dupla/equipe.
///
/// Módulo puro (sem Flutter, sem Firestore). Espelha
/// `shared/partner-invite/partner-invite.ts` do portal do atleta — as duas
/// superfícies mandam a mesma mensagem.
///
/// O host é o do portal do atleta porque é o único que resolve e serve os
/// arquivos de associação de Universal/App Link: quem tem o app cai no app
/// (`resolveAppDeepLinkPath`), quem não tem cai na web.

/// Ids de doc do Firestore — barra qualquer coisa que quebraria a URL ou
/// escaparia do path.
final RegExp _safeIdPattern = RegExp(r'^[A-Za-z0-9_-]{1,128}$');

bool isSafeInviteId(String? value) {
  final id = value?.trim() ?? '';
  return id.isNotEmpty && _safeIdPattern.hasMatch(id);
}

/// Link do convite JÁ criado (parceiro tem conta). `null` quando o id não
/// serve — melhor não oferecer link do que oferecer um quebrado.
String? tournamentPartnerInviteUrl(String? inviteId) {
  if (!isSafeInviteId(inviteId)) return null;
  return '$kAthletePortalBaseUrl/torneios-convite/${inviteId!.trim()}';
}

/// Cutucada para o parceiro que ainda não respondeu.
String partnerInviteReminderMessage({
  required String? partnerName,
  required String tournamentName,
  required String categoryName,
  required String url,
  String? teamName,
}) {
  final first = partnerName?.trim().split(RegExp(r'\s+')).first ?? '';
  final greeting = first.isNotEmpty ? 'Fala, $first!' : 'Fala!';
  final team = teamName?.trim();
  if (team != null && team.isNotEmpty) {
    return '$greeting Te chamei pra equipe $team no $tournamentName '
        '($categoryName). Aceita por aqui: $url';
  }
  return '$greeting Te chamei pra formar dupla no $tournamentName '
      '($categoryName). Aceita por aqui: $url';
}
