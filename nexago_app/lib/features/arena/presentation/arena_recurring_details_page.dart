import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../data/recurring_booking_service.dart';
import '../domain/arena_manager_booking.dart';
import '../domain/arena_recurring_booking.dart';
import '../domain/arena_recurring_providers.dart';
import 'widgets/arena_async_state.dart';
import 'widgets/arena_dashboard_tokens.dart';

/// Detalhe de um horário fixo: dados da série, próximas ocorrências e ações
/// (cancelar uma ocorrência ou encerrar a série).
class ArenaRecurringDetailsPage extends ConsumerWidget {
  const ArenaRecurringDetailsPage({super.key, required this.seriesId});

  final String seriesId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final seriesAsync = ref.watch(arenaRecurringSeriesProvider(seriesId));
    final series = seriesAsync.valueOrNull;
    final eyebrow = series != null
        ? '${series.weekdayLabel.toUpperCase()} · '
            '${series.courtName.toUpperCase()}'
        : 'AGENDA · HORÁRIO FIXO';

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _ArenaRecurringDetailsHeader(
              eyebrow: eyebrow,
              onBack: () => context.pop(),
            ),
            Expanded(
              child: seriesAsync.when(
                data: (loaded) {
                  if (loaded == null) {
                    return const ArenaEmptyState(
                      title: 'Horário fixo não encontrado',
                      message: 'Este horário fixo não existe mais.',
                      icon: Icons.event_busy_outlined,
                    );
                  }
                  return _SeriesDetails(series: loaded);
                },
                loading: () =>
                    const ArenaLoadingState(label: 'Carregando...'),
                error: (e, _) => ArenaErrorState(message: '$e'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ArenaRecurringDetailsHeader extends StatelessWidget {
  const _ArenaRecurringDetailsHeader({
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
                  'Horário fixo',
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

class _SeriesDetails extends ConsumerWidget {
  const _SeriesDetails({required this.series});

  final ArenaRecurringBooking series;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final occurrencesAsync =
        ref.watch(arenaRecurringOccurrencesProvider(series.id));

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      children: [
        FadeSlideIn(
          child: _SeriesHeroCard(series: series),
        ),
        const SizedBox(height: 24),
        FadeSlideIn(
          child: DecoratedBox(
            decoration: ArenaDashboardTokens.cardDecoration(context),
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _LabeledRow(
                    label: 'Mensalista',
                    value: series.customerName ?? '—',
                  ),
                  SizedBox(height: 12),
                  _LabeledRow(
                    label: 'Começou em',
                    value: _formatDateKey(series.startDate),
                  ),
                  if (series.endDate != null) ...[
                    SizedBox(height: 12),
                    _LabeledRow(
                      label: 'Termina em',
                      value: _formatDateKey(series.endDate!),
                    ),
                  ],
                  if (series.skippedDates.isNotEmpty) ...[
                    SizedBox(height: 12),
                    _LabeledRow(
                      label: 'Datas fora da série (conflito ou canceladas)',
                      value: series.skippedDates
                          .map(_formatDateKey)
                          .join(', '),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
        SizedBox(height: 28),
        Text(
          'PRÓXIMAS RESERVAS',
          style: theme.textTheme.labelSmall?.copyWith(
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.6,
          ),
        ),
        SizedBox(height: 12),
        occurrencesAsync.when(
          data: (occurrences) {
            final visible = occurrences
                .where((o) => _statusOf(o) != 'cancelled')
                .toList();
            if (visible.isEmpty) {
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  'Nenhuma reserva futura desta série.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              );
            }
            return Column(
              children: [
                for (final occurrence in visible)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _OccurrenceTile(
                      occurrence: occurrence,
                      canCancel: series.isActive,
                    ),
                  ),
              ],
            );
          },
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
          ),
          error: (e, _) => ArenaErrorState(message: '$e'),
        ),
        if (!series.isCanceled) ...[
          SizedBox(height: 24),
          OutlinedButton.icon(
            onPressed: () => _confirmCancelSeries(context, ref),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.live,
              side: BorderSide(color: AppColors.live.withValues(alpha: 0.5)),
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            icon: Icon(Icons.event_busy_rounded),
            label: Text(
              'Encerrar horário fixo',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
          SizedBox(height: 8),
          Text(
            'As reservas futuras são canceladas e os horários voltam a ficar '
            'disponíveis. As reservas passadas são preservadas.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall?.copyWith(
              color: context.themeColors.onSurfaceMuted,
              height: 1.4,
            ),
          ),
        ],
      ],
    );
  }

  Future<void> _confirmCancelSeries(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: ctx.themeColors.surfaceSheet,
        title: Text('Encerrar horário fixo?'),
        content: Text(
          'Toda ${series.weekdayLabel.toLowerCase()}, '
          '${series.startTime} – ${series.endTime} · ${series.courtName}.\n\n'
          'As reservas futuras desta série serão canceladas e os horários '
          'ficarão disponíveis para outros atletas.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Voltar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.live),
            child: Text('Encerrar'),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    try {
      await ref.read(recurringBookingServiceProvider).cancelSeries(series.id);
      if (!context.mounted) return;
      showAppSnackBar(context, 'Horário fixo encerrado.');
    } on RecurringBookingException catch (e) {
      if (!context.mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    }
  }

  static String _statusOf(ArenaManagerBooking b) {
    return (b.data['status'] as String?)?.trim().toLowerCase() ?? '';
  }

  static String _formatDateKey(String key) {
    final parts = key.split('-');
    if (parts.length != 3) return key;
    return '${parts[2]}/${parts[1]}/${parts[0]}';
  }
}

class _SeriesHeroCard extends StatelessWidget {
  const _SeriesHeroCard({required this.series});

  final ArenaRecurringBooking series;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final Color statusColor;
    final String statusLabel;
    if (series.isActive) {
      statusColor = AppColors.win;
      statusLabel = 'ATIVO';
    } else if (series.isPaused) {
      // Mesmo tom de âmbar do badge "PAUSADO" na lista de horários fixos
      // (`arena_recurring_list_page.dart`), pra consistência visual.
      statusColor = const Color(0xFFF4C543);
      statusLabel = 'PAUSADO';
    } else {
      statusColor = context.themeColors.onSurfaceMuted;
      statusLabel = 'ENCERRADO';
    }

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
                    statusColor.withValues(alpha: 0.2),
                    statusColor.withValues(alpha: 0),
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
                        'TODA ${series.weekdayLabel.toUpperCase()}',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: context.themeColors.onSurfaceMuted,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                    _StatusPill(label: statusLabel, color: statusColor),
                  ],
                ),
                const SizedBox(height: 20),
                _LargeTimeRange(
                  start: series.startTime,
                  end: series.endTime,
                ),
                const SizedBox(height: 12),
                Text(
                  '${formatBRL(series.amountReais)} por semana',
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _LargeTimeRange extends StatelessWidget {
  const _LargeTimeRange({required this.start, required this.end});

  final String start;
  final String end;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final sp = start.split(':');
    final ep = end.split(':');
    final startH = sp.first.padLeft(2, '0');
    final startM = sp.length > 1 ? sp[1].padLeft(2, '0') : '00';
    final endH = ep.first.padLeft(2, '0');
    final endM = ep.length > 1 ? ep[1].padLeft(2, '0') : '00';

    TextStyle hourStyle() => theme.textTheme.displaySmall!.copyWith(
          fontWeight: FontWeight.w800,
          height: 1,
          color: context.themeColors.onSurface,
          letterSpacing: -0.5,
        );

    TextStyle minuteStyle() => theme.textTheme.headlineMedium!.copyWith(
          fontWeight: FontWeight.w800,
          color: context.themeColors.onSurfaceMuted,
          height: 1,
        );

    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(startH, style: hourStyle()),
        Text(':$startM', style: minuteStyle()),
        Padding(
          padding: const EdgeInsets.fromLTRB(10, 0, 10, 6),
          child: Text(
            '–',
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w700,
              color: context.themeColors.onSurfaceMuted,
            ),
          ),
        ),
        Text(endH, style: hourStyle()),
        Text(':$endM', style: minuteStyle()),
      ],
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label, required this.color});

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

class _OccurrenceTile extends ConsumerWidget {
  const _OccurrenceTile({required this.occurrence, required this.canCancel});

  final ArenaManagerBooking occurrence;
  final bool canCancel;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final date = _parseDateKey(occurrence.dateKey);
    final label = date != null
        ? DateFormat('EEE, dd/MM', 'pt_BR').format(date)
        : occurrence.dateKey;

    return DecoratedBox(
      decoration: ArenaDashboardTokens.cardDecoration(context),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Icon(
              Icons.event_rounded,
              size: 18,
              color: context.themeColors.onSurfaceMuted,
            ),
            SizedBox(width: 12),
            Expanded(
              child: Text(
                '$label · ${occurrence.startTime} – ${occurrence.endTime}',
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: context.themeColors.onSurface,
                ),
              ),
            ),
            if (canCancel)
              IconButton(
                tooltip: 'Cancelar esta reserva',
                icon: Icon(
                  Icons.close_rounded,
                  size: 20,
                  color: context.themeColors.onSurfaceMuted,
                ),
                onPressed: () => _confirmCancelOccurrence(context, ref, label),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _confirmCancelOccurrence(
    BuildContext context,
    WidgetRef ref,
    String label,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: ctx.themeColors.surfaceSheet,
        title: Text('Cancelar só esta reserva?'),
        content: Text(
          '$label · ${occurrence.startTime} – ${occurrence.endTime}.\n\n'
          'O horário fixo continua nas demais semanas; apenas esta data é '
          'cancelada e o horário volta a ficar disponível.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Voltar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.live),
            child: Text('Cancelar reserva'),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    try {
      await ref
          .read(recurringBookingServiceProvider)
          .cancelOccurrence(occurrence.id);
      if (!context.mounted) return;
      showAppSnackBar(context, 'Reserva de $label cancelada.');
    } on RecurringBookingException catch (e) {
      if (!context.mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    }
  }

  static DateTime? _parseDateKey(String key) {
    final parts = key.split('-');
    if (parts.length != 3) return null;
    final y = int.tryParse(parts[0]);
    final m = int.tryParse(parts[1]);
    final d = int.tryParse(parts[2]);
    if (y == null || m == null || d == null) return null;
    return DateTime(y, m, d);
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
