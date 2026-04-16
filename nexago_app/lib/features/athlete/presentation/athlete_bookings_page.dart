import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_status_views.dart';
import 'booking_details_page.dart';
import '../../arenas/domain/arenas_providers.dart';
import '../../arenas/domain/booking_providers.dart';
import '../../arenas/domain/my_booking_item.dart';
import '../../arenas/domain/my_bookings_providers.dart';
import '../domain/gamification_providers.dart';
import '../domain/arena_review_providers.dart';
import 'widgets/gamification_feedback_sheet.dart';
import 'widgets/rating_dialog.dart';

/// Agenda do atleta em tempo real (Firestore `arenaBookings`).
class AthleteBookingsPage extends ConsumerStatefulWidget {
  const AthleteBookingsPage({super.key});

  @override
  ConsumerState<AthleteBookingsPage> createState() =>
      _AthleteBookingsPageState();
}

class _AthleteBookingsPageState extends ConsumerState<AthleteBookingsPage> {
  final ScrollController _scrollController = ScrollController();
  final Set<String> _processedCompletedBookings = <String>{};
  final Set<String> _promptedReviewBookingIds = <String>{};
  bool _didAutoScroll = false;

  Future<void> _refreshBookings() async {
    ref.invalidate(myBookingsStreamProvider);
    try {
      await ref.read(myBookingsStreamProvider.future);
    } catch (_) {
      // O erro já é tratado pelo estado da tela (AppErrorView).
    }
  }

  @override
  void initState() {
    super.initState();
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollToNowSeparator(BuildContext context) {
    if (!_scrollController.hasClients) return;
    final render = context.findRenderObject();
    if (render is! RenderBox) return;

    final y = render.localToGlobal(Offset.zero).dy;
    final offset = _scrollController.offset + y - 140;
    final target = offset.clamp(
      0.0,
      _scrollController.position.maxScrollExtent,
    );
    _scrollController.animateTo(
      target,
      duration: const Duration(milliseconds: 480),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final now = DateTime.now();
    final bookingsAsync = ref.watch(myBookingsStreamProvider);
    final pendingReviewAsync = ref.watch(pendingReviewProvider);

    return ColoredBox(
      color: theme.colorScheme.surfaceContainerLowest,
      child: bookingsAsync.when(
        loading: () => const AppLoadingView(message: 'Carregando agenda...'),
        error: (e, _) => AppErrorView(
          title: 'Não foi possível carregar agenda',
          message: e.toString().replaceFirst('Exception: ', ''),
          onRetry: () => ref.invalidate(myBookingsStreamProvider),
        ),
        data: (items) {
          final bookings = items
              .map(_athleteBookingFromFirestore)
              .whereType<_AthleteBooking>()
              .toList()
            ..sort((a, b) => b.startAt.compareTo(a.startAt));

          if (bookings.isEmpty) {
            return RefreshIndicator(
              onRefresh: _refreshBookings,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(
                  parent: BouncingScrollPhysics(),
                ),
                children: [
                  SizedBox(
                    height: MediaQuery.of(context).size.height * 0.75,
                    child: _EmptyAgendaState(
                      onBookNow: () => context.go(AppRoutes.discover),
                    ),
                  ),
                ],
              ),
            );
          }

          final nextBooking = bookings
              .where((b) => b.startAt.isAfter(now))
              .fold<_AthleteBooking?>(
                null,
                (prev, curr) =>
                    prev == null || curr.startAt.isBefore(prev.startAt)
                        ? curr
                        : prev,
              );
          final firstCurrentOrFutureIdx = bookings.indexWhere(
            (b) =>
                _bookingStage(now, b.startAt, b.endAt, b.rawStatus) !=
                _BookingStage.past,
          );

          final todayGames = bookings.where((b) {
            if (!_isSameDay(b.startAt, now)) return false;
            final stage = _bookingStage(now, b.startAt, b.endAt, b.rawStatus);
            return stage == _BookingStage.current ||
                stage == _BookingStage.future;
          }).length;
          final dateLabel =
              DateFormat("EEEE, d 'de' MMMM", 'pt_BR').format(now);
          final nextLabel = nextBooking == null
              ? 'Sem próximos jogos confirmados'
              : 'Próximo em ${_minutesUntilLabel(now, nextBooking.startAt)}';
          final rows = _buildTimelineRows(now: now, bookings: bookings);
          _processCompletedBookings(bookings);
          final pendingReview = pendingReviewAsync.valueOrNull;
          if (pendingReview != null &&
              !_promptedReviewBookingIds.contains(pendingReview.bookingId)) {
            _promptedReviewBookingIds.add(pendingReview.bookingId);
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (!mounted) return;
              showRatingDialog(context, pending: pendingReview);
            });
          }

          return RefreshIndicator(
            onRefresh: _refreshBookings,
            child: ListView.builder(
              controller: _scrollController,
              physics: const AlwaysScrollableScrollPhysics(
                parent: BouncingScrollPhysics(),
              ),
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
              itemCount: rows.length + 1,
              itemBuilder: (context, index) {
                if (index == 0) {
                  return Padding(
                    padding: const EdgeInsets.fromLTRB(4, 4, 4, 14),
                    child: _AgendaHeader(
                      dateLabel: _capitalize(dateLabel),
                      todaySummary: 'Você tem $todayGames jogos hoje',
                      nextSummary: nextLabel,
                    ),
                  );
                }

                final row = rows[index - 1];
                if (row.isNowSeparator) {
                  if (!_didAutoScroll && firstCurrentOrFutureIdx >= 0) {
                    _didAutoScroll = true;
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      if (!mounted) return;
                      _scrollToNowSeparator(context);
                    });
                  }
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    child: const _NowSeparator(),
                  );
                }

                final booking = row.booking!;
                final stage = _bookingStage(
                    now, booking.startAt, booking.endAt, booking.rawStatus);
                return _AnimatedTimelineEntry(
                  index: index - 1,
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _TimelineBookingRow(
                      booking: booking,
                      stage: stage,
                      highlightedNext: nextBooking?.id == booking.id,
                      isFirst: row.isFirst,
                      isLast: row.isLast,
                      onTap: () => _openDetails(booking),
                      onCancel: () => _cancelBooking(booking),
                    ),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }

  void _openDetails(_AthleteBooking booking) {
    if (!mounted) return;
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => BookingDetailsPage(
          bookingId: booking.id,
          arenaId: booking.arenaId,
          arenaName: booking.arena,
          courtName: booking.court,
          startAt: booking.startAt,
          endAt: booking.endAt,
          status: booking.rawStatus,
          confirmedParticipants: booking.confirmedParticipants,
          amountReais: booking.amountReais,
          paymentType: booking.paymentType,
        ),
      ),
    );
  }

  Future<void> _cancelBooking(_AthleteBooking booking) async {
    final uid = ref.read(authProvider).valueOrNull?.uid;
    if (uid == null || uid.isEmpty) return;
    try {
      await ref.read(bookingServiceProvider).cancelBooking(
            bookingId: booking.id,
            athleteId: uid,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(content: Text('Reserva cancelada.')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(content: Text('Não foi possível cancelar: $e')),
        );
    }
  }

  void _processCompletedBookings(List<_AthleteBooking> bookings) {
    final userId = ref.read(authProvider).valueOrNull?.uid;
    if (userId == null || userId.isEmpty) return;

    for (final booking in bookings) {
      final status = booking.rawStatus.trim().toLowerCase();
      if (status != 'completed') continue;
      if (_processedCompletedBookings.contains(booking.id)) continue;
      _processedCompletedBookings.add(booking.id);
      _handleCompletedBooking(userId: userId, bookingId: booking.id);
    }
  }

  Future<void> _handleCompletedBooking({
    required String userId,
    required String bookingId,
  }) async {
    try {
      final feedback =
          await ref.read(gamificationServiceProvider).processCompletedGame(
                userId: userId,
                bookingId: bookingId,
                now: DateTime.now(),
              );
      if (!mounted || feedback == null) return;
      await showGamificationFeedbackSheet(
        context,
        feedback: feedback,
      );
    } catch (_) {
      // Evita crash/erro não tratado quando as regras ainda não foram publicadas
      // ou quando houver indisponibilidade temporária do Firestore.
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(
            content: Text('Nao foi possivel atualizar sua gamificacao agora.'),
          ),
        );
    }
  }
}

class _AgendaHeader extends StatelessWidget {
  const _AgendaHeader({
    required this.dateLabel,
    required this.todaySummary,
    required this.nextSummary,
  });

  final String dateLabel;
  final String todaySummary;
  final String nextSummary;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: theme.colorScheme.outline.withValues(alpha: 0.1),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            dateLabel,
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            todaySummary,
            style: theme.textTheme.bodyLarge?.copyWith(
              color: AppColors.onSurfaceMuted,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            nextSummary,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: AppColors.brand,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _TimelineBookingRow extends ConsumerWidget {
  const _TimelineBookingRow({
    required this.booking,
    required this.stage,
    required this.highlightedNext,
    required this.isFirst,
    required this.isLast,
    required this.onTap,
    required this.onCancel,
  });

  final _AthleteBooking booking;
  final _BookingStage stage;
  final bool highlightedNext;
  final bool isFirst;
  final bool isLast;
  final VoidCallback onTap;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final arenaAsync = booking.arenaId == null
        ? null
        : ref.watch(arenaByIdProvider(booking.arenaId!));
    final managedArenaName = arenaAsync?.valueOrNull?.name.trim();
    final displayArenaName =
        booking.arena.trim().isNotEmpty && booking.arena.trim() != 'Arena'
            ? booking.arena.trim()
            : (managedArenaName != null && managedArenaName.isNotEmpty
                ? managedArenaName
                : 'Arena');
    final timeLabel = DateFormat('HH:mm', 'pt_BR').format(booking.startAt);
    final dateLabel = DateFormat('dd/MM', 'pt_BR').format(booking.startAt);
    final endHour = DateFormat('HH:mm', 'pt_BR').format(booking.endAt);
    final status = _statusText(stage, booking.startAt);
    final canCancel = stage == _BookingStage.future;
    final accent = _stageColor(theme, stage);
    final cardBg = stage == _BookingStage.current
        ? AppColors.brand.withValues(alpha: 0.08)
        : theme.colorScheme.surface;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 64,
          child: Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  timeLabel,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: stage == _BookingStage.current
                        ? AppColors.brand
                        : theme.colorScheme.onSurface,
                  ),
                ),
                Text(
                  dateLabel,
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: AppColors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
        ),
        SizedBox(
          width: 28,
          child: Column(
            children: [
              Container(
                width: 2,
                height: 12,
                color: isFirst
                    ? Colors.transparent
                    : theme.colorScheme.outline.withValues(alpha: 0.22),
              ),
              Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: accent,
                  boxShadow: stage == _BookingStage.current
                      ? [
                          BoxShadow(
                            color: accent.withValues(alpha: 0.35),
                            blurRadius: 10,
                          ),
                        ]
                      : null,
                ),
              ),
              Container(
                width: 2,
                height: 98,
                color: isLast
                    ? Colors.transparent
                    : theme.colorScheme.outline.withValues(alpha: 0.22),
              ),
            ],
          ),
        ),
        Expanded(
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: onTap,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 260),
                curve: Curves.easeOutCubic,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: cardBg,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: highlightedNext
                        ? AppColors.brand.withValues(alpha: 0.5)
                        : theme.colorScheme.outline.withValues(alpha: 0.12),
                    width: highlightedNext ? 1.4 : 1,
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            displayArenaName,
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        if (highlightedNext)
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.brand.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              'Próximo',
                              style: theme.textTheme.labelSmall?.copyWith(
                                color: AppColors.brand,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      booking.court.trim().isNotEmpty
                          ? booking.court
                          : 'Quadra',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: AppColors.onSurfaceMuted,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        const Icon(Icons.schedule_rounded, size: 16),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            '$timeLabel - $endHour',
                            style: theme.textTheme.bodyMedium,
                          ),
                        ),
                        Text(
                          status,
                          style: theme.textTheme.labelMedium?.copyWith(
                            color: accent,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '👥 ${booking.confirmedParticipants} confirmados',
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: AppColors.onSurfaceMuted,
                      ),
                    ),
                    if (canCancel) ...[
                      const SizedBox(height: 10),
                      _ActionButton(
                        label: 'Cancelar',
                        icon: Icons.cancel_outlined,
                        danger: true,
                        onTap: onCancel,
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _NowSeparator extends StatelessWidget {
  const _NowSeparator();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Text(
        '──────── AGORA ────────',
        style: theme.textTheme.labelMedium?.copyWith(
          color: AppColors.onSurfaceMuted,
          letterSpacing: 0.5,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _AnimatedTimelineEntry extends StatelessWidget {
  const _AnimatedTimelineEntry({
    required this.index,
    required this.child,
  });

  final int index;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final begin = 0.04 + (index % 6) * 0.01;
    return TweenAnimationBuilder<double>(
      duration: Duration(milliseconds: 220 + (index % 8) * 35),
      curve: Curves.easeOutCubic,
      tween: Tween<double>(begin: begin, end: 1),
      child: child,
      builder: (context, value, child) {
        return Opacity(
          opacity: value.clamp(0, 1),
          child: Transform.translate(
            offset: Offset(0, (1 - value) * 12),
            child: child,
          ),
        );
      },
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.label,
    required this.icon,
    required this.onTap,
    this.danger = false,
  });

  final String label;
  final IconData icon;
  final VoidCallback? onTap;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = danger ? theme.colorScheme.error : AppColors.brand;
    return OutlinedButton.icon(
      onPressed: onTap,
      icon: Icon(icon, size: 18),
      label: Text(label),
      style: OutlinedButton.styleFrom(
        foregroundColor: color,
        side: BorderSide(color: color.withValues(alpha: 0.3)),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
  }
}

class _EmptyAgendaState extends StatelessWidget {
  const _EmptyAgendaState({required this.onBookNow});

  final VoidCallback onBookNow;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ColoredBox(
      color: theme.colorScheme.surfaceContainerLowest,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.event_busy_outlined,
                size: 56,
                color: AppColors.onSurfaceMuted.withValues(alpha: 0.55),
              ),
              const SizedBox(height: 14),
              Text(
                'Sua agenda ainda está vazia',
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                'Que tal marcar seu próximo jogo?\nReserve agora e convide sua dupla.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppColors.onSurfaceMuted,
                ),
              ),
              const SizedBox(height: 18),
              FilledButton.icon(
                onPressed: onBookNow,
                icon: const Icon(Icons.add_circle_outline),
                label: const Text('Reservar agora'),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brand,
                  foregroundColor: Colors.white,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

enum _BookingStage { past, current, future, canceled }

_BookingStage _bookingStage(
  DateTime now,
  DateTime start,
  DateTime end,
  String rawStatus,
) {
  final status = rawStatus.trim().toLowerCase();
  if (status == 'canceled' || status == 'cancelled') {
    return _BookingStage.canceled;
  }
  if (now.isAfter(start) && now.isBefore(end)) return _BookingStage.current;
  if (now.isBefore(start)) return _BookingStage.future;
  return _BookingStage.past;
}

String _statusText(_BookingStage stage, DateTime startAt) {
  switch (stage) {
    case _BookingStage.current:
      return 'Em andamento';
    case _BookingStage.future:
      return 'Em ${_minutesUntilLabel(DateTime.now(), startAt)}';
    case _BookingStage.past:
      return 'Finalizado';
    case _BookingStage.canceled:
      return 'Cancelado';
  }
}

Color _stageColor(ThemeData theme, _BookingStage stage) {
  switch (stage) {
    case _BookingStage.current:
      return AppColors.brand;
    case _BookingStage.future:
      return theme.colorScheme.primary;
    case _BookingStage.past:
      return AppColors.onSurfaceMuted;
    case _BookingStage.canceled:
      return theme.colorScheme.error;
  }
}

String _minutesUntilLabel(DateTime now, DateTime start) {
  final diff = start.difference(now);
  final minutes = diff.inMinutes;
  if (minutes <= 59) return '$minutes min';
  final hours = (minutes / 60).floor();
  final rem = minutes % 60;
  if (rem == 0) return '${hours}h';
  return '${hours}h ${rem}min';
}

bool _isSameDay(DateTime a, DateTime b) {
  return a.year == b.year && a.month == b.month && a.day == b.day;
}

String _capitalize(String value) {
  if (value.isEmpty) return value;
  return value[0].toUpperCase() + value.substring(1);
}

List<_TimelineRow> _buildTimelineRows({
  required DateTime now,
  required List<_AthleteBooking> bookings,
}) {
  final rows = <_TimelineRow>[];
  final markerIdx = bookings.indexWhere(
    (b) =>
        _bookingStage(now, b.startAt, b.endAt, b.rawStatus) !=
        _BookingStage.past,
  );

  for (var i = 0; i < bookings.length; i++) {
    if (i == markerIdx) {
      rows.add(const _TimelineRow.nowSeparator());
    }
    rows.add(
      _TimelineRow.booking(
        bookings[i],
        isFirst: i == 0,
        isLast: i == bookings.length - 1,
      ),
    );
  }

  if (markerIdx < 0 && bookings.isNotEmpty) {
    rows.add(const _TimelineRow.nowSeparator());
  }

  return rows;
}

class _TimelineRow {
  const _TimelineRow.booking(
    this.booking, {
    required this.isFirst,
    required this.isLast,
  }) : isNowSeparator = false;

  const _TimelineRow.nowSeparator()
      : booking = null,
        isFirst = false,
        isLast = false,
        isNowSeparator = true;

  final _AthleteBooking? booking;
  final bool isFirst;
  final bool isLast;
  final bool isNowSeparator;
}

class _AthleteBooking {
  const _AthleteBooking({
    required this.id,
    required this.arenaId,
    required this.arena,
    required this.court,
    required this.startAt,
    required this.endAt,
    required this.confirmedParticipants,
    required this.rawStatus,
    this.amountReais,
    this.paymentType,
  });

  final String id;
  final String? arenaId;
  final String arena;
  final String court;
  final DateTime startAt;
  final DateTime endAt;
  final int confirmedParticipants;
  final String rawStatus;
  final double? amountReais;
  final String? paymentType;
}

_AthleteBooking? _athleteBookingFromFirestore(MyBookingItem item) {
  final start = _parseBookingDateTime(item.dateRaw, item.startTime);
  final end = _parseBookingDateTime(item.dateRaw, item.endTime);
  if (start == null || end == null || !end.isAfter(start)) return null;

  return _AthleteBooking(
    id: item.id,
    arenaId: item.arenaId,
    arena: item.arenaName.trim().isNotEmpty
        ? item.arenaName.trim()
        : (item.arenaId?.trim().isNotEmpty == true
            ? item.arenaId!.trim()
            : 'Arena'),
    court: item.courtName?.trim().isNotEmpty == true
        ? item.courtName!.trim()
        : 'Quadra',
    startAt: start,
    endAt: end,
    confirmedParticipants: 1,
    rawStatus: item.rawStatus,
    amountReais: item.amountReais,
    paymentType: item.paymentType,
  );
}

DateTime? _parseBookingDateTime(String dateRaw, String timeRaw) {
  if (dateRaw.trim().isEmpty) return null;
  final parts = timeRaw.split(':');
  if (parts.isEmpty) return null;
  final hh = int.tryParse(parts[0]) ?? 0;
  final mm = parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0;
  final day = _parseBookingDateOnly(dateRaw);
  if (day == null) return null;
  return DateTime(day.year, day.month, day.day, hh, mm);
}

DateTime? _parseBookingDateOnly(String raw) {
  final value = raw.trim();
  if (value.isEmpty) return null;

  // Formatos ISO comuns: yyyy-MM-dd / yyyy-MM-ddTHH:mm:ss
  if (value.length >= 10) {
    final iso = DateTime.tryParse(value.substring(0, 10));
    if (iso != null) return iso;
  }

  // Formatos legados: dd/MM/yyyy ou dd-MM-yyyy
  final normalized = value.replaceAll('-', '/');
  final parts = normalized.split('/');
  if (parts.length >= 3) {
    final d = int.tryParse(parts[0]) ?? 0;
    final m = int.tryParse(parts[1]) ?? 0;
    final y = int.tryParse(parts[2].substring(0, 4)) ?? 0;
    if (y > 0 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return DateTime(y, m, d);
    }
  }

  return null;
}
