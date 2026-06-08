import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/slots_page_providers.dart';

class SlotsDayStrip extends StatefulWidget {
  const SlotsDayStrip({
    super.key,
    required this.startDay,
    required this.selectedDay,
    required this.daysCount,
    required this.calendarDays,
    required this.onSelect,
    required this.sameDay,
    required this.dateOnly,
  });

  final DateTime startDay;
  final DateTime selectedDay;
  final int daysCount;
  final List<SlotsCalendarDayStatus>? calendarDays;
  final ValueChanged<DateTime> onSelect;
  final bool Function(DateTime a, DateTime b) sameDay;
  final DateTime Function(DateTime d) dateOnly;

  static final _weekdayFmt = DateFormat('EEE', 'pt_BR');

  @override
  State<SlotsDayStrip> createState() => _SlotsDayStripState();
}

class _SlotsDayStripState extends State<SlotsDayStrip> {
  static const _itemWidth = 56.0;
  static const _separatorWidth = 8.0;
  static const _horizontalPadding = 16.0;

  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToSelected());
  }

  @override
  void didUpdateWidget(SlotsDayStrip oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!widget.sameDay(oldWidget.selectedDay, widget.selectedDay) ||
        !widget.sameDay(oldWidget.startDay, widget.startDay)) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToSelected());
    }
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollToSelected() {
    if (!_scrollController.hasClients) return;
    final start = widget.dateOnly(widget.startDay);
    final selected = widget.dateOnly(widget.selectedDay);
    final index = selected.difference(start).inDays;
    if (index < 0 || index >= widget.daysCount) return;

    final offset = (index * (_itemWidth + _separatorWidth))
        .clamp(0.0, _scrollController.position.maxScrollExtent);
    _scrollController.jumpTo(offset);
  }

  SlotsCalendarDayStatus? _statusFor(DateTime d) {
    final calendarDays = widget.calendarDays;
    if (calendarDays == null) return null;
    for (final s in calendarDays) {
      if (widget.sameDay(s.date, d)) return s;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final start = widget.dateOnly(widget.startDay);

    return SizedBox(
      height: 88,
      child: ListView.separated(
        controller: _scrollController,
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: _horizontalPadding),
        itemCount: widget.daysCount,
        separatorBuilder: (_, __) => SizedBox(width: _separatorWidth),
        itemBuilder: (context, index) {
          final d = start.add(Duration(days: index));
          final isSelected = widget.sameDay(d, widget.selectedDay);
          final status = _statusFor(d);
          final weekLabel =
              SlotsDayStrip._weekdayFmt.format(d).replaceAll('.', '').toUpperCase();
          final dayNum = d.day.toString();

          final dotColor = isSelected
              ? AppColors.brand
              : status?.availability.hasAnyFree == true
                  ? AppColors.win
                  : AppColors.live;

          return Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: () => widget.onSelect(d),
              borderRadius: BorderRadius.circular(14),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                width: _itemWidth,
                padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: isSelected
                        ? AppColors.brand
                        : context.themeColors.surfaceRaised,
                    width: isSelected ? 2 : 1,
                  ),
                  color: isSelected
                      ? AppColors.brand.withValues(alpha: 0.12)
                      : context.themeColors.surfaceCard,
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      weekLabel,
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: context.themeColors.onSurfaceMuted,
                        fontSize: 10,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      dayNum,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w900,
                        color: context.themeColors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Container(
                      width: 6,
                      height: 6,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: status == null
                            ? context.themeColors.surfaceRaised
                            : dotColor,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
