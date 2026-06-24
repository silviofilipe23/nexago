import 'package:flutter/material.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart';
import '../data/athlete_notifications_repository.dart';
import '../domain/athlete_inbox_notification.dart';
import '../domain/athlete_notifications_logic.dart';
import '../domain/athlete_notifications_providers.dart';
import 'widgets/athlete_notifications/animated_notification_removal.dart';
import 'widgets/athlete_notifications/athlete_notification_card.dart';
import 'widgets/athlete_notifications/athlete_notifications_filter_bar.dart';
import 'widgets/athlete_notifications/athlete_notifications_section_header.dart';

class AthleteNotificationsPage extends ConsumerStatefulWidget {
  const AthleteNotificationsPage({super.key});

  @override
  ConsumerState<AthleteNotificationsPage> createState() =>
      _AthleteNotificationsPageState();
}

class _AthleteNotificationsPageState
    extends ConsumerState<AthleteNotificationsPage> {
  bool _unreadOnly = false;
  bool _markingAll = false;
  final Set<String> _removingIds = <String>{};

  String? get _uid => ref.read(authProvider).valueOrNull?.uid;

  Future<void> _markAllRead(List<AthleteInboxNotification> items) async {
    final uid = _uid;
    if (uid == null || _markingAll) return;
    setState(() => _markingAll = true);
    try {
      await ref
          .read(athleteNotificationsRepositoryProvider)
          .markAllRead(uid, items);
    } finally {
      if (mounted) setState(() => _markingAll = false);
    }
  }

  Future<void> _dismiss(AthleteInboxNotification notification) async {
    final uid = _uid;
    if (uid == null) return;
    await ref
        .read(athleteNotificationsRepositoryProvider)
        .dismiss(uid, notification.id);
  }

  void _animateRemoval(AthleteInboxNotification notification) {
    if (_removingIds.contains(notification.id)) return;
    setState(() => _removingIds.add(notification.id));
  }

  Future<void> _commitRemoval(AthleteInboxNotification notification) async {
    try {
      await _dismiss(notification);
    } finally {
      if (mounted) {
        setState(() => _removingIds.remove(notification.id));
      }
    }
  }

  Future<void> _markRead(AthleteInboxNotification notification) async {
    final uid = _uid;
    if (uid == null || notification.read) return;
    await ref
        .read(athleteNotificationsRepositoryProvider)
        .markRead(uid, notification.id);
  }

  void _navigateForNotification(AthleteInboxNotification notification) {
    final presentation = notificationPresentation(notification);
    final path = presentation.routePath;
    if (path == null || path.isEmpty) return;
    _markRead(notification);
    context.push(path);
  }

  Future<void> _handlePrimaryAction(
    AthleteInboxNotification notification,
  ) async {
    await _markRead(notification);
    final presentation = notificationPresentation(notification);
    final type = notification.type.toLowerCase();

    if (type == 'tournament_partner_invite' ||
        type == 'tournament_partner_invite_accepted' ||
        type == 'tournament_registration_confirmed' ||
        type == 'booking_invite') {
      _navigateForNotification(notification);
      return;
    }

    if (!mounted) return;
    if (presentation.routePath != null) {
      context.push(presentation.routePath!);
    }
  }

  Future<void> _handleSecondaryAction(
    AthleteInboxNotification notification,
  ) async {
    final type = notification.type.toLowerCase();
    final data = notification.data;

    try {
      if (type == 'tournament_partner_invite') {
        final inviteId = data['inviteId'] ?? '';
        if (inviteId.isEmpty) return;
        await ref
            .read(tournamentPartnerInviteServiceProvider)
            .cancelInvite(inviteId, asDecline: true);
        if (!mounted) return;
        showAppSnackBar(context, 'Convite recusado.');
      } else if (type == 'booking_invite') {
        if (!mounted) return;
        showAppSnackBar(
          context,
          'Abra o convite para recusar na tela de detalhes.',
        );
        _navigateForNotification(notification);
        return;
      }
      _animateRemoval(notification);
    } on TournamentPartnerInviteException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final notificationsAsync = ref.watch(athleteNotificationsProvider);
    final allItems = notificationsAsync.valueOrNull ?? const [];
    final unreadCount = countUnreadNotifications(allItems);
    final filtered = filterNotifications(
      items: allItems,
      unreadOnly: _unreadOnly,
    );
    final sections = groupNotificationsByDay(filtered, DateTime.now());
    final now = DateTime.now();

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: NexaAppBar(
        backgroundColor: context.themeColors.canvas,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.chevron_left_rounded, size: 28),
          onPressed: () => context.pop(),
        ),
        title: Text(
          'Notificações',
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurface,
          ),
        ),
        centerTitle: false,
        actions: [
          TextButton(
            onPressed: unreadCount == 0 || _markingAll
                ? null
                : () => _markAllRead(allItems),
            child: _markingAll
                ? SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(
                    'Ler tudo',
                    style: TextStyle(
                      color: unreadCount == 0
                          ? context.themeColors.onSurfaceMuted
                          : AppColors.brand,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
          ),
        ],
      ),
      body: notificationsAsync.when(
        loading: () =>
            Center(child: CircularProgressIndicator(color: AppColors.brand)),
        error: (_, __) =>
            _EmptyState(message: 'Não foi possível carregar as notificações.'),
        data: (_) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                child: AthleteNotificationsFilterBar(
                  showUnreadOnly: _unreadOnly,
                  unreadCount: unreadCount,
                  onChanged: (v) => setState(() => _unreadOnly = v),
                ),
              ),
              Expanded(
                child: filtered.isEmpty
                    ? _EmptyState(
                        message: _unreadOnly
                            ? 'Nenhuma notificação não lida.'
                            : 'Você não tem notificações.',
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                        itemCount: _sectionItemCount(sections),
                        itemBuilder: (context, index) {
                          final item = _resolveSectionItem(sections, index);
                          if (item.isHeader) {
                            return AthleteNotificationsSectionHeader(
                              label: item.header!,
                            );
                          }
                          final n = item.notification!;
                          final presentation = notificationPresentation(n);
                          final isRemoving = _removingIds.contains(n.id);
                          return AnimatedNotificationRemoval(
                            isRemoving: isRemoving,
                            onRemoved: () => _commitRemoval(n),
                            child: AbsorbPointer(
                              absorbing: isRemoving,
                              child: AthleteNotificationCard(
                                notification: n,
                                presentation: presentation,
                                timeLabel: notificationRelativeTimeLabel(
                                  n.createdAt,
                                  now,
                                ),
                                onDismiss: isRemoving
                                    ? () {}
                                    : () => _animateRemoval(n),
                                onPrimaryAction: isRemoving
                                    ? () {}
                                    : () => _handlePrimaryAction(n),
                                onSecondaryAction:
                                    presentation.actions.length > 1 &&
                                        !isRemoving
                                    ? () => _handleSecondaryAction(n)
                                    : null,
                                onTap:
                                    isRemoving ||
                                        presentation.routePath == null ||
                                        presentation.actions.isNotEmpty
                                    ? null
                                    : () => _navigateForNotification(n),
                              ),
                            ),
                          );
                        },
                      ),
              ),
            ],
          );
        },
      ),
    );
  }

  int _sectionItemCount(List<AthleteNotificationSection> sections) {
    var count = 0;
    for (final s in sections) {
      count += 1 + s.items.length;
    }
    return count;
  }

  _SectionListItem _resolveSectionItem(
    List<AthleteNotificationSection> sections,
    int index,
  ) {
    var cursor = 0;
    for (final section in sections) {
      if (cursor == index) {
        return _SectionListItem(header: section.label);
      }
      cursor++;
      for (final n in section.items) {
        if (cursor == index) {
          return _SectionListItem(notification: n);
        }
        cursor++;
      }
    }
    throw StateError('Invalid section index: $index');
  }
}

class _SectionListItem {
  _SectionListItem({this.header, this.notification})
    : assert(header != null || notification != null);

  final String? header;
  final AthleteInboxNotification? notification;

  bool get isHeader => header != null;
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Text(
          message,
          textAlign: TextAlign.center,
          style: AppTypography.soraRegular(
            fontSize: 15,
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
    );
  }
}
