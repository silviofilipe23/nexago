import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/arena_access_providers.dart';
import '../../domain/arena_bookings_day_providers.dart';
import '../../domain/arena_bookings_tasks.dart';
import '../../domain/arena_date_utils.dart';
import '../../domain/arena_manager_booking.dart';
import '../../domain/arena_staff_role.dart';
import 'arena_athlete_contact.dart';
import 'arena_booking_card_actions.dart';
import 'arena_now_booking_label.dart';

/// Faixa "Precisa de você" (modelo B) no topo da linha de hoje: check-in
/// atrasado, saldo a cobrar e horário cancelado com lista de espera, cada um
/// com a ação ao lado. Só aparece quando há pendência.
class ArenaBookingsTasksStrip extends ConsumerWidget {
  const ArenaBookingsTasksStrip({super.key, required this.tasks});

  final List<ArenaBookingTask> tasks;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (tasks.isEmpty) return const SizedBox.shrink();
    final colors = context.themeColors;

    return Container(
      key: const Key('arena-bookings-tasks'),
      decoration: BoxDecoration(
        color: Color.alphaBlend(
          AppColors.pending.withValues(alpha: 0.06),
          colors.surfaceCard,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.pending.withValues(alpha: 0.30)),
      ),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(
                'Precisa de você',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color: colors.onSurface,
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(
                  color: AppColors.pending.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  '${tasks.length}',
                  style: AppTypography.mono(
                    fontSize: 12,
                    color: colors.pending,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          for (var i = 0; i < tasks.length; i++) ...[
            if (i > 0)
              Divider(
                height: 1,
                color: colors.onSurfaceMuted.withValues(alpha: 0.12),
              ),
            _TaskRow(task: tasks[i]),
          ],
        ],
      ),
    );
  }
}

class _TaskRow extends ConsumerWidget {
  const _TaskRow({required this.task});

  final ArenaBookingTask task;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final b = task.booking;
    final canAgenda = ref.watch(arenaCanWriteProvider(ArenaArea.agenda));
    final canComandas = ref.watch(arenaCanWriteProvider(ArenaArea.comandas));
    final muted = TextStyle(fontSize: 12, color: colors.onSurfaceMuted);

    final (icon, tone, title, actions) = switch (task) {
      ArenaLateCheckInTask(:final minutesLate) => (
          Icons.schedule_rounded,
          colors.live,
          'Check-in atrasado · $minutesLate min',
          <Widget>[
            if (canAgenda)
              _Action(
                key: Key('arena-task-checkin-${b.id}'),
                label: 'Check-in',
                primary: true,
                onPressed: () => runArenaBookingCheckIn(context, ref, b),
              ),
            _Action(
              label: 'Conversar',
              onPressed: () => contactArenaAthlete(context, ref, b.athleteId),
            ),
          ],
        ),
      ArenaDueBalanceTask(:final dueReais) => (
          Icons.payments_rounded,
          colors.pending,
          'Falta receber ${formatBRL(dueReais)}',
          <Widget>[
            if (canComandas)
              _Action(
                key: Key('arena-task-receive-${b.id}'),
                label: 'Receber',
                primary: true,
                onPressed: () => openArenaBookingReceive(context, ref, b),
              ),
          ],
        ),
      ArenaCanceledWithWaitlistTask(:final waiting) => (
          Icons.notifications_active_rounded,
          colors.brandText,
          '${b.startTime} cancelado · '
              '$waiting na lista de espera',
          <Widget>[
            _Action(
              label: 'Ver na agenda',
              onPressed: () {
                openArenaScheduleOn(ref, arenaTodayDateOnly());
                context.go(AppRoutes.arenaSchedule);
              },
            ),
          ],
        ),
    };
    final note = switch (task) {
      ArenaCanceledWithWaitlistTask(:final notified) => notified
          ? 'O primeiro da fila já foi avisado.'
          : 'A fila é avisada sozinha quando a vaga abre.',
      _ => null,
    };

    return InkWell(
      onTap: () => _open(context, b),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: tone.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, size: 17, color: tone),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Flexible(
                        child: ArenaNowBookingWho(booking: b, style: muted),
                      ),
                      Flexible(
                        child: Text(
                          ' · ${b.startTime} · ${b.courtName}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: muted,
                        ),
                      ),
                    ],
                  ),
                  if (note != null) Text(note, style: muted),
                  if (actions.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Wrap(spacing: 8, runSpacing: 8, children: actions),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _open(BuildContext context, ArenaManagerBooking b) {
    context.pushNamed(
      AppRouteNames.arenaBookingDetail,
      pathParameters: {'bookingId': b.id},
      extra: b,
    );
  }
}

class _Action extends StatelessWidget {
  const _Action({
    super.key,
    required this.label,
    required this.onPressed,
    this.primary = false,
  });

  final String label;
  final VoidCallback onPressed;
  final bool primary;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return FilledButton(
      onPressed: onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: primary ? AppColors.brand : colors.surfaceRaised,
        foregroundColor: primary ? AppColors.black : colors.onSurface,
        minimumSize: const Size(0, 40),
        padding: const EdgeInsets.symmetric(horizontal: 14),
        textStyle: const TextStyle(
          fontFamily: AppTypography.fontFamily,
          fontSize: 13,
          fontWeight: FontWeight.w700,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
      child: Text(label),
    );
  }
}
