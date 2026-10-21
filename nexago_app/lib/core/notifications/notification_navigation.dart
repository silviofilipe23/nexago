import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../auth/auth_providers.dart';
import '../deep_link/deep_link_providers.dart';
import '../links/open_external_url.dart';
import '../router/routes.dart';

/// Tempo máximo esperando a sessão assentar antes de decidir o destino.
const _sessionSettleTimeout = Duration(seconds: 8);

/// Mensalidade de aula com fatura online (`ensureClassAsaasPayment` em
/// `functions/src/asaas-class-billing.ts`): "Toque para pagar com PIX ou cartão".
const classChargeLinkNotificationType = 'arena_class_charge_link';

/// Cobrança do professor independente (`createProfessorCharge` em
/// `functions/src/professor-wallet.ts`): mesma fatura online do Asaas.
const professorChargeLinkNotificationType = 'professor_charge_link';

/// Cobrança do professor paga (webhook do Asaas): abre "Pagamento confirmado".
const professorChargePaidNotificationType = 'professor_charge_paid';

/// Convite do professor para o atleta entrar na carteira dele.
const professorStudentInviteNotificationType = 'professor_student_invite';

/// Comunicado do professor para o aluno (aviso, enquete…).
const professorNoticeNotificationType = 'professor_notice';

/// O professor marcou o aluno no story do treino (`shareClassStory`).
const classStoryTagNotificationType = 'class_story_tag';

/// Avaliação do professor enviada ao aluno.
const professorEvaluationNotificationType = 'professor_evaluation';

/// Particular pedida/confirmada/recusada/cancelada (fase 10). O `url` já
/// vem do lado certo: `/professor/mais/disponibilidade` para o professor,
/// `/particulares` para o aluno.
const professorPrivateLessonNotificationType = 'professor_private_lesson';

/// Mensagem nova numa conversa professor ↔ aluno (ou no canal professor ↔
/// gestão da arena).
const conversationMessageNotificationType = 'conversation_message';

/// Comunicado da gestão da arena para o professor (F6). Começa com
/// `arena_professor_` mas NÃO é do vínculo: tem caso próprio antes.
const arenaProfessorNoticeNotificationType = 'arena_professor_notice';

/// Turma própria do professor encerrada pelo agendador (vínculo ou horário
/// fixo caíram): o payload traz `url: /professor/mais/turmas`.
const professorOwnClassEndedNotificationType = 'professor_own_class_ended';

/// Professor independente reservou horário fixo para turma própria — vai
/// para o gestor da arena, que vê a série nos horários fixos.
const professorOwnClassRecurringNotificationType =
    'professor_own_class_recurring';

/// Agenda do atleta — onde fica a mensalidade a pagar.
const athleteAgendaTabLocation = '${AppRoutes.discover}?tab=agenda';

/// URL externa que o toque abre no navegador: a fatura da mensalidade de aula
/// ou da cobrança do professor (`invoiceUrl`, URL absoluta do Asaas; `webUrl` é a mesma). `null` =
/// o toque segue a rota interna de [resolveNotificationRoute].
String? externalNotificationUrl(Map<String, dynamic> data) {
  final type = (data['type'] as String?)?.toLowerCase().trim() ?? '';
  if (type != classChargeLinkNotificationType &&
      type != professorChargeLinkNotificationType) {
    return null;
  }
  for (final key in const ['invoiceUrl', 'webUrl']) {
    final raw = (data[key] as String?)?.trim() ?? '';
    final uri = Uri.tryParse(raw);
    if (uri != null &&
        (uri.scheme == 'https' || uri.scheme == 'http') &&
        uri.host.isNotEmpty) {
      return raw;
    }
  }
  return null;
}

/// Destino do toque em uma notificação, já confrontado com o estado da sessão.
class NotificationTapDestination {
  const NotificationTapDestination({
    required this.path,
    required this.requiresLogin,
  });

  /// Rota interna do app (ex.: `/torneios-convite/inv-1`).
  final String path;

  /// Sem sessão o destino não pode abrir agora: vira deep link pendente e o
  /// router o consome ao sair do login.
  final bool requiresLogin;
}

/// Resolve o destino do toque considerando se já existe sessão.
NotificationTapDestination? resolveNotificationTapDestination({
  required Map<String, dynamic> data,
  required bool hasSession,
}) {
  final target = resolveNotificationRoute(data);
  if (target == null || target.isEmpty) return null;
  return NotificationTapDestination(
    path: target,
    requiresLogin: !hasSession,
  );
}

Future<void> navigateFromNotification(
  RemoteMessage message,
  GoRouter router, {
  required WidgetRef ref,
}) {
  return navigateFromNotificationData(message.data, router, ref: ref);
}

Future<void> navigateFromNotificationData(
  Map<String, dynamic> data,
  GoRouter router, {
  required WidgetRef ref,
  Future<bool> Function(String url) openExternal = openExternalUrl,
}) async {
  // Fatura da mensalidade: abre direto no navegador, sem esperar a sessão (a
  // página do Asaas não pede login). Se não abrir, segue para a rota interna.
  final externalUrl = externalNotificationUrl(data);
  if (externalUrl != null && await openExternal(externalUrl)) return;

  // Cold start (toque com o app fechado): o payload chega antes do Firebase
  // Auth restaurar a sessão. Navegar nesse instante mandava o atleta para o
  // login e o destino se perdia — o convite nunca abria.
  final hasSession = await _awaitSettledSession(ref);
  final destination = resolveNotificationTapDestination(
    data: data,
    hasSession: hasSession,
  );
  if (destination == null) return;

  if (destination.requiresLogin) {
    // Mesmo mecanismo dos deep links: consumido em `leavingAuthRoute`.
    ref.read(pendingDeepLinkPathProvider.notifier).state = destination.path;
    router.go(AppRoutes.login);
    return;
  }

  // Garante navegação após estabilizar o frame atual.
  WidgetsBinding.instance.addPostFrameCallback((_) {
    router.go(destination.path);
  });
}

/// Espera a primeira resolução do estado de auth (sessão restaurada ou não).
Future<bool> _awaitSettledSession(WidgetRef ref) async {
  final current = ref.read(authProvider);
  if (!current.isLoading) return current.valueOrNull != null;
  try {
    final user = await ref
        .read(authProvider.future)
        .timeout(_sessionSettleTimeout);
    return user != null;
  } catch (_) {
    return ref.read(authProvider).valueOrNull != null;
  }
}

/// Destino da notificação de VAGA LIBERADA, montado a partir dos ids.
///
/// Existe para o push e a lista de notificações não divergirem. O push resolvia o destino só
/// pelo `url` do payload; a lista já remontava o caminho pelos ids quando ele faltava. Resultado:
/// sem `url`, tocar no item da lista levava à inscrição e tocar no PUSH só abria o app. Duas
/// entradas para a mesma notificação têm de terminar no mesmo lugar — então as duas chamam isto.
///
/// `null` sem torneio: não há destino a inventar.
String? spotPassNotificationRoute({
  required String tournamentId,
  required String categoryId,
}) {
  final id = tournamentId.trim();
  if (id.isEmpty) return null;
  final category = categoryId.trim();
  final query =
      category.isEmpty ? '' : '?categoryId=${Uri.encodeComponent(category)}';
  return '/torneios/$id/inscricao$query';
}

/// Rota do app para o `url` do payload — `null` quando falta ou não tem equivalente no app.
///
/// `deliverNotificationToUser` manda o MESMO payload ao app e ao portal do organizador. As
/// notificações de quem opera o torneio levavam o `url` do PORTAL (`/painel/...`) e o app
/// navegava pra ele como estava: rota inexistente, tela de erro do GoRouter. O backend agora
/// manda a rota do app em `url` (e a do portal em `webUrl`); a tradução aqui cobre o que já
/// está gravado no inbox e functions ainda não redeployadas.
///
/// `/admin/...` é do admin web antigo e não tem equivalente: `null`, e quem decide é o tipo.
String? appRouteForNotificationUrl(String? raw) {
  final url = raw?.trim() ?? '';
  if (!url.startsWith('/')) return null;
  final path = url.split('?').first.split('#').first;
  final segments = path.split('/').where((s) => s.isNotEmpty).toList();
  final root = segments.isEmpty ? '' : segments.first;

  if (root == 'painel') {
    // `/painel/eventos/{id}/...` — inscrições, pagamentos, cancelamentos do torneio.
    if (segments.length >= 3 && segments[1] == 'eventos') {
      return AppRoutes.organizerTournamentDetail
          .replaceAll(':tournamentId', segments[2]);
    }
    if (segments.length == 2 && segments[1] == 'financeiro') {
      return AppRoutes.organizerWallet;
    }
    return null;
  }
  if (root == 'admin') return null;
  return url;
}

String? resolveNotificationRoute(Map<String, dynamic> data) {
  final type = (data['type'] as String?)?.toLowerCase().trim() ?? '';

  // Avaliação do torneio: o payload leva `url: /torneios/{id}` para o app ANTIGO, que não tem o
  // formulário. Este build abre a avaliação direto — por isso o tipo vem antes da url.
  if (type == 'tournament_review_request' || type == 'tournament_review_reminder') {
    final reviewTournamentId = (data['tournamentId'] as String?)?.trim() ?? '';
    if (reviewTournamentId.isNotEmpty) {
      return AppRoutes.tournamentReview.replaceAll(':tournamentId', reviewTournamentId);
    }
  }

  // Fechamento das avaliações (organizador): o `url` leva ao torneio no app ANTIGO, que não tem
  // a tela. Este build abre as avaliações direto — por isso o tipo vem antes da url.
  if (type == 'tournament_review_closed') {
    final closedTournamentId = (data['tournamentId'] as String?)?.trim() ?? '';
    if (closedTournamentId.isNotEmpty) {
      return AppRoutes.organizerTournamentReviews
          .replaceAll(':tournamentId', closedTournamentId);
    }
  }

  // Pagamento ao professor confirmado: o `url` do payload é a Agenda (app
  // antigo, sem a tela); este build abre a confirmação pelo `chargeId`.
  if (type == professorChargePaidNotificationType) {
    final chargeId = (data['chargeId'] as String?)?.trim() ?? '';
    if (chargeId.isEmpty) return athleteAgendaTabLocation;
    return AppRoutes.lessonPaymentConfirmed
        .replaceAll(':chargeId', Uri.encodeComponent(chargeId));
  }

  // Mensalidade de aula: o toque abre a fatura ([externalNotificationUrl]); a
  // rota é o plano B (sem link ou sem navegador). Vem antes do `url` e longe do
  // ramo genérico de `arena` lá embaixo, que mandava o atleta pra agenda do GESTOR.
  if (type == classChargeLinkNotificationType ||
      type == professorChargeLinkNotificationType) {
    return athleteAgendaTabLocation;
  }

  // Avaliação: `url` (`/avaliacao/{id}`); sem ele, monta pelo id.
  if (type == professorEvaluationNotificationType) {
    final url = appRouteForNotificationUrl(data['url'] as String?);
    if (url != null) return url;
    final id = (data['evaluationId'] as String?)?.trim() ?? '';
    return id.isEmpty
        ? AppRoutes.athleteEvaluations
        : AppRoutes.athleteEvaluation
            .replaceAll(':evaluationId', Uri.encodeComponent(id));
  }

  // Particular: `url` decide o lado (professor ou aluno); sem ele, as
  // particulares do aluno. Caso próprio, antes de qualquer ramo genérico.
  if (type == professorPrivateLessonNotificationType) {
    return appRouteForNotificationUrl(data['url'] as String?) ??
        AppRoutes.athletePrivateLessons;
  }

  // Mensagem: `url` já vem do lado certo (`/professor/mensagens/{id}`,
  // `/mensagens/{id}` ou, para a gestão no canal com a arena,
  // `/arena/professionals/{linkId}/conversa`); sem ele, a conversa no modo
  // Atleta.
  if (type == conversationMessageNotificationType) {
    final url = appRouteForNotificationUrl(data['url'] as String?);
    if (url != null) return url;
    final id = (data['conversationId'] as String?)?.trim() ?? '';
    return id.isEmpty
        ? AppRoutes.athleteMessages
        : AppRoutes.athleteConversation
            .replaceAll(':conversationId', Uri.encodeComponent(id));
  }

  // Story do treino: `url` (`/story-do-treino/{id}`); sem ele, pelo `tagId`.
  if (type == classStoryTagNotificationType) {
    final url = appRouteForNotificationUrl(data['url'] as String?);
    if (url != null) return url;
    final tagId = (data['tagId'] as String?)?.trim() ?? '';
    return tagId.isEmpty
        ? AppRoutes.home
        : AppRoutes.classStoryTag
            .replaceAll(':tagId', Uri.encodeComponent(tagId));
  }

  // Comunicado do professor: o payload traz `url` (`/aviso-professor/{id}`);
  // sem ele, monta pelo `noticeId`.
  if (type == professorNoticeNotificationType) {
    final url = appRouteForNotificationUrl(data['url'] as String?);
    if (url != null) return url;
    final noticeId = (data['noticeId'] as String?)?.trim() ?? '';
    if (noticeId.isNotEmpty) {
      return AppRoutes.professorNoticeForStudent
          .replaceAll(':noticeId', Uri.encodeComponent(noticeId));
    }
    return AppRoutes.home;
  }

  // Comunicado da arena para o professor: `url`
  // (`/professor/mais/comunicados/arena/{id}`); sem ele, monta pelo
  // `noticeId`. Antes do ramo `arena_professor_` (vínculo) lá embaixo.
  if (type == arenaProfessorNoticeNotificationType) {
    final url = appRouteForNotificationUrl(data['url'] as String?);
    if (url != null) return url;
    final noticeId = (data['noticeId'] as String?)?.trim() ?? '';
    if (noticeId.isEmpty) return AppRoutes.professorNotices;
    return AppRoutes.professorArenaNotice
        .replaceAll(':noticeId', Uri.encodeComponent(noticeId));
  }

  // Convite para a carteira do professor: o payload traz `url`
  // (`/convite-professor/{uid}`); sem ele, monta pelo `professorUid`.
  if (type == professorStudentInviteNotificationType) {
    final url = appRouteForNotificationUrl(data['url'] as String?);
    if (url != null) return url;
    final professorUid = (data['professorUid'] as String?)?.trim() ?? '';
    if (professorUid.isNotEmpty) {
      return AppRoutes.professorStudentInvite
          .replaceAll(':professorUid', Uri.encodeComponent(professorUid));
    }
    return AppRoutes.home;
  }

  // Turma própria encerrada: `url` (Minhas turmas); sem ele, a mesma tela.
  if (type == professorOwnClassEndedNotificationType) {
    return appRouteForNotificationUrl(data['url'] as String?) ??
        AppRoutes.professorClasses;
  }

  // Horário fixo de turma própria (gestor): o payload traz `arenaId` e nenhum
  // `url` — sem este caso, o ramo genérico de arena abria a agenda do dia.
  if (type == professorOwnClassRecurringNotificationType) {
    return AppRoutes.arenaRecurring;
  }

  // Vínculo professor ↔ arena (`arenaProfessorNotices` em
  // arena-professor-links.ts): convite, aprovação, recusa, suspensão,
  // reativação, encerramento e permissões abrem o vínculo. O payload vem SEM
  // `url` e sem `arenaId` de propósito — o app antigo cairia na agenda do
  // GESTOR pelo ramo genérico de arena lá embaixo; este build resolve pelo tipo.
  if (type.startsWith('professor_link_')) {
    final linkId = (data['linkId'] as String?)?.trim() ?? '';
    if (linkId.isEmpty) return AppRoutes.professorArenas;
    return AppRoutes.professorArenaLink
        .replaceAll(':linkId', Uri.encodeComponent(linkId));
  }

  // Lado da arena do mesmo vínculo (`arena_professor_request`,
  // `_invite_accepted`, `_invite_declined`, `_ended`), para dono e gestores: o
  // payload traz `arenaId` e nenhum `url`, então sem este caso o ramo genérico
  // de arena lá embaixo abria a agenda. Este build abre o vínculo.
  if (type.startsWith('arena_professor_')) {
    final linkId = (data['linkId'] as String?)?.trim() ?? '';
    if (linkId.isEmpty) return AppRoutes.arenaProfessionals;
    return AppRoutes.arenaProfessionalDetail
        .replaceAll(':linkId', Uri.encodeComponent(linkId));
  }

  final url = appRouteForNotificationUrl(data['url'] as String?);
  if (url != null) return url;

  // Cashback liberado / vencendo: o backend manda `url: '/cashback'`; sem ele
  // (item antigo do inbox), o tipo ainda leva a Meu cashback.
  if (type.startsWith('cashback_')) return AppRoutes.athleteCashback;

  // NexaSquad (`notifySquad` em squad-applications.ts): convite e os lembretes
  // dele abrem o convite; aditivo abre o Squad, onde o aceite está; repasse
  // abre os ganhos. Candidatura recusada não tem tela própria: só abre o app.
  if (type == 'squad_program') {
    final kind = (data['kind'] as String?)?.trim() ?? '';
    final inviteId = (data['inviteId'] as String?)?.trim() ?? '';
    if (kind == 'invite' && inviteId.isNotEmpty) {
      return AppRoutes.squadInvite.replaceAll(':inviteId', inviteId);
    }
    if (kind == 'amendment') return AppRoutes.squad;
    return null;
  }
  if (type == 'squad_payout') return AppRoutes.squadEarnings;

  // Pedido da Loja (`store_order_pickup_code`, `_payment`, `_shipped`,
  // `_canceled`): o push leva só o `orderId` — abre o pedido.
  if (type.startsWith('store_order_')) {
    final orderId = (data['orderId'] as String?)?.trim() ?? '';
    if (orderId.isEmpty) return AppRoutes.storeOrders;
    return AppRoutes.storeOrder
        .replaceAll(':orderId', Uri.encodeComponent(orderId));
  }

  // Lembrete de partida: mesmo destino do item no inbox. O `url` antigo apontava pro admin web.
  if (type == 'match_reminder') {
    final matchId = (data['matchId'] as String?)?.trim() ?? '';
    if (matchId.isEmpty) return AppRoutes.athleteMatchHistory;
    return AppRoutes.athleteMatchDetail.replaceAll(':matchId', matchId);
  }

  // Sem `url` no payload, este tipo não tinha caso próprio e o toque no push não resolvia nada
  // — só abria o app. Todos os outros tipos que importam já remontam o destino pelos ids.
  if (type == 'tournament_spot_pass_granted') {
    return spotPassNotificationRoute(
      tournamentId: (data['tournamentId'] as String?) ?? '',
      categoryId: (data['categoryId'] as String?) ?? '',
    );
  }

  if (type == 'slot_vacancy_available') {
    final arenaId = (data['arenaId'] as String?)?.trim() ?? '';
    if (arenaId.isEmpty) return null;
    final date = (data['date'] as String?)?.trim();
    final courtId = (data['courtId'] as String?)?.trim();
    final startTime = (data['startTime'] as String?)?.trim();
    final path = AppRoutes.arenaSlots.replaceAll(':arenaId', arenaId);
    final params = <String, String>{};
    if (date != null && date.isNotEmpty) params['date'] = date;
    if (courtId != null && courtId.isNotEmpty) params['courtId'] = courtId;
    if (startTime != null && startTime.isNotEmpty) {
      params['startTime'] = startTime;
    }
    if (params.isEmpty) return path;
    final query = params.entries
        .map((e) => '${e.key}=${Uri.encodeComponent(e.value)}')
        .join('&');
    return '$path?$query';
  }

  if (type == 'tournament_partner_invite') {
    final inviteId = (data['inviteId'] as String?)?.trim() ?? '';
    if (inviteId.isEmpty) return null;
    return AppRoutes.tournamentPartnerInvite.replaceAll(':inviteId', inviteId);
  }

  // Convite de substituição (jornada v2) mora na MESMA coleção/tela de
  // convite de parceiro (`attachRegistrationId`, ver
  // `functions/src/tournament-substitution.ts`) — a tela de convite já
  // distingue pelo `isSubstitutionInvite`. Cobre tanto o push original
  // quanto o lembrete (`resendSubstitutionInvite`), que manda o mesmo tipo.
  if (type == 'tournament_substitution_invite') {
    final inviteId = (data['inviteId'] as String?)?.trim() ?? '';
    if (inviteId.isEmpty) return null;
    return AppRoutes.tournamentPartnerInvite.replaceAll(':inviteId', inviteId);
  }

  if (type == 'tournament_partner_invite_accepted') {
    final tournamentId = (data['tournamentId'] as String?)?.trim() ?? '';
    final registrationId = (data['registrationId'] as String?)?.trim() ?? '';
    final categoryId = (data['categoryId'] as String?)?.trim() ?? '';
    final inviteId = (data['inviteId'] as String?)?.trim() ?? '';
    if (tournamentId.isEmpty || registrationId.isEmpty) return null;
    final path = AppRoutes.tournamentRegistration
        .replaceAll(':tournamentId', tournamentId);
    final params = <String, String>{
      'registrationId': registrationId,
      'step': 'payment',
    };
    if (categoryId.isNotEmpty) params['categoryId'] = categoryId;
    if (inviteId.isNotEmpty) params['inviteId'] = inviteId;
    final query = params.entries
        .map((e) => '${e.key}=${Uri.encodeComponent(e.value)}')
        .join('&');
    return '$path?$query';
  }

  // Pelada (`booking-result-write.ts`): placar para confirmar, lembrete das
  // 24h e contestação — todos abrem o detalhe da pelada. Sem `url` no
  // payload: o app de antes desta tela cai em Minhas reservas.
  if (type.startsWith('booking_result_')) {
    final bookingId = (data['bookingId'] as String?)?.trim() ?? '';
    if (bookingId.isEmpty) return AppRoutes.athleteMatchHistory;
    return AppRoutes.peladaDetail
        .replaceAll(':bookingId', Uri.encodeComponent(bookingId));
  }

  if (type == 'booking_invite') {
    final inviteId = (data['inviteId'] as String?)?.trim() ?? '';
    if (inviteId.isEmpty) return null;
    return AppRoutes.bookingInvite.replaceAll(':inviteId', inviteId);
  }

  // Bora Jogar (match finder): todos os tipos caem no detalhe do jogo —
  // a tela se adapta ao status/papel.
  if (type.startsWith('friendly_match_')) {
    final matchId = (data['matchId'] as String?)?.trim() ?? '';
    if (matchId.isEmpty) return AppRoutes.friendlyMatchHub;
    return AppRoutes.friendlyMatchDetail.replaceAll(':matchId', matchId);
  }

  // `tournament_communication` é o aviso em broadcast do organizador: sem
  // destino próprio, abre o torneio de onde o aviso partiu.
  if (type == 'tournament_bracket_published' ||
      type == 'tournament_cancelled' ||
      type == 'tournament_communication' ||
      type == 'tournament_registration_cancelled') {
    final tournamentId = (data['tournamentId'] as String?)?.trim() ?? '';
    if (tournamentId.isNotEmpty) {
      return AppRoutes.tournamentDetail.replaceAll(
        ':tournamentId',
        tournamentId,
      );
    }
  }

  // Escada de níveis (engine de rating) -> Esportes e níveis. O backend já
  // envia `url`; isto é o fallback explícito por tipo.
  if (type == 'level_promotion' ||
      type == 'relegation_warning' ||
      type == 'relegation_applied' ||
      type == 'relegation_cleared') {
    return AppRoutes.athleteSportsLevels;
  }

  // Fluxo de reserva (atleta) -> tela de reservas.
  if (type.contains('booking') || data['bookingId'] != null) {
    return AppRoutes.myBookings;
  }

  // Fluxo de arena (gestor) -> agenda da arena.
  if (type.contains('arena') || data['arenaId'] != null) {
    return AppRoutes.arenaSchedule;
  }

  return null;
}
