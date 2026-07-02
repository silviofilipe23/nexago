import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import '../../../core/formatting/app_currency_format.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../../arenas/domain/arena_slot.dart';
import '../../arenas/domain/arena_slot_block_reason.dart';
import '../data/slot_service.dart';
import '../domain/arena_booking_labels.dart';
import '../domain/arena_bookings_providers.dart';
import '../domain/arena_recurring_form_args.dart';
import '../domain/arena_slot_detail_args.dart';
import '../domain/arena_slot_detail_providers.dart';
import '../domain/arena_schedule_providers.dart';
import '../domain/arena_slot_weekday_history.dart';
import 'widgets/arena_async_state.dart';
import 'widgets/arena_dashboard_tokens.dart';
import 'widgets/arena_schedule_block_sheet.dart';

/// Detalhe de um horário da agenda do gestor.
class ArenaSlotDetailPage extends ConsumerWidget {
  const ArenaSlotDetailPage({
    super.key,
    required this.args,
  });

  final ArenaSlotDetailArgs args;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final initial = args.slot;
    final liveAsync = ref.watch(arenaSlotLiveProvider(initial.id));

    final ArenaSlot slot = liveAsync.maybeWhen(
      data: (s) => s ?? initial,
      orElse: () => initial,
    );

    final bookingsAsync = ref.watch(arenaManagerBookingsStreamProvider);
    final history = bookingsAsync.maybeWhen(
      data: (bookings) => ArenaSlotWeekdayHistoryBuilder.build(
        bookings: bookings,
        courtId: slot.courtId,
        startTime: slot.startTime,
        slotDate: slot.date,
      ),
      orElse: () => null,
    );

    final eyebrow = DateFormat('EEE, d \'de\' MMMM', 'pt_BR')
        .format(slot.date)
        .toUpperCase()
        .replaceAll('.', '');

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _ArenaSlotDetailHeader(
              eyebrow: '$eyebrow · ${args.courtName.toUpperCase()}',
              onBack: () => context.pop(),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
                children: [
                  _SlotHeroCard(slot: slot),
                  if (liveAsync.hasError) ...[
                    const SizedBox(height: 12),
                    const ArenaErrorState(
                      message: 'Não foi possível sincronizar este horário agora.',
                    ),
                  ],
                  const SizedBox(height: 28),
                  FadeSlideIn(
                    child: _QuickActionsGrid(
                      slot: slot,
                      courtName: args.courtName,
                    ),
                  ),
                  if (history != null && history.hasEnoughData) ...[
                    const SizedBox(height: 28),
                    FadeSlideIn(
                      child: _WeekdayHistoryCard(
                        history: history,
                        weekdayLabel: DateFormat('EEEE', 'pt_BR').format(slot.date),
                      ),
                    ),
                  ],
                  const SizedBox(height: 28),
                  FadeSlideIn(
                    child: slot.isBooked
                        ? _BookedDetails(slot: slot)
                        : slot.isBlocked
                            ? _BlockedDetails(slot: slot)
                            : const SizedBox.shrink(),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ArenaSlotDetailHeader extends StatelessWidget {
  const _ArenaSlotDetailHeader({
    required this.eyebrow,
    required this.onBack,
  });

  final String eyebrow;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
      child: Row(
        children: [
          _HeaderIconButton(
            icon: Icons.arrow_back_rounded,
            onTap: onBack,
          ),
          Expanded(
            child: Column(
              children: [
                Text(
                  eyebrow,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.mono(
                    color: AppColors.brand,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.8,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Horário',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: context.themeColors.onSurface,
                      ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 44),
        ],
      ),
    );
  }
}

class _HeaderIconButton extends StatelessWidget {
  const _HeaderIconButton({
    required this.icon,
    required this.onTap,
  });

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: SizedBox(
          width: 44,
          height: 44,
          child: Icon(icon, color: context.themeColors.onSurface),
        ),
      ),
    );
  }
}

class _SlotHeroCard extends StatelessWidget {
  const _SlotHeroCard({required this.slot});

  final ArenaSlot slot;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = _slotStatus(slot);

    return ClipRRect(
      borderRadius: BorderRadius.circular(22),
      child: Stack(
        clipBehavior: Clip.hardEdge,
        children: [
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: context.themeColors.surfaceCard,
                border: Border.all(
                  color: context.themeColors.onSurfaceMuted.withValues(
                    alpha: 0.12,
                  ),
                ),
              ),
            ),
          ),
          Positioned(
            top: -48,
            right: -36,
            child: Container(
              width: 160,
              height: 160,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    status.color.withValues(alpha: 0.2),
                    status.color.withValues(alpha: 0),
                  ],
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        'SLOT DA AGENDA',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: context.themeColors.onSurfaceMuted,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                    _SlotStatusPill(label: status.label, color: status.color),
                  ],
                ),
                const SizedBox(height: 20),
                _LargeTimeDisplay(
                  startTime: slot.startTime,
                  endTime: slot.endTime,
                ),
                if (status.priceLabel != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    status.priceLabel!,
                    style: theme.textTheme.bodyLarge?.copyWith(
                      color: context.themeColors.onSurfaceMuted,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  static ({String label, Color color, String? priceLabel}) _slotStatus(
    ArenaSlot slot,
  ) {
    final price = slot.priceReais;
    final priceStr = price != null ? formatBRL(price) : null;

    if (slot.isBooked) {
      return (
        label: 'RESERVADO',
        color: AppColors.live,
        priceLabel: priceStr != null ? 'preço · $priceStr' : null,
      );
    }
    if (slot.isBlocked) {
      final blockLabel = slot.blockReason == ArenaSlotBlockReason.aula
          ? 'AULA'
          : 'BLOQUEADO';
      return (
        label: blockLabel,
        color: AppColors.onSurfaceMuted,
        priceLabel: priceStr != null ? 'preço · $priceStr' : null,
      );
    }
    return (
      label: 'DISPONÍVEL',
      color: AppColors.win,
      priceLabel: priceStr != null ? 'preço · $priceStr' : null,
    );
  }
}

class _SlotStatusPill extends StatelessWidget {
  const _SlotStatusPill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontWeight: FontWeight.w800,
              fontSize: 11,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }
}

class _LargeTimeDisplay extends StatelessWidget {
  const _LargeTimeDisplay({
    required this.startTime,
    required this.endTime,
  });

  final String startTime;
  final String endTime;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final startParts = startTime.split(':');
    final endParts = endTime.split(':');

    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        _TimePart(hour: startParts.first, theme: theme),
        Text(
          ':${startParts.length > 1 ? startParts[1] : '00'}',
          style: theme.textTheme.headlineMedium?.copyWith(
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurfaceMuted,
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Text(
            '—',
            style: theme.textTheme.titleLarge?.copyWith(
              color: context.themeColors.onSurfaceMuted,
            ),
          ),
        ),
        _TimePart(hour: endParts.first, theme: theme),
        Text(
          ':${endParts.length > 1 ? endParts[1] : '00'}',
          style: theme.textTheme.headlineMedium?.copyWith(
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurfaceMuted,
          ),
        ),
      ],
    );
  }
}

class _TimePart extends StatelessWidget {
  const _TimePart({required this.hour, required this.theme});

  final String hour;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    return Text(
      hour.padLeft(2, '0'),
      style: theme.textTheme.displayMedium?.copyWith(
        fontWeight: FontWeight.w800,
        color: context.themeColors.onSurface,
        height: 1,
        letterSpacing: -2,
      ),
    );
  }
}

class _QuickActionsGrid extends ConsumerWidget {
  const _QuickActionsGrid({
    required this.slot,
    required this.courtName,
  });

  final ArenaSlot slot;
  final String courtName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'AÇÕES RÁPIDAS',
          style: theme.textTheme.labelSmall?.copyWith(
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.6,
          ),
        ),
        SizedBox(height: 12),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1.55,
          children: [
            _ActionCard(
              icon: Icons.person_add_outlined,
              title: 'Criar reserva',
              subtitle: 'walk-in ou nome',
              onTap: () => showAppSnackBar(context, 'Criar reserva em breve.'),
            ),
            _ActionCard(
              icon: Icons.block_outlined,
              title: 'Bloquear',
              subtitle: 'manutenção, evento',
              enabled: slot.isAvailable,
              onTap: () async {
                final ok = await ArenaScheduleBlockSheet.show(
                  context,
                  slot: slot,
                  courtName: courtName,
                );
                if (ok && context.mounted) {
                  showAppSnackBar(context, 'Horário bloqueado.');
                  context.pop();
                }
              },
            ),
            _ActionCard(
              icon: Icons.local_offer_outlined,
              title: 'Ajustar preço',
              subtitle: 'promo flash',
              onTap: () => showAppSnackBar(context, 'Ajustar preço em breve.'),
            ),
            _ActionCard(
              icon: Icons.repeat_rounded,
              title: 'Horário fixo',
              subtitle: 'todo ${DateFormat('EEEE', 'pt_BR').format(slot.date)}',
              enabled: slot.isAvailable,
              onTap: () => context.pushNamed(
                AppRouteNames.arenaRecurringNew,
                extra: ArenaRecurringFormArgs(
                  courtId: slot.courtId,
                  weekday: slot.date.weekday,
                  startTime: slot.startTime,
                  endTime: slot.endTime,
                  priceReais: slot.priceReais,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _ActionCard extends StatelessWidget {
  const _ActionCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.enabled = true,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(ArenaDashboardTokens.cardRadius),
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(ArenaDashboardTokens.cardRadius),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                icon,
                color: enabled ? AppColors.brand : context.themeColors.onSurfaceMuted,
                size: 22,
              ),
              Spacer(),
              Text(
                title,
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: enabled
                      ? context.themeColors.onSurface
                      : context.themeColors.onSurfaceMuted,
                ),
              ),
              Text(
                subtitle,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _WeekdayHistoryCard extends StatelessWidget {
  const _WeekdayHistoryCard({
    required this.history,
    required this.weekdayLabel,
  });

  final ArenaSlotWeekdayHistory history;
  final String weekdayLabel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DecoratedBox(
      decoration: ArenaDashboardTokens.cardDecoration(context),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Esse slot nos últimos $weekdayLabel',
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
              ),
            ),
            SizedBox(height: 8),
            Text(
              '${history.filledCount}/${history.sampleSize}',
              style: theme.textTheme.headlineMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: AppColors.brand,
              ),
            ),
            SizedBox(height: 12),
            Row(
              children: [
                for (var i = 0; i < history.dateLabels.length; i++)
                  Expanded(
                    child: Column(
                      children: [
                        Container(
                          height: 36,
                          margin: const EdgeInsets.symmetric(horizontal: 2),
                          decoration: BoxDecoration(
                            color: history.filledFlags[i]
                                ? AppColors.brand.withValues(alpha: 0.35)
                                : context.themeColors.surfaceRaised,
                            borderRadius: BorderRadius.circular(6),
                          ),
                        ),
                        SizedBox(height: 4),
                        Text(
                          history.dateLabels[i],
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: context.themeColors.onSurfaceMuted,
                            fontSize: 10,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
            SizedBox(height: 12),
            Text(
              '${history.occupancyPercent.toStringAsFixed(0)}% de ocupação nos últimos '
              '${history.sampleSize} ${weekdayLabel}s nesse horário. '
              'Vale ativar promoção pra encher hoje.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: context.themeColors.onSurfaceMuted,
                height: 1.4,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BookedDetails extends ConsumerWidget {
  const _BookedDetails({required this.slot});

  final ArenaSlot slot;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bookingId = slot.bookingId;
    final bookingAsync = bookingId != null
        ? ref.watch(arenaBookingDetailMapProvider(bookingId))
        : const AsyncValue<Map<String, dynamic>?>.data(null);

    final athleteUid = slot.bookingAthleteId ??
        bookingAsync.valueOrNull?['athleteId'] as String?;
    final customerName =
        (bookingAsync.valueOrNull?['customerName'] as String?)?.trim();
    final nameAsync = athleteUid != null && athleteUid.trim().isNotEmpty
        ? ref.watch(athleteDisplayLabelProvider(athleteUid))
        : AsyncValue<String>.data(
            customerName?.isNotEmpty == true ? customerName! : '—',
          );

    return DecoratedBox(
      decoration: ArenaDashboardTokens.cardDecoration(context),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _LabeledRow(
              label: 'Atleta',
              value: nameAsync.when(
                data: (s) => s,
                loading: () => 'Carregando…',
                error: (_, __) => '—',
              ),
            ),
            SizedBox(height: 12),
            _LabeledRow(
              label: 'Pagamento',
              value: arenaBookingPaymentLabel(bookingAsync.valueOrNull),
            ),
            SizedBox(height: 12),
            _LabeledRow(
              label: 'Status',
              value: arenaBookingStatusLabel(bookingAsync.valueOrNull),
            ),
          ],
        ),
      ),
    );
  }
}

class _BlockedDetails extends ConsumerStatefulWidget {
  const _BlockedDetails({required this.slot});

  final ArenaSlot slot;

  @override
  ConsumerState<_BlockedDetails> createState() => _BlockedDetailsState();
}

class _BlockedDetailsState extends ConsumerState<_BlockedDetails> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final reason = widget.slot.blockReason?.displayLabel;
    final note = widget.slot.blockNote?.trim();

    return DecoratedBox(
      decoration: ArenaDashboardTokens.cardDecoration(context),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (reason != null)
              _LabeledRow(label: 'Motivo', value: reason),
            if (note != null && note.isNotEmpty) ...[
              SizedBox(height: 12),
              _LabeledRow(label: 'Nota', value: note),
            ],
            SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: _busy || widget.slot.isVirtual
                  ? null
                  : () => _unblock(context),
              icon: _busy
                  ? SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Icon(Icons.lock_open_outlined),
              label: Text('Desbloquear'),
            ),
            if (widget.slot.isVirtual)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(
                  'Este horário ainda não está salvo no Firestore.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _unblock(BuildContext context) async {
    setState(() => _busy = true);
    try {
      await ref.read(slotServiceProvider).unblockSlot(widget.slot.id);
      if (!context.mounted) return;
      showAppSnackBar(context, 'Horário desbloqueado.');
      context.pop();
    } on SlotServiceException catch (e) {
      if (!context.mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } catch (e) {
      if (!context.mounted) return;
      showAppSnackBar(context, 'Não foi possível desbloquear: $e', isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _LabeledRow extends StatelessWidget {
  const _LabeledRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.labelMedium?.copyWith(
                color: context.themeColors.onSurfaceMuted,
                fontWeight: FontWeight.w600,
              ),
        ),
        SizedBox(height: 4),
        Text(
          value,
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                fontWeight: FontWeight.w500,
                color: context.themeColors.onSurface,
              ),
        ),
      ],
    );
  }
}
