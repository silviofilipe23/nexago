import 'package:flutter/material.dart';
import '../../../core/notifications/notification_navigation.dart';
import '../../../core/router/routes.dart';

import '../../../core/theme/app_colors.dart';
import 'athlete_inbox_notification.dart';

/// Fundo do ícone em notificações de reserva/lembrete (protótipo).
const _bookingIconBackground = Color(0xFF2B1A12);

/// Azul do convite de arena para o professor (protótipo dos vínculos).
const _professorInviteBlue = Color(0xFF5B9BFF);

enum AthleteNotificationActionKind {
  primary,
  secondary,
  dismissOnly,
}

class AthleteNotificationAction {
  const AthleteNotificationAction({
    required this.label,
    required this.kind,
    this.isDestructive = false,
  });

  final String label;
  final AthleteNotificationActionKind kind;
  final bool isDestructive;
}

class AthleteNotificationPresentation {
  const AthleteNotificationPresentation({
    required this.icon,
    required this.iconColor,
    required this.iconBackground,
    this.actions = const [],
    this.routePath,
    this.statusLine,
    this.externalUrl,
  });

  final IconData icon;
  final Color iconColor;
  final Color iconBackground;
  final List<AthleteNotificationAction> actions;
  final String? routePath;
  final String? statusLine;

  /// Aberta no navegador antes da rota (fatura da mensalidade de aula); se não
  /// abrir, vale [routePath]. Mesmo destino do push ([externalNotificationUrl]).
  final String? externalUrl;
}

class AthleteNotificationSection {
  const AthleteNotificationSection({
    required this.label,
    required this.items,
  });

  final String label;
  final List<AthleteInboxNotification> items;
}

int countUnreadNotifications(List<AthleteInboxNotification> items) {
  return items.where((n) => n.isUnread).length;
}

List<AthleteInboxNotification> filterNotifications({
  required List<AthleteInboxNotification> items,
  required bool unreadOnly,
}) {
  final visible = items.where((n) => !n.dismissed).toList();
  if (!unreadOnly) return visible;
  return visible.where((n) => n.isUnread).toList();
}

List<AthleteNotificationSection> groupNotificationsByDay(
  List<AthleteInboxNotification> items,
  DateTime now,
) {
  if (items.isEmpty) return const [];

  final today = DateTime(now.year, now.month, now.day);
  final yesterday = today.subtract(const Duration(days: 1));
  final buckets = <String, List<AthleteInboxNotification>>{};

  for (final item in items) {
    final day = DateTime(
      item.createdAt.year,
      item.createdAt.month,
      item.createdAt.day,
    );
    final String label;
    if (day == today) {
      label = 'HOJE';
    } else if (day == yesterday) {
      label = 'ONTEM';
    } else {
      label =
          '${day.day.toString().padLeft(2, '0')}/${day.month.toString().padLeft(2, '0')}';
    }
    buckets.putIfAbsent(label, () => []).add(item);
  }

  const order = ['HOJE', 'ONTEM'];
  final sections = <AthleteNotificationSection>[];
  for (final key in order) {
    final list = buckets.remove(key);
    if (list != null && list.isNotEmpty) {
      sections.add(AthleteNotificationSection(label: key, items: list));
    }
  }

  final remainingKeys = buckets.keys.toList()..sort((a, b) => b.compareTo(a));
  for (final key in remainingKeys) {
    sections.add(
      AthleteNotificationSection(label: key, items: buckets[key]!),
    );
  }

  return sections;
}

String notificationRelativeTimeLabel(DateTime createdAt, DateTime now) {
  final diff = now.difference(createdAt);
  if (diff.inMinutes < 1) return 'Agora';
  if (diff.inMinutes < 60) return '${diff.inMinutes} min';
  if (diff.inHours < 24) return '${diff.inHours}h';
  if (diff.inDays == 1) return 'Ontem';
  if (diff.inDays < 7) return '${diff.inDays}d';
  return '${createdAt.day.toString().padLeft(2, '0')}/${createdAt.month.toString().padLeft(2, '0')}';
}

String? _tournamentPartnerInviteStatusLine(String response) {
  switch (response.toLowerCase()) {
    case 'accepted':
      return 'Você aceitou o convite';
    case 'declined':
      return 'Você recusou o convite';
    default:
      return null;
  }
}

String? _tournamentPartnerInviteAcceptedRoute(Map<String, String> data) {
  final inviteId = data['inviteId'] ?? '';
  final tournamentId = data['tournamentId'] ?? '';
  final registrationId = data['registrationId'] ?? '';
  final categoryId = data['categoryId'] ?? '';
  if (tournamentId.isNotEmpty && registrationId.isNotEmpty) {
    return '/torneios/$tournamentId/inscricao'
        '?registrationId=$registrationId'
        '&categoryId=$categoryId'
        '&inviteId=$inviteId';
  }
  if (inviteId.isNotEmpty) {
    return '/torneios-convite/$inviteId';
  }
  return null;
}

/// Apresentação + destino do toque. Todo item do inbox leva ao seu assunto: o que o tipo não
/// resolve sozinho cai na mesma resolução do push ([resolveNotificationRoute]).
AthleteNotificationPresentation notificationPresentation(
  AthleteInboxNotification notification,
) {
  final base = _basePresentation(notification);
  // statusLine = desfecho já registrado (ex.: convite recusado): sem destino de propósito.
  if (base.statusLine != null) return base;
  if (base.routePath != null && base.routePath!.isNotEmpty) return base;
  final type = notification.type.toLowerCase();
  final route = resolveNotificationRoute({...notification.data, 'type': type});
  if (route == null || route.isEmpty) return base;
  return AthleteNotificationPresentation(
    icon: base.icon,
    iconColor: base.iconColor,
    iconBackground: base.iconBackground,
    actions: base.actions,
    statusLine: base.statusLine,
    routePath: route,
    externalUrl: base.externalUrl,
  );
}

AthleteNotificationPresentation _basePresentation(
  AthleteInboxNotification notification,
) {
  final type = notification.type.toLowerCase();
  final data = notification.data;

  switch (type) {
    case 'arena_booking_15m_reminder':
    case 'arena_booking_1h_reminder':
      return AthleteNotificationPresentation(
        icon: Icons.schedule_rounded,
        iconColor: AppColors.brand,
        iconBackground: _bookingIconBackground,
        actions: const [
          AthleteNotificationAction(
            label: 'Ver detalhes',
            kind: AthleteNotificationActionKind.primary,
          ),
        ],
        routePath: '/my-bookings',
      );
    case 'arena_booking_created':
      return AthleteNotificationPresentation(
        icon: Icons.check_circle_outline_rounded,
        iconColor: AppColors.win,
        iconBackground: AppColors.win.withValues(alpha: 0.15),
        routePath: '/my-bookings',
      );
    case 'slot_vacancy_available':
      final arenaId = data['arenaId'] ?? '';
      final date = data['date'] ?? '';
      final courtId = data['courtId'] ?? '';
      final startTime = data['startTime'] ?? '';
      final query = <String>[
        if (date.isNotEmpty) 'date=$date',
        if (courtId.isNotEmpty) 'courtId=$courtId',
        if (startTime.isNotEmpty) 'startTime=$startTime',
      ].join('&');
      final path = arenaId.isNotEmpty
          ? '/arena/$arenaId/slots${query.isNotEmpty ? '?$query' : ''}'
          : null;
      return AthleteNotificationPresentation(
        icon: Icons.local_fire_department_rounded,
        iconColor: AppColors.live,
        iconBackground: AppColors.live.withValues(alpha: 0.12),
        actions: const [
          AthleteNotificationAction(
            label: 'Entrar',
            kind: AthleteNotificationActionKind.primary,
          ),
        ],
        routePath: path,
      );
    case 'tournament_partner_invite':
      final inviteId = data['inviteId'] ?? '';
      final inviteResponse = data['inviteResponse'] ?? '';
      final statusLine = _tournamentPartnerInviteStatusLine(inviteResponse);
      if (statusLine != null) {
        final accepted = inviteResponse.toLowerCase() == 'accepted';
        return AthleteNotificationPresentation(
          icon: accepted
              ? Icons.check_circle_outline_rounded
              : Icons.block_rounded,
          iconColor: accepted ? AppColors.win : AppColors.onSurfaceMuted,
          iconBackground: accepted
              ? AppColors.win.withValues(alpha: 0.15)
              : AppColors.surfaceRaised,
          statusLine: statusLine,
          routePath:
              accepted ? _tournamentPartnerInviteAcceptedRoute(data) : null,
        );
      }
      return AthleteNotificationPresentation(
        icon: Icons.emoji_events_outlined,
        iconColor: AppColors.pending,
        iconBackground: AppColors.pending.withValues(alpha: 0.15),
        actions: const [
          AthleteNotificationAction(
            label: 'Aceitar',
            kind: AthleteNotificationActionKind.primary,
          ),
          AthleteNotificationAction(
            label: 'Recusar',
            kind: AthleteNotificationActionKind.secondary,
            isDestructive: true,
          ),
        ],
        routePath: inviteId.isNotEmpty ? '/torneios-convite/$inviteId' : null,
      );
    case 'tournament_partner_invite_accepted':
      final tournamentId = data['tournamentId'] ?? '';
      final registrationId = data['registrationId'] ?? '';
      final categoryId = data['categoryId'] ?? '';
      final inviteId = data['inviteId'] ?? '';
      final url = data['url'] ?? '';
      final routePath = url.startsWith('/')
          ? url
          : tournamentId.isNotEmpty && registrationId.isNotEmpty
              ? '/torneios/$tournamentId/inscricao'
                  '?registrationId=$registrationId'
                  '&categoryId=$categoryId'
                  '&inviteId=$inviteId'
                  '&step=payment'
              : null;
      return AthleteNotificationPresentation(
        icon: Icons.check_circle_outline_rounded,
        iconColor: AppColors.win,
        iconBackground: AppColors.win.withValues(alpha: 0.15),
        actions: const [
          AthleteNotificationAction(
            label: 'Ir para pagamento',
            kind: AthleteNotificationActionKind.primary,
          ),
        ],
        routePath: routePath,
      );
    case 'tournament_registration_confirmed':
      final url = data['url'] ?? '';
      return AthleteNotificationPresentation(
        icon: Icons.verified_rounded,
        iconColor: AppColors.win,
        iconBackground: AppColors.win.withValues(alpha: 0.15),
        actions: const [
          AthleteNotificationAction(
            label: 'Ver inscricao',
            kind: AthleteNotificationActionKind.primary,
          ),
        ],
        routePath: url.startsWith('/') ? url : null,
      );
    case 'tournament_registration_cancelled':
      final cancelUrl = data['url'] ?? '';
      final cancelTournamentId = data['tournamentId'] ?? '';
      return AthleteNotificationPresentation(
        icon: Icons.event_busy_rounded,
        iconColor: AppColors.onSurfaceMuted,
        iconBackground: AppColors.surfaceRaised,
        actions: const [
          AthleteNotificationAction(
            label: 'Ver torneio',
            kind: AthleteNotificationActionKind.primary,
          ),
        ],
        routePath: cancelUrl.startsWith('/')
            ? cancelUrl
            : cancelTournamentId.isNotEmpty
                ? '/torneios/$cancelTournamentId'
                : null,
      );
    case 'tournament_communication':
      final commUrl = data['url'] ?? '';
      final commTournamentId = data['tournamentId'] ?? '';
      final commRoutePath = commUrl.startsWith('/')
          ? commUrl
          : commTournamentId.isNotEmpty
              ? '/torneios/$commTournamentId'
              : null;
      return AthleteNotificationPresentation(
        icon: Icons.campaign_rounded,
        iconColor: AppColors.brand,
        iconBackground: AppColors.brand.withValues(alpha: 0.15),
        actions: commRoutePath == null
            ? const []
            : const [
                AthleteNotificationAction(
                  label: 'Ver torneio',
                  kind: AthleteNotificationActionKind.primary,
                ),
              ],
        routePath: commRoutePath,
      );
    // Vaga liberada nominalmente pelo organizador numa categoria LOTADA. Sem um caso próprio
    // isto caía no `default`: sino genérico e sem botão — a notificação que mais pede ação
    // (a vaga é dele até a chave sair) era a única que não oferecia nenhuma.
    case 'tournament_spot_pass_granted':
      final spotPassUrl = data['url'] ?? '';
      // Mesma função que o push usa (`spotPassNotificationRoute`): as duas entradas para esta
      // notificação precisam terminar no mesmo lugar, inclusive quando o `url` não vem.
      final spotPassRoutePath = spotPassUrl.startsWith('/')
          ? spotPassUrl
          : spotPassNotificationRoute(
              tournamentId: data['tournamentId'] ?? '',
              categoryId: data['categoryId'] ?? '',
            );
      return AthleteNotificationPresentation(
        icon: Icons.confirmation_number_outlined,
        iconColor: AppColors.win,
        iconBackground: AppColors.win.withValues(alpha: 0.15),
        actions: const [
          AthleteNotificationAction(
            label: 'Inscrever-se',
            kind: AthleteNotificationActionKind.primary,
          ),
        ],
        routePath: spotPassRoutePath,
      );
    case 'tournament_payment_reminder':
      final tournamentId = data['tournamentId'] ?? '';
      final registrationId = data['registrationId'] ?? '';
      final categoryId = data['categoryId'] ?? '';
      final paymentUrl = data['url'] ?? '';
      final paymentRoutePath = paymentUrl.startsWith('/')
          ? paymentUrl
          : tournamentId.isNotEmpty && registrationId.isNotEmpty
              ? '/torneios/$tournamentId/inscricao'
                  '?registrationId=$registrationId'
                  '&categoryId=$categoryId'
                  '&step=payment'
              : null;
      return AthleteNotificationPresentation(
        icon: Icons.payments_outlined,
        iconColor: AppColors.pending,
        iconBackground: AppColors.pending.withValues(alpha: 0.15),
        actions: const [
          AthleteNotificationAction(
            label: 'Pagar agora',
            kind: AthleteNotificationActionKind.primary,
          ),
        ],
        routePath: paymentRoutePath,
      );
    case 'booking_invite':
      final inviteId = data['inviteId'] ?? '';
      return AthleteNotificationPresentation(
        icon: Icons.groups_outlined,
        iconColor: AppColors.win,
        iconBackground: AppColors.win.withValues(alpha: 0.12),
        actions: const [
          AthleteNotificationAction(
            label: 'Aceitar',
            kind: AthleteNotificationActionKind.primary,
          ),
          AthleteNotificationAction(
            label: 'Recusar',
            kind: AthleteNotificationActionKind.secondary,
            isDestructive: true,
          ),
        ],
        routePath: inviteId.isNotEmpty ? '/convite/$inviteId' : null,
      );
    case 'match_reminder':
      final matchId = data['matchId'] ?? '';
      return AthleteNotificationPresentation(
        icon: Icons.sports_tennis_rounded,
        iconColor: AppColors.brand,
        iconBackground: _bookingIconBackground,
        actions: const [
          AthleteNotificationAction(
            label: 'Ver detalhes',
            kind: AthleteNotificationActionKind.primary,
          ),
        ],
        routePath: matchId.isNotEmpty
            ? '/athlete/history/match/$matchId'
            : '/athlete/history',
      );
    case 'quest_completed':
    case 'achievement':
      return AthleteNotificationPresentation(
        icon: Icons.bolt_rounded,
        iconColor: AppColors.brand,
        iconBackground: AppColors.brand.withValues(alpha: 0.15),
        routePath: AppRoutes.athleteAchievements,
      );
    case 'ranking_up':
      return AthleteNotificationPresentation(
        icon: Icons.leaderboard_outlined,
        iconColor: AppColors.win,
        iconBackground: AppColors.win.withValues(alpha: 0.12),
        routePath: AppRoutes.athleteRanking,
      );
    // Dia seguinte ao torneio (`functions/src/ranking-story-push.ts`): o
    // `url` abre o ranking do esporte e da temporada com o editor do story por
    // cima — o mesmo destino do push.
    case 'ranking_story_share':
      return AthleteNotificationPresentation(
        icon: Icons.leaderboard_outlined,
        iconColor: AppColors.brand,
        iconBackground: AppColors.brand.withValues(alpha: 0.15),
        actions: const [
          AthleteNotificationAction(
            label: 'Postar no story',
            kind: AthleteNotificationActionKind.primary,
          ),
        ],
        routePath: appRouteForNotificationUrl(data['url']) ??
            AppRoutes.athleteRanking,
      );
    case 'tournament_review_request':
    case 'tournament_review_reminder':
      final reviewTournamentId = data['tournamentId'] ?? '';
      final reviewUrl = data['url'] ?? '';
      final reviewRoutePath = reviewTournamentId.isNotEmpty
          ? AppRoutes.tournamentReview.replaceAll(':tournamentId', reviewTournamentId)
          : reviewUrl.startsWith('/')
              ? reviewUrl
              : null;
      return AthleteNotificationPresentation(
        icon: Icons.star_rounded,
        iconColor: AppColors.brand,
        iconBackground: AppColors.brand.withValues(alpha: 0.15),
        actions: reviewRoutePath == null
            ? const []
            : const [
                AthleteNotificationAction(
                  label: 'Avaliar',
                  kind: AthleteNotificationActionKind.primary,
                ),
              ],
        routePath: reviewRoutePath,
      );
    case 'tournament_review_closed':
      // Mesmo destino do push: a tela de avaliações do organizador; sem id, a url do payload.
      final closedTournamentId = data['tournamentId'] ?? '';
      final closedRoutePath = closedTournamentId.isNotEmpty
          ? AppRoutes.organizerTournamentReviews
              .replaceAll(':tournamentId', closedTournamentId)
          : appRouteForNotificationUrl(data['url']);
      return AthleteNotificationPresentation(
        icon: Icons.star_rounded,
        iconColor: AppColors.brand,
        iconBackground: AppColors.brand.withValues(alpha: 0.15),
        actions: closedRoutePath == null
            ? const []
            : const [
                AthleteNotificationAction(
                  label: 'Ver avaliações',
                  kind: AthleteNotificationActionKind.primary,
                ),
              ],
        routePath: closedRoutePath,
      );
    case organizerStoriesReadyNotificationType:
      // Mesmo destino do push: as artes do Stories; sem ids, a url do payload (o torneio).
      return AthleteNotificationPresentation(
        icon: Icons.photo_library_outlined,
        iconColor: AppColors.brand,
        iconBackground: AppColors.brand.withValues(alpha: 0.15),
        actions: const [
          AthleteNotificationAction(
            label: 'Postar no story',
            kind: AthleteNotificationActionKind.primary,
          ),
        ],
        routePath: organizerStoriesNotificationRoute(data) ??
            appRouteForNotificationUrl(data['url']),
      );
    // Mensalidade de aula (ou cobrança do professor independente): "Pagar"
    // abre a fatura no navegador, como o push; sem link (ou sem navegador), a
    // agenda — onde a cobrança a pagar aparece.
    case classChargeLinkNotificationType:
    case professorChargeLinkNotificationType:
      final invoiceUrl = externalNotificationUrl({...data, 'type': type});
      return AthleteNotificationPresentation(
        icon: Icons.payments_outlined,
        iconColor: AppColors.brand,
        iconBackground: AppColors.brand.withValues(alpha: 0.12),
        actions: invoiceUrl == null
            ? const []
            : const [
                AthleteNotificationAction(
                  label: 'Pagar',
                  kind: AthleteNotificationActionKind.primary,
                ),
              ],
        routePath: athleteChargesLocation,
        externalUrl: invoiceUrl,
      );
    // Fatura do centro de treinamento: "Pagar" abre a fatura no app (Pix e
    // cartão), como o push.
    case centerInvoiceLinkNotificationType:
    case centerBillingNoticeNotificationType:
      return AthleteNotificationPresentation(
        icon: Icons.payments_outlined,
        iconColor: AppColors.brand,
        iconBackground: AppColors.brand.withValues(alpha: 0.12),
        actions: const [
          AthleteNotificationAction(
            label: 'Pagar',
            kind: AthleteNotificationActionKind.primary,
          ),
        ],
        routePath: resolveNotificationRoute({...data, 'type': type}),
      );
    // Contrato do centro para assinar: abre a leitura (K7).
    case centerContractNotificationType:
      return AthleteNotificationPresentation(
        icon: Icons.description_outlined,
        iconColor: AppColors.brand,
        iconBackground: AppColors.brand.withValues(alpha: 0.12),
        actions: const [
          AthleteNotificationAction(
            label: 'Ler e assinar',
            kind: AthleteNotificationActionKind.primary,
          ),
        ],
        routePath: resolveNotificationRoute({...data, 'type': type}),
      );
    // Aula, matrícula, vaga e pagamento confirmado do centro: abrem a aula ou
    // o centro (Treinos).
    case centerAttendancePendingNotificationType:
    case centerStudentAbsenceNotificationType:
      return AthleteNotificationPresentation(
        icon: Icons.fact_check_outlined,
        iconColor: AppColors.brand,
        iconBackground: AppColors.brand.withValues(alpha: 0.12),
        actions: const [
          AthleteNotificationAction(
            label: 'Abrir chamada',
            kind: AthleteNotificationActionKind.primary,
          ),
        ],
        routePath: resolveNotificationRoute({...data, 'type': type}),
      );
    case centerPaymentConfirmedNotificationType:
    case centerClassReminderNotificationType:
    case centerSessionNoticeNotificationType:
    case centerEnrollmentNoticeNotificationType:
    case centerSeatOfferNotificationType:
    case centerEnrollmentRequestNotificationType:
    case centerEnrollmentRequestStaffNotificationType:
      return AthleteNotificationPresentation(
        icon: type == centerPaymentConfirmedNotificationType
            ? Icons.check_circle_outline_rounded
            : Icons.event_note_outlined,
        iconColor: type == centerPaymentConfirmedNotificationType
            ? AppColors.win
            : AppColors.brand,
        iconBackground: (type == centerPaymentConfirmedNotificationType
                ? AppColors.win
                : AppColors.brand)
            .withValues(alpha: 0.12),
        actions: const [
          AthleteNotificationAction(
            label: 'Ver',
            kind: AthleteNotificationActionKind.primary,
          ),
        ],
        routePath: resolveNotificationRoute({...data, 'type': type}),
      );
    // Pagamento ao professor confirmado: abre a confirmação (e o comprovante).
    case professorChargePaidNotificationType:
      return AthleteNotificationPresentation(
        icon: Icons.check_circle_outline_rounded,
        iconColor: AppColors.win,
        iconBackground: AppColors.win.withValues(alpha: 0.12),
        actions: const [
          AthleteNotificationAction(
            label: 'Ver pagamento',
            kind: AthleteNotificationActionKind.primary,
          ),
        ],
        routePath: resolveNotificationRoute({...data, 'type': type}),
      );
    // Avaliação do professor: abre o detalhe.
    case professorEvaluationNotificationType:
      final evaluationRoute = resolveNotificationRoute({...data, 'type': type});
      return AthleteNotificationPresentation(
        icon: Icons.insights_rounded,
        iconColor: AppColors.brand,
        iconBackground: AppColors.brand.withValues(alpha: 0.12),
        actions: const [
          AthleteNotificationAction(
            label: 'Ver avaliação',
            kind: AthleteNotificationActionKind.primary,
          ),
        ],
        routePath: evaluationRoute,
      );
    // Mensagem de conversa: abre a conversa.
    case conversationMessageNotificationType:
      final chatRoute = resolveNotificationRoute({...data, 'type': type});
      return AthleteNotificationPresentation(
        icon: Icons.chat_bubble_outline_rounded,
        iconColor: AppColors.brand,
        iconBackground: AppColors.brand.withValues(alpha: 0.12),
        actions: const [
          AthleteNotificationAction(
            label: 'Ver conversa',
            kind: AthleteNotificationActionKind.primary,
          ),
        ],
        routePath: chatRoute,
      );
    // Comunicado do professor: abre o comunicado (lê e responde a enquete).
    case professorNoticeNotificationType:
      final noticeRoute = resolveNotificationRoute({...data, 'type': type});
      return AthleteNotificationPresentation(
        icon: Icons.campaign_outlined,
        iconColor: AppColors.brand,
        iconBackground: AppColors.brand.withValues(alpha: 0.12),
        actions: const [
          AthleteNotificationAction(
            label: 'Ver comunicado',
            kind: AthleteNotificationActionKind.primary,
          ),
        ],
        routePath: noticeRoute,
      );
    // Convite do professor para a carteira dele: abre a tela do convite.
    case professorStudentInviteNotificationType:
      final inviteRoute = resolveNotificationRoute({...data, 'type': type});
      return AthleteNotificationPresentation(
        icon: Icons.school_outlined,
        iconColor: AppColors.brand,
        iconBackground: AppColors.brand.withValues(alpha: 0.12),
        actions: const [
          AthleteNotificationAction(
            label: 'Ver convite',
            kind: AthleteNotificationActionKind.primary,
          ),
        ],
        routePath: inviteRoute,
      );
    // NexaSquad: o push não manda `url`; o destino sai do tipo/`kind`, igual ao toque no push
    // (convite → tela do convite, aditivo → Squad, repasse → Ganhos).
    case 'squad_program':
    case 'squad_payout':
      final route = resolveNotificationRoute({...data, 'type': type});
      final invite =
          type == 'squad_program' && data['kind'] == 'invite' && route != null;
      return AthleteNotificationPresentation(
        icon: Icons.groups_rounded,
        iconColor: AppColors.brand,
        iconBackground: AppColors.brand.withValues(alpha: 0.12),
        actions: invite
            ? const [
                AthleteNotificationAction(
                  label: 'Ver convite',
                  kind: AthleteNotificationActionKind.primary,
                ),
              ]
            : const [],
        routePath: route,
      );
    // Vínculo professor ↔ arena: o push não manda `url`; o destino sai do tipo
    // (o vínculo pelo `linkId`), igual ao toque no push. O tom segue o status
    // do protótipo: azul convite, verde ativo, vermelho suspenso.
    case 'professor_link_invite':
    case 'professor_link_approved':
    case 'professor_link_reactivated':
    case 'professor_link_suspended':
    case 'professor_link_rejected':
    case 'professor_link_ended':
    case 'professor_link_permissions_changed':
    case 'professor_link_court_discount_changed':
      final color = switch (type) {
        'professor_link_invite' => _professorInviteBlue,
        'professor_link_approved' ||
        'professor_link_reactivated' => AppColors.win,
        'professor_link_suspended' => AppColors.live,
        'professor_link_permissions_changed' ||
        'professor_link_court_discount_changed' => AppColors.brand,
        _ => AppColors.onSurfaceMuted,
      };
      return AthleteNotificationPresentation(
        icon: Icons.school_outlined,
        iconColor: color,
        iconBackground: color.withValues(alpha: 0.12),
        actions: type == 'professor_link_invite'
            ? const [
                AthleteNotificationAction(
                  label: 'Ver convite',
                  kind: AthleteNotificationActionKind.primary,
                ),
              ]
            : const [],
        routePath: resolveNotificationRoute({...data, 'type': type}),
      );
    // Mesmo vínculo, lado da arena (dono e gestores): pedido novo, convite
    // aceito/recusado e encerramento pelo professor abrem o vínculo no painel.
    case 'arena_professor_request':
    case 'arena_professor_invite_accepted':
    case 'arena_professor_invite_declined':
    case 'arena_professor_ended':
      final color = switch (type) {
        'arena_professor_request' => AppColors.pending,
        'arena_professor_invite_accepted' => AppColors.win,
        _ => AppColors.onSurfaceMuted,
      };
      return AthleteNotificationPresentation(
        icon: Icons.school_outlined,
        iconColor: color,
        iconBackground: color.withValues(alpha: 0.12),
        actions: type == 'arena_professor_request'
            ? const [
                AthleteNotificationAction(
                  label: 'Analisar',
                  kind: AthleteNotificationActionKind.primary,
                ),
              ]
            : const [],
        routePath: resolveNotificationRoute({...data, 'type': type}),
      );
    default:
      // Mesma tradução do push: avisos do organizador (que o staff recebe aqui) traziam o
      // `url` do portal (`/painel/...`), rota que não existe no app.
      return AthleteNotificationPresentation(
        icon: Icons.notifications_outlined,
        iconColor: AppColors.onSurfaceMuted,
        iconBackground: AppColors.surfaceRaised,
        routePath: appRouteForNotificationUrl(data['url']),
      );
  }
}
