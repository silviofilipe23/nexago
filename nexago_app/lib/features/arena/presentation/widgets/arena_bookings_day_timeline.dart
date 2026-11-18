import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/fade_slide_in.dart';
import '../../../../core/ui/nexa_share.dart';
import '../../domain/arena_access_providers.dart';
import '../../domain/arena_booking_card_pills.dart';
import '../../domain/arena_booking_labels.dart';
import '../../domain/arena_staff_role.dart';
import '../../domain/arena_booking_day_timeline.dart';
import '../../domain/arena_bookings_day_providers.dart';
import '../../domain/arena_date_utils.dart';
import '../../domain/arena_free_windows.dart';
import '../../domain/arena_schedule_providers.dart';
import '../../domain/arena_manager_booking.dart';
import 'arena_booking_card.dart';
import 'arena_booking_card_actions.dart';
import 'arena_now_booking_label.dart';

/// Largura do selo de horário do marcador "agora".
const double _nowPill = 44;

/// Largura do trilho (ponto + linha vertical).
const double _railColumn = 18;

/// Linha do dia como sliver: trilho com ponto à esquerda e o card (que já
/// traz o horário em destaque; repetir numa coluna roubava largura dos
/// botões).
/// Concluída de hoje recolhe para uma linha; o marcador "agora" corta a
/// linha antes da próxima reserva.
class ArenaBookingsDayTimelineSliver extends StatelessWidget {
  const ArenaBookingsDayTimelineSliver({
    super.key,
    required this.entries,
    required this.now,
  });

  final List<ArenaTimelineEntry> entries;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    return SliverList(
      delegate: SliverChildBuilderDelegate(
        (context, index) {
          final entry = entries[index];
          final isLast = index == entries.length - 1;
          return switch (entry) {
            ArenaTimelineNowEntry(:final now) => _NowMarker(now: now),
            ArenaTimelineFreeEntry(:final window) =>
              _FreeRow(window: window, isLast: isLast),
            ArenaTimelineCanceledEntry(:final booking, :final slotFreed) =>
              _CanceledRow(booking: booking, slotFreed: slotFreed),
            ArenaTimelineBookingEntry() => FadeSlideIn(
                // Entrada curta e sem cascata longa: trocar de dia não
                // pode esperar meio segundo pelo último card.
                delay: Duration(milliseconds: 20 * index.clamp(0, 5)),
                child: _BookingRow(entry: entry, now: now, isLast: isLast),
              ),
          };
        },
        childCount: entries.length,
      ),
    );
  }
}

class _BookingRow extends StatelessWidget {
  const _BookingRow({
    required this.entry,
    required this.now,
    required this.isLast,
  });

  final ArenaTimelineBookingEntry entry;
  final DateTime now;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final b = entry.booking;
    final live = entry.phase == ArenaTimelinePhase.live;
    final done = entry.phase == ArenaTimelinePhase.done;
    final collapsed = done && entry.isToday;

    final dotColor = live
        ? AppColors.brand
        : done
            ? colors.win
            : colors.canvas;
    final dotBorder = live
        ? AppColors.brand
        : done
            ? colors.win
            : colors.onSurfaceMuted;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: _railColumn,
            child: Column(
              children: [
                SizedBox(height: collapsed ? 14 : 18),
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: dotColor,
                    shape: BoxShape.circle,
                    border: Border.all(color: dotBorder, width: 2),
                  ),
                ),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 1.5,
                      color: colors.onSurfaceMuted.withValues(alpha: 0.2),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: collapsed
                  ? _DoneLine(booking: b)
                  : ArenaBookingSwipeActions(
                      booking: b,
                      enabled: entry.isToday && !done,
                      child: ArenaBookingCard(
                        booking: b,
                        now: now,
                        phase: entry.phase,
                        progress: entry.progress,
                        minutesLeft: entry.minutesLeft,
                        showActions: entry.isToday && !done,
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Horário livre no meio da linha: toque abre a agenda no dia; "Divulgar"
/// compartilha o horário com o link de reserva da arena.
class _FreeRow extends ConsumerWidget {
  const _FreeRow({required this.window, required this.isLast});

  final ArenaFreeWindow window;
  final bool isLast;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final day = ref.watch(arenaBookingsSelectedDayProvider);
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: _railColumn,
            child: Column(
              children: [
                const SizedBox(height: 18),
                Icon(
                  Icons.add_circle_outline_rounded,
                  size: 12,
                  color: colors.onSurfaceMuted,
                ),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 1.5,
                      color: colors.onSurfaceMuted.withValues(alpha: 0.2),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  key: Key('arena-bookings-free-${window.startTime}'),
                  borderRadius: BorderRadius.circular(12),
                  onTap: () {
                    openArenaScheduleOn(ref, day);
                    context.go(AppRoutes.arenaSchedule);
                  },
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(12, 4, 4, 4),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: colors.onSurfaceMuted.withValues(alpha: 0.35),
                      ),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text.rich(
                            TextSpan(
                              children: [
                                TextSpan(
                                  text: 'Livre ${window.rangeLabel}',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w800,
                                    color: colors.onSurface,
                                  ),
                                ),
                                TextSpan(text: ' · ${window.courtsLabel}'),
                              ],
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 12,
                              color: colors.onSurfaceMuted,
                            ),
                          ),
                        ),
                        TextButton.icon(
                          key: Key(
                            'arena-bookings-share-free-${window.startTime}',
                          ),
                          onPressed: () => _share(context, ref, day),
                          style: TextButton.styleFrom(
                            foregroundColor: colors.brandText,
                            textStyle: const TextStyle(
                              fontFamily: AppTypography.fontFamily,
                              fontWeight: FontWeight.w800,
                              fontSize: 12,
                            ),
                          ),
                          icon: const Icon(Icons.campaign_rounded, size: 18),
                          label: const Text('Divulgar'),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _share(BuildContext context, WidgetRef ref, DateTime day) {
    final arenaId = ref.read(managedArenaIdProvider).valueOrNull ?? '';
    final arenaName =
        ref.read(managedArenaDetailProvider).valueOrNull?.name ?? '';
    return nexaShareText(
      context,
      arenaFreeWindowShareText(
        window: window,
        dayLabel: arenaShareDayLabel(day, arenaTodayDateOnly()),
        arenaName: arenaName,
        arenaId: arenaId,
      ),
    );
  }
}

/// Cancelada no fim do dia: riscada e, se o horário ainda vai acontecer,
/// "Vaga liberada".
class _CanceledRow extends StatelessWidget {
  const _CanceledRow({required this.booking, required this.slotFreed});

  final ArenaManagerBooking booking;
  final bool slotFreed;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final struck = TextStyle(
      fontSize: 12,
      color: colors.onSurfaceMuted,
      decoration: TextDecoration.lineThrough,
      decorationColor: colors.onSurfaceMuted,
    );
    return Padding(
      padding: const EdgeInsets.only(left: _railColumn + 6, bottom: 8),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          key: Key('arena-booking-canceled-${booking.id}'),
          borderRadius: BorderRadius.circular(12),
          onTap: () => context.pushNamed(
            AppRouteNames.arenaBookingDetail,
            pathParameters: {'bookingId': booking.id},
            extra: booking,
          ),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: colors.onSurfaceMuted.withValues(alpha: 0.12),
              ),
            ),
            child: Row(
              children: [
                Icon(Icons.cancel_rounded, size: 15, color: colors.live),
                const SizedBox(width: 6),
                Text(
                  '${booking.startTime} ',
                  style: AppTypography.mono(
                    fontSize: 11,
                    color: colors.onSurfaceMuted,
                  ).copyWith(decoration: TextDecoration.lineThrough),
                ),
                Expanded(
                  child: Row(
                    children: [
                      Flexible(
                        flex: 3,
                        child:
                            ArenaNowBookingWho(booking: booking, style: struck),
                      ),
                      Flexible(
                        flex: 2,
                        child: Text(
                          ' · ${booking.courtName}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: struck,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  slotFreed ? 'Vaga liberada' : 'Cancelada',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: slotFreed ? colors.brandText : colors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Deslizar o card de hoje: para a direita faz o check-in, para a esquerda
/// abre o Receber. Cada lado só existe com a permissão e a ação valendo; o
/// card volta para o lugar depois (não some da lista).
class ArenaBookingSwipeActions extends ConsumerWidget {
  const ArenaBookingSwipeActions({
    super.key,
    required this.booking,
    required this.enabled,
    required this.child,
  });

  final ArenaManagerBooking booking;
  final bool enabled;
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!enabled || booking.isClassBlock || booking.isCanceled) return child;
    final canCheckIn = ref.watch(arenaCanWriteProvider(ArenaArea.agenda)) &&
        booking.athleteId.trim().isNotEmpty &&
        arenaBookingShowsCheckInAction(booking.data);
    final canReceive = ref.watch(arenaCanWriteProvider(ArenaArea.comandas)) &&
        arenaBookingDueReais(booking) != null;
    if (!canCheckIn && !canReceive) return child;

    final direction = canCheckIn && canReceive
        ? DismissDirection.horizontal
        : canCheckIn
            ? DismissDirection.startToEnd
            : DismissDirection.endToStart;

    return Dismissible(
      key: Key('arena-booking-swipe-${booking.id}'),
      direction: direction,
      dismissThresholds: const {
        DismissDirection.startToEnd: 0.35,
        DismissDirection.endToStart: 0.35,
      },
      confirmDismiss: (dir) async {
        HapticFeedback.mediumImpact();
        if (dir == DismissDirection.startToEnd) {
          await runArenaBookingCheckIn(context, ref, booking);
        } else {
          openArenaBookingReceive(context, ref, booking);
        }
        return false;
      },
      background: canCheckIn
          ? const _SwipeBackground(
              icon: Icons.how_to_reg_rounded,
              label: 'Check-in',
              alignLeft: true,
            )
          : const SizedBox.shrink(),
      secondaryBackground: canReceive
          ? const _SwipeBackground(
              icon: Icons.payments_rounded,
              label: 'Receber',
              alignLeft: false,
            )
          : null,
      child: child,
    );
  }
}

class _SwipeBackground extends StatelessWidget {
  const _SwipeBackground({
    required this.icon,
    required this.label,
    required this.alignLeft,
  });

  final IconData icon;
  final String label;
  final bool alignLeft;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final fill = alignLeft ? AppColors.brand : colors.surfaceRaised;
    final ink = alignLeft ? AppColors.black : colors.onSurface;
    return Container(
      decoration: BoxDecoration(
        color: fill,
        borderRadius: BorderRadius.circular(16),
      ),
      alignment: alignLeft ? Alignment.centerLeft : Alignment.centerRight,
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: ink),
          const SizedBox(width: 8),
          Text(
            label,
            style: TextStyle(fontWeight: FontWeight.w800, color: ink),
          ),
        ],
      ),
    );
  }
}

/// Reserva de hoje que já acabou, recolhida em uma linha.
class _DoneLine extends StatelessWidget {
  const _DoneLine({required this.booking});

  final ArenaManagerBooking booking;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final due = arenaBookingDueReais(booking);
    final payment = arenaBookingPaymentPill(booking);
    final checkedIn = booking.attendanceStatus == 'checked_in';
    final muted = TextStyle(fontSize: 12, color: colors.onSurfaceMuted);

    return Material(
      color: colors.surfaceCard,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        key: Key('arena-booking-done-${booking.id}'),
        borderRadius: BorderRadius.circular(12),
        onTap: () => booking.isClassBlock
            ? openArenaNowBooking(context, booking)
            : context.pushNamed(
                AppRouteNames.arenaBookingDetail,
                pathParameters: {'bookingId': booking.id},
                extra: booking,
              ),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: colors.onSurfaceMuted.withValues(alpha: 0.12),
            ),
          ),
          child: Row(
            children: [
              Icon(
                checkedIn ? Icons.check_circle_rounded : Icons.history_rounded,
                size: 15,
                color: checkedIn ? colors.win : colors.onSurfaceMuted,
              ),
              const SizedBox(width: 6),
              Text(
                '${booking.startTime} ',
                style: AppTypography.mono(
                  fontSize: 11,
                  color: colors.onSurfaceMuted,
                ),
              ),
              Expanded(
                child: Row(
                  children: [
                    Flexible(
                      flex: 3,
                      child: ArenaNowBookingWho(
                        booking: booking,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: colors.onSurface,
                        ),
                      ),
                    ),
                    Flexible(
                      flex: 2,
                      child: Text(
                        ' · ${booking.courtName}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: muted,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              if (due != null)
                Text(
                  'falta ${formatBRL(due)}',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: colors.pending,
                  ),
                )
              else if (payment != null)
                Text(payment.label, style: muted),
            ],
          ),
        ),
      ),
    );
  }
}

class _NowMarker extends StatelessWidget {
  const _NowMarker({required this.now});

  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final hh = now.hour.toString().padLeft(2, '0');
    final mm = now.minute.toString().padLeft(2, '0');
    return Semantics(
      label: 'Agora, $hh:$mm',
      excludeSemantics: true,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Row(
          children: [
            Container(
              key: const Key('arena-bookings-now-marker'),
              width: _nowPill,
              padding: const EdgeInsets.symmetric(vertical: 3),
              decoration: BoxDecoration(
                color: AppColors.brand,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                '$hh:$mm',
                textAlign: TextAlign.center,
                style: AppTypography.mono(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  color: AppColors.black,
                ),
              ),
            ),
            const SizedBox(width: 4),
            Container(
              width: 7,
              height: 7,
              decoration: const BoxDecoration(
                color: AppColors.brand,
                shape: BoxShape.circle,
              ),
            ),
            Expanded(child: Container(height: 1.5, color: AppColors.brand)),
          ],
        ),
      ),
    );
  }
}

/// Resumo do dia em uma faixa: ocupação, em quadra e a receber. O valor a
/// receber só aparece para quem lê o financeiro (mesma regra do Painel);
/// sem ele, a terceira casa mostra quantas reservas o dia tem.
class ArenaBookingsDayStats extends StatelessWidget {
  const ArenaBookingsDayStats({
    super.key,
    required this.summary,
    required this.seesMoney,
    this.isToday = true,
  });

  final ArenaBookingsDaySummary summary;
  final bool seesMoney;

  /// "Em quadra" só faz sentido hoje; nos outros dias a casa vira o número
  /// de reservas.
  final bool isToday;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final occupancy = summary.occupancyPercent;
    final cells = <(String, String, Color?)>[
      (occupancy == null ? '—' : '$occupancy%', 'ocupado', null),
      if (isToday)
        ('${summary.live}', 'em quadra', null)
      else
        (
          '${summary.bookings}',
          summary.bookings == 1 ? 'reserva' : 'reservas',
          null,
        ),
      if (seesMoney)
        (
          formatBRL(summary.dueReais),
          'a receber',
          summary.dueReais > 0 ? colors.pending : null,
        )
      else if (isToday)
        (
          '${summary.bookings}',
          summary.bookings == 1 ? 'reserva' : 'reservas',
          null,
        ),
    ];

    return Container(
      key: const Key('arena-bookings-day-stats'),
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
      ),
      child: IntrinsicHeight(
        child: Row(
          children: [
            for (var i = 0; i < cells.length; i++) ...[
              if (i > 0)
                VerticalDivider(
                  width: 1,
                  thickness: 1,
                  color: colors.onSurfaceMuted.withValues(alpha: 0.15),
                ),
              Expanded(
                child: Column(
                  children: [
                    Text(
                      cells[i].$1,
                      maxLines: 1,
                      style: AppTypography.mono(
                        fontSize: 15,
                        color: cells[i].$3 ?? colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      cells[i].$2,
                      style: TextStyle(
                        fontSize: 11,
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// "hoje", "amanhã" ou "quinta (20/11)" para o texto do "Divulgar".
String arenaShareDayLabel(DateTime day, DateTime today) {
  final d = arenaDateOnly(day);
  final t = arenaDateOnly(today);
  if (d == t) return 'hoje';
  if (d == DateTime(t.year, t.month, t.day + 1)) return 'amanhã';
  final weekday = DateFormat('EEEE', 'pt_BR').format(d).split('-').first;
  return '$weekday (${DateFormat('dd/MM').format(d)})';
}
