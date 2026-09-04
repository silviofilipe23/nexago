import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import 'athlete_inbox_notification.dart';

/// Fundo do ícone em notificações de reserva/lembrete (protótipo).
const _bookingIconBackground = Color(0xFF2B1A12);

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
  });

  final IconData icon;
  final Color iconColor;
  final Color iconBackground;
  final List<AthleteNotificationAction> actions;
  final String? routePath;
  final String? statusLine;
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

  final remainingKeys = buckets.keys.toList()
    ..sort((a, b) => b.compareTo(a));
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

AthleteNotificationPresentation notificationPresentation(
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
          routePath: accepted
              ? _tournamentPartnerInviteAcceptedRoute(data)
              : null,
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
        routePath:
            inviteId.isNotEmpty ? '/torneios-convite/$inviteId' : null,
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
        routePath:
            matchId.isNotEmpty ? '/athlete/history/match/$matchId' : '/athlete/history',
      );
    case 'quest_completed':
    case 'achievement':
      return AthleteNotificationPresentation(
        icon: Icons.bolt_rounded,
        iconColor: AppColors.brand,
        iconBackground: AppColors.brand.withValues(alpha: 0.15),
      );
    case 'ranking_up':
      return AthleteNotificationPresentation(
        icon: Icons.leaderboard_outlined,
        iconColor: AppColors.win,
        iconBackground: AppColors.win.withValues(alpha: 0.12),
      );
    default:
      final url = data['url'] ?? '';
      return AthleteNotificationPresentation(
        icon: Icons.notifications_outlined,
        iconColor: AppColors.onSurfaceMuted,
        iconBackground: AppColors.surfaceRaised,
        routePath: url.startsWith('/') ? url : null,
      );
  }
}
