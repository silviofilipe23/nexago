import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/formatting/app_currency_format.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../domain/arena_detail_agenda_logic.dart';
import '../../../domain/slots_page_logic.dart';
import '../../../domain/slots_page_providers.dart';
import '../slots/slots_choice_chips.dart';
import '../slots/slots_day_strip.dart';
import 'arena_detail_info_sections.dart';

/// "Horários" no perfil da arena: dia, esporte, duração e os horários livres
/// por período, juntando as quadras. Tocar num horário o escolhe (a barra de
/// baixo passa a reservá-lo); tocar de novo desfaz.
class ArenaDetailAgendaSection extends StatelessWidget {
  const ArenaDetailAgendaSection({
    super.key,
    required this.view,
    required this.stripStart,
    required this.stripDays,
    required this.selectedDay,
    required this.calendar,
    required this.selectedStart,
    required this.onDaySelected,
    required this.onSportSelected,
    required this.onDurationSelected,
    required this.onTimeTapped,
    required this.onOpenFullGrid,
    this.nextOpenDay,
    this.notifyActive = false,
    this.notifyLoading = false,
    this.onNotifyToggle,
    this.horizontalPadding = 20,
  });

  /// `null` enquanto os horários carregam.
  final AgendaView? view;
  final DateTime stripStart;
  final int stripDays;
  final DateTime selectedDay;

  /// Bolinha de cada dia da faixa; `null` sem dados ainda.
  final List<SlotsCalendarDayStatus>? calendar;
  final String? selectedStart;
  final ValueChanged<DateTime> onDaySelected;
  final ValueChanged<String?> onSportSelected;
  final ValueChanged<int> onDurationSelected;
  final ValueChanged<AgendaTime> onTimeTapped;
  final VoidCallback onOpenFullGrid;

  /// Próximo dia com vaga (dia lotado ou sem horário).
  final DateTime? nextOpenDay;
  final bool notifyActive;
  final bool notifyLoading;

  /// `null` esconde o "Avise-me" (dia sem horário, por exemplo).
  final VoidCallback? onNotifyToggle;
  final double horizontalPadding;

  static bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final view = this.view;
    final side = EdgeInsets.symmetric(horizontal: horizontalPadding);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: side,
          child: Row(
            children: [
              const Expanded(child: ArenaDetailSectionTitle('Horários')),
              TextButton(
                onPressed: onOpenFullGrid,
                style: TextButton.styleFrom(
                  foregroundColor: colors.brandText,
                  padding: EdgeInsets.zero,
                  minimumSize: const Size(0, 36),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: const Text(
                  'Ver grade completa',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
            ],
          ),
        ),
        if (view?.isCapacity ?? false)
          Padding(
            padding: side.copyWith(top: 2),
            child: Text(
              'Você reserva o horário; a arena define a quadra.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: colors.onSurfaceMuted,
                  ),
            ),
          ),
        const SizedBox(height: 10),
        SlotsDayStrip(
          startDay: stripStart,
          selectedDay: selectedDay,
          daysCount: stripDays,
          calendarDays: calendar,
          onSelect: onDaySelected,
          sameDay: _sameDay,
          dateOnly: slotDayOnly,
          horizontalPadding: horizontalPadding,
        ),
        if (view != null && view.sportOptions.isNotEmpty) ...[
          const SizedBox(height: 8),
          SlotsChoiceChipsRow<String?>(
            scrollKey: const Key('arena-agenda-sports'),
            padding: side,
            options: [
              for (final o in view.sportOptions)
                SlotsChoiceOption(value: o.value, label: o.label),
            ],
            selected: view.sport,
            onSelected: onSportSelected,
          ),
        ],
        if (view != null && view.durations.length > 1) ...[
          const SizedBox(height: 8),
          Padding(
            padding: side,
            child: SlotsDurationChips(
              durations: view.durations,
              selectedMinutes: view.durationMinutes,
              onSelected: onDurationSelected,
            ),
          ),
        ],
        const SizedBox(height: 14),
        Padding(padding: side, child: _body(context, view)),
      ],
    );
  }

  Widget _body(BuildContext context, AgendaView? view) {
    if (view == null) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Center(
          child: CircularProgressIndicator(
            color: AppColors.brand,
            strokeWidth: 2,
          ),
        ),
      );
    }
    final next = nextOpenDay;
    final goNext = next == null ? null : () => onDaySelected(next);
    switch (view.dayState) {
      case AgendaDayState.noSchedule:
        return _DayNotice(
          icon: Icons.event_busy_outlined,
          title: 'Sem horários neste dia',
          subtitle: 'A arena não abriu horários para reserva neste dia.',
          nextDay: next,
          onNextDay: goNext,
        );
      case AgendaDayState.full:
        return _DayNotice(
          icon: Icons.hourglass_empty_rounded,
          title: 'Este dia lotou',
          subtitle: 'Se alguém cancelar, avisamos você por notificação.',
          nextDay: next,
          onNextDay: goNext,
          notifyActive: notifyActive,
          notifyLoading: notifyLoading,
          onNotifyToggle: onNotifyToggle,
        );
      case AgendaDayState.open:
        return _PeriodsGrid(
          periods: view.periods,
          selectedStart: selectedStart,
          onTimeTapped: onTimeTapped,
        );
    }
  }
}

class _PeriodsGrid extends StatelessWidget {
  const _PeriodsGrid({
    required this.periods,
    required this.selectedStart,
    required this.onTimeTapped,
  });

  static const int columns = 4;
  static const double gap = 8;

  final Map<SlotPeriodFilter, List<AgendaTime>> periods;
  final String? selectedStart;
  final ValueChanged<AgendaTime> onTimeTapped;

  static String _periodLabel(SlotPeriodFilter period) => switch (period) {
        SlotPeriodFilter.morning => 'MANHÃ',
        SlotPeriodFilter.afternoon => 'TARDE',
        SlotPeriodFilter.evening => 'NOITE',
        SlotPeriodFilter.all => 'HORÁRIOS',
      };

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = (constraints.maxWidth - gap * (columns - 1)) / columns;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final (i, entry) in periods.entries.indexed) ...[
              if (i > 0) const SizedBox(height: 16),
              Text(
                '${_periodLabel(entry.key)} · '
                '${_freeLabel(entry.value.where((t) => !t.isFull).length)}',
                style: AppTypography.mono(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1,
                  color: colors.onSurfaceMuted,
                ),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: gap,
                runSpacing: gap,
                children: [
                  for (final t in entry.value)
                    SizedBox(
                      width: width,
                      child: _TimeChip(
                        time: t,
                        selected: !t.isFull && t.startTime == selectedStart,
                        onTap: t.isFull ? null : () => onTimeTapped(t),
                      ),
                    ),
                ],
              ),
            ],
          ],
        );
      },
    );
  }

  static String _freeLabel(int n) => switch (n) {
        0 => 'LOTADO',
        1 => '1 LIVRE',
        _ => '$n LIVRES',
      };
}

class _TimeChip extends StatelessWidget {
  const _TimeChip({
    required this.time,
    required this.selected,
    required this.onTap,
  });

  final AgendaTime time;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final price = time.priceReais;
    final subtitle = time.isFull
        ? 'lotado'
        : (price == null ? 'livre' : formatBRLWhole(price));
    final semantics = '${time.startTime}, $subtitle';

    return Semantics(
      button: !time.isFull,
      selected: selected,
      label: semantics,
      excludeSemantics: true,
      child: Opacity(
        opacity: time.isFull ? 0.4 : 1,
        child: Material(
          color: selected
              ? AppColors.brand.withValues(alpha: 0.14)
              : colors.surfaceCard,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: BorderSide(
              color: selected
                  ? AppColors.brand
                  : colors.outline.withValues(alpha: 0.4),
              width: selected ? 2 : 1,
            ),
          ),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 9),
              child: Column(
                children: [
                  Text(
                    time.startTime,
                    style: AppTypography.mono(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: colors.onSurface,
                    ).copyWith(
                      decoration:
                          time.isFull ? TextDecoration.lineThrough : null,
                    ),
                  ),
                  const SizedBox(height: 2),
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      subtitle,
                      maxLines: 1,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color:
                            selected ? colors.brandText : colors.onSurfaceMuted,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Dia lotado ou sem horário: explica, oferece o próximo dia com vaga e, no
/// lotado, o "Avise-me".
class _DayNotice extends StatelessWidget {
  const _DayNotice({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.nextDay,
    this.onNextDay,
    this.notifyActive = false,
    this.notifyLoading = false,
    this.onNotifyToggle,
  });

  static final _dayFmt = DateFormat('EEE, d', 'pt_BR');

  final IconData icon;
  final String title;
  final String subtitle;
  final DateTime? nextDay;
  final VoidCallback? onNextDay;
  final bool notifyActive;
  final bool notifyLoading;
  final VoidCallback? onNotifyToggle;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final next = nextDay;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.outline.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, size: 20, color: colors.onSurfaceMuted),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: colors.onSurfaceMuted,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (onNotifyToggle != null || next != null) ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (onNotifyToggle != null)
                  FilledButton.tonalIcon(
                    onPressed: notifyLoading ? null : onNotifyToggle,
                    icon: notifyLoading
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Icon(
                            notifyActive
                                ? Icons.notifications_active_rounded
                                : Icons.notifications_none_rounded,
                            size: 18,
                          ),
                    label: Text(
                      notifyActive ? 'Aviso ativado' : 'Avise-me se abrir vaga',
                    ),
                  ),
                if (next != null && onNextDay != null)
                  OutlinedButton(
                    onPressed: onNextDay,
                    child: Text(
                      'Ver ${_dayFmt.format(next).replaceAll('.', '')}',
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
