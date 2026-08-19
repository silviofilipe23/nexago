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

/// Parâmetros de contexto que viajam no link do convite externo. Os mesmos
/// nomes do portal web (`partner-invite.ts`), para que um link gerado em
/// qualquer superfície seja lido pela outra.
const String kPartnerInviteRefParam = 'ref';
const String kPartnerInviteFromParam = 'de';

/// Link do convite para parceiro SEM conta.
///
/// O token é o id do convite externo; `ref` é o código de indicação (o uid de
/// quem convida) e `de` o nome dele, para a tela de cadastro dizer quem
/// chamou. Quem tem o app cai no app; quem não tem, no portal.
String? externalPartnerInviteUrl({
  required String? externalInviteId,
  String? referralCode,
  String? inviterName,
}) {
  if (!isSafeInviteId(externalInviteId)) return null;
  final params = <String, String>{};
  if (isSafeInviteId(referralCode)) {
    params[kPartnerInviteRefParam] = referralCode!.trim();
  }
  final from = inviterName?.trim();
  if (from != null && from.isNotEmpty) {
    params[kPartnerInviteFromParam] = from;
  }
  final base = '$kAthletePortalBaseUrl/convite-dupla/${externalInviteId!.trim()}';
  if (params.isEmpty) return base;
  return '$base?${Uri(queryParameters: params).query}';
}

/// Convite para quem ainda não está no nexaGO — o texto precisa dizer que o
/// primeiro passo é criar a conta, senão o link parece quebrado.
String externalPartnerInviteMessage({
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
    return '$greeting Bora jogar na minha equipe $team no $tournamentName '
        '($categoryName)? Cria tua conta no nexaGO por este link que o convite '
        'da equipe já te espera: $url';
  }
  return '$greeting Bora formar dupla comigo no $tournamentName '
      '($categoryName)? Cria tua conta no nexaGO por este link que o convite '
      'já te espera: $url';
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

/// Código de indicação embutido num caminho de deep link pendente.
///
/// O convite por link leva `?ref=<uid>`; o cadastro precisa disso para gravar
/// o vínculo `referredBy` (o campo do onboarding é digitado à mão). Caminho
/// malformado devolve `null` — perder a indicação é ruim, quebrar o cadastro
/// de quem acabou de chegar é pior.
String? referralCodeFromDeepLinkPath(String? path) {
  final raw = path?.trim() ?? '';
  if (raw.isEmpty) return null;
  final Uri uri;
  try {
    uri = Uri.parse(raw);
  } on FormatException {
    return null;
  }
  final code = uri.queryParameters[kPartnerInviteRefParam];
  return isSafeInviteId(code) ? code!.trim() : null;
}
