import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/arena_date_utils.dart';
import '../../domain/arena_schedule_providers.dart';

/// Bottom sheet de seleção de data (mock calendário).
class ArenaScheduleDatePickerSheet extends ConsumerStatefulWidget {
  const ArenaScheduleDatePickerSheet({super.key});

  static Future<DateTime?> show(BuildContext context) {
    return showModalBottomSheet<DateTime>(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.themeColors.surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => const ArenaScheduleDatePickerSheet(),
    );
  }

  @override
  ConsumerState<ArenaScheduleDatePickerSheet> createState() =>
      _ArenaScheduleDatePickerSheetState();
}

class _ArenaScheduleDatePickerSheetState
    extends ConsumerState<ArenaScheduleDatePickerSheet> {
  late DateTime _visibleMonth;
  late DateTime _selected;

  @override
  void initState() {
    super.initState();
    final today = arenaTodayDateOnly();
    _selected = today;
    _visibleMonth = DateTime(today.year, today.month);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _selected = ref.read(arenaScheduleSelectedDateProvider);
    _visibleMonth = DateTime(_selected.year, _selected.month);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final monthTitle =
        DateFormat.yMMMM('pt_BR').format(_visibleMonth);
    final selectedLabel = DateFormat("EEE, d 'de' MMM", 'pt_BR')
        .format(_selected)
        .replaceAll('.', '');

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          12,
          20,
          20 + MediaQuery.paddingOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.35),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            SizedBox(height: 16),
            Text(
              'SELECIONE A DATA',
              style: theme.textTheme.labelSmall?.copyWith(
                color: context.themeColors.onSurfaceMuted,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.8,
              ),
            ),
            SizedBox(height: 6),
            Text(
              selectedLabel,
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
              ),
            ),
            SizedBox(height: 16),
            Row(
              children: [
                IconButton(
                  onPressed: () {
                    setState(() {
                      _visibleMonth = DateTime(
                        _visibleMonth.year,
                        _visibleMonth.month - 1,
                      );
                    });
                  },
                  icon: Icon(Icons.chevron_left_rounded),
                  color: context.themeColors.onSurface,
                ),
                Expanded(
                  child: Text(
                    monthTitle,
                    textAlign: TextAlign.center,
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: context.themeColors.onSurface,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: () {
                    setState(() {
                      _visibleMonth = DateTime(
                        _visibleMonth.year,
                        _visibleMonth.month + 1,
                      );
                    });
                  },
                  icon: Icon(Icons.chevron_right_rounded),
                  color: context.themeColors.onSurface,
                ),
              ],
            ),
            SizedBox(height: 8),
            _MonthGrid(
              month: _visibleMonth,
              selected: _selected,
              onSelect: (d) => setState(() => _selected = d),
            ),
            SizedBox(height: 16),
            // Row(
            //   children: [
            //     Text(
            //       'OCUPAÇÃO',
            //       style: theme.textTheme.labelSmall?.copyWith(
            //         color: context.themeColors.onSurfaceMuted,
            //         fontWeight: FontWeight.w800,
            //         letterSpacing: 0.6,
            //       ),
            //     ),
            //     Spacer(),
            //     _LegendDot(color: AppColors.pending, label: 'baixa'),
            //     SizedBox(width: 12),
            //     _LegendDot(color: AppColors.live, label: 'cheia'),
            //   ],
            // ),
            SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(context),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: context.themeColors.onSurface,
                      side: BorderSide(
                        color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.35),
                      ),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child: Text('Cancelar'),
                  ),
                ),
                SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: () => Navigator.pop(context, _selected),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brand,
                      foregroundColor: AppColors.black,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child: Text('OK'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _MonthGrid extends StatelessWidget {
  const _MonthGrid({
    required this.month,
    required this.selected,
    required this.onSelect,
  });

  final DateTime month;
  final DateTime selected;
  final ValueChanged<DateTime> onSelect;

  @override
  Widget build(BuildContext context) {
    final first = DateTime(month.year, month.month);
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
    final startWeekday = first.weekday % 7;
    final cells = <Widget>[];

    for (var i = 0; i < startWeekday; i++) {
      cells.add(SizedBox(height: 40));
    }
    for (var d = 1; d <= daysInMonth; d++) {
      final date = DateTime(month.year, month.month, d);
      final isSelected = _sameDay(date, selected);
      final isToday = _sameDay(date, arenaTodayDateOnly());
      cells.add(
        Material(
          color: isSelected ? AppColors.brand : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
          child: InkWell(
            onTap: () => onSelect(arenaDateOnly(date)),
            borderRadius: BorderRadius.circular(10),
            child: SizedBox(
              height: 40,
              child: Center(
                child: Text(
                  '$d',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: isSelected
                        ? AppColors.black
                        : (isToday
                            ? AppColors.brand
                            : context.themeColors.onSurface),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    }

    return GridView.count(
      crossAxisCount: 7,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 4,
      crossAxisSpacing: 4,
      children: cells,
    );
  }

  static bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;
}

class _LegendDot extends StatelessWidget {
  const _LegendDot({required this.color, required this.label});

  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        SizedBox(width: 6),
        Text(
          label,
          style: TextStyle(
            color: context.themeColors.onSurfaceMuted,
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}
