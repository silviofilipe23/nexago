import 'dart:async';

import 'package:flutter/material.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../tournaments/domain/tournament_match.dart';
import '../../../../tournaments/domain/tournament_match_card_view_model.dart';
import '../../../domain/match_ops/match_ops_models.dart';
import '../../../domain/match_ops/schedule_grid_logic.dart';
import '../../../domain/match_ops/schedule_logic.dart';
import 'organizer_schedule_pick_widgets.dart';

String scheduleGridTeamLine({
  required TournamentMatch match,
  required bool sideA,
  TournamentMatchCardViewModel? enriched,
}) {
  final label = schedulePickTeamData(
    match: match,
    sideA: sideA,
    enriched: enriched,
  ).label;
  return ScheduleGridLogic.teamLine(description: label);
}

class ScheduleGridHeader extends StatelessWidget {
  const ScheduleGridHeader({
    super.key,
    required this.programLabel,
    required this.onBack,
    this.onMore,
    this.alertCount = 0,
    this.dayPicker,
  });

  final String programLabel;
  final VoidCallback onBack;
  final VoidCallback? onMore;
  final int alertCount;
  final Widget? dayPicker;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _ScheduleGridIconButton(
                icon: Icons.arrow_back_ios_new_rounded,
                onPressed: onBack,
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      programLabel,
                      style: AppTypography.mono(
                        fontSize: 9,
                        fontWeight: FontWeight.w800,
                        color: AppColors.brand,
                        letterSpacing: 0.8,
                      ),
                    ),
                    Text(
                      'Grade de quadras',
                      style: AppTypography.soraRegular(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        color: context.themeColors.onSurface,
                        height: 1.15,
                      ),
                    ),
                  ],
                ),
              ),
              if (alertCount > 0) ...[
                Container(
                  margin: const EdgeInsets.only(top: 4, right: 8),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.live.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(
                      color: AppColors.live.withValues(alpha: 0.45),
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 5,
                        height: 5,
                        decoration: const BoxDecoration(
                          color: AppColors.live,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        '$alertCount',
                        style: AppTypography.mono(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          color: AppColors.live,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
          if (dayPicker != null) ...[const SizedBox(height: 10), dayPicker!],
        ],
      ),
    );
  }
}

class ScheduleGridDayPicker extends StatelessWidget {
  const ScheduleGridDayPicker({
    super.key,
    required this.tournamentDays,
    required this.selectedDayKey,
    required this.onDaySelected,
  });

  final List<String> tournamentDays;
  final String selectedDayKey;
  final ValueChanged<String> onDaySelected;

  DateTime? _dayKeyToLocalDate(String dayKey) {
    final anchor = nexagoEventDayKeyAnchor(dayKey);
    if (anchor == null) return null;
    return toNexagoEventLocal(anchor);
  }

  Future<void> _openCalendar(BuildContext context) async {
    if (tournamentDays.isEmpty) return;
    final first = _dayKeyToLocalDate(tournamentDays.first);
    final last = _dayKeyToLocalDate(tournamentDays.last);
    final initial = _dayKeyToLocalDate(selectedDayKey) ?? first;
    if (first == null || last == null || initial == null) return;

    final picked = await showDatePicker(
      context: context,
      locale: const Locale('pt', 'BR'),
      initialDate: initial,
      firstDate: first,
      lastDate: last,
      helpText: 'Selecionar dia',
      cancelText: 'Cancelar',
      confirmText: 'OK',
    );
    if (picked == null) return;
    onDaySelected(ScheduleLogic.dayKeyFromDate(picked));
  }

  @override
  Widget build(BuildContext context) {
    final selectedLabel = ScheduleGridLogic.programDayDateLabel(selectedDayKey);

    if (tournamentDays.length <= 1) {
      return Row(
        children: [
          Icon(
            Icons.calendar_today_rounded,
            size: 14,
            color: context.themeColors.onSurfaceMuted,
          ),
          const SizedBox(width: 6),
          Text(
            selectedLabel,
            style: AppTypography.soraRegular(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: context.themeColors.onSurfaceMuted,
            ),
          ),
        ],
      );
    }

    return Row(
      children: [
        Expanded(
          child: SizedBox(
            height: 36,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: tournamentDays.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, index) {
                final dayKey = tournamentDays[index];
                final selected = dayKey == selectedDayKey;
                return FilterChip(
                  label: Text(
                    ScheduleGridLogic.programDayChipLabel(dayKey),
                    style: AppTypography.mono(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: selected
                          ? Colors.white
                          : context.themeColors.onSurfaceMuted,
                    ),
                  ),
                  selected: selected,
                  showCheckmark: false,
                  onSelected: (_) => onDaySelected(dayKey),
                  selectedColor: AppColors.brand,
                  backgroundColor: context.themeColors.surfaceRaised,
                  side: BorderSide(
                    color: selected
                        ? AppColors.brand
                        : context.themeColors.onSurfaceMuted.withValues(
                            alpha: 0.2,
                          ),
                  ),
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  visualDensity: VisualDensity.compact,
                );
              },
            ),
          ),
        ),
        const SizedBox(width: 4),
        _ScheduleGridIconButton(
          icon: Icons.calendar_month_rounded,
          onPressed: () => _openCalendar(context),
        ),
      ],
    );
  }
}

class ScheduleGridCourtHeaders extends StatelessWidget {
  const ScheduleGridCourtHeaders({
    super.key,
    required this.courts,
    required this.timeColumnWidth,
    required this.courtColumnWidth,
    this.horizontalScrollController,
  });

  final List<TournamentCourt> courts;
  final double timeColumnWidth;
  final double courtColumnWidth;
  final ScrollController? horizontalScrollController;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      controller: horizontalScrollController,
      scrollDirection: Axis.horizontal,
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.only(left: 8, right: 8, bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: timeColumnWidth),
          for (final court in courts) ...[
            SizedBox(
              width: courtColumnWidth,
              child: Column(
                children: [
                  Text(
                    court.id,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: AppTypography.mono(
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                      color: context.themeColors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    court.name,
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.soraRegular(
                      fontSize: 10,
                      fontWeight: FontWeight.w500,
                      color: context.themeColors.onSurfaceMuted,
                      height: 1.2,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class ScheduleGridBody extends StatefulWidget {
  const ScheduleGridBody({
    super.key,
    required this.courts,
    required this.slots,
    required this.gridStart,
    required this.matchesByCourt,
    required this.categoryLabelsByMatchId,
    required this.categoryAccentByCategoryId,
    required this.categoryMatchesByCategoryId,
    required this.enrichedByMatchId,
    required this.defaultDurationMin,
    required this.selectedDayKey,
    required this.onMatchTap,
    required this.onDropMatch,
    this.horizontalScrollController,
  });

  final List<TournamentCourt> courts;
  final List<DateTime> slots;
  final DateTime gridStart;
  final Map<String, List<TournamentMatch>> matchesByCourt;
  final Map<String, String> categoryLabelsByMatchId;
  final Map<String, Color> categoryAccentByCategoryId;
  final Map<String, List<TournamentMatch>> categoryMatchesByCategoryId;
  final Map<String, TournamentMatchCardViewModel> enrichedByMatchId;
  final int defaultDurationMin;
  final String selectedDayKey;
  final ValueChanged<TournamentMatch> onMatchTap;
  final Future<void> Function(
    TournamentMatch match,
    String courtId,
    DateTime slotStart,
  )
  onDropMatch;
  final ScrollController? horizontalScrollController;

  @override
  State<ScheduleGridBody> createState() => _ScheduleGridBodyState();
}

class _ScheduleGridBodyState extends State<ScheduleGridBody> {
  late final ScrollController _verticalScrollController;
  final GlobalKey _viewportKey = GlobalKey();
  Timer? _autoScrollTimer;
  double _autoScrollDelta = 0;
  String? _scrolledForDayKey;
  String? _draggingMatchId;
  String? _savingMatchId;

  static const _autoScrollEdgeSize = 88.0;
  static const _autoScrollMaxSpeed = 24.0;

  @override
  void initState() {
    super.initState();
    _verticalScrollController = ScrollController();
    WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToInitial());
  }

  @override
  void didUpdateWidget(covariant ScheduleGridBody oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.selectedDayKey != widget.selectedDayKey) {
      _scrolledForDayKey = null;
      WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToInitial());
    }
  }

  void _onDragStarted(TournamentMatch match) {
    setState(() => _draggingMatchId = match.id);
  }

  void _onDragUpdate(DragUpdateDetails details) {
    if (_draggingMatchId == null) return;
    _autoScrollDelta = _autoScrollDeltaForGlobalY(details.globalPosition.dy);
    if (_autoScrollDelta != 0) {
      _ensureAutoScrollTimer();
    } else {
      _stopAutoScroll();
    }
  }

  void _onDragEnded() {
    _stopAutoScroll();
    if (_draggingMatchId == null) return;
    setState(() => _draggingMatchId = null);
  }

  double _autoScrollDeltaForGlobalY(double globalY) {
    final box = _viewportKey.currentContext?.findRenderObject() as RenderBox?;
    if (box == null || !box.hasSize) return 0;

    final top = box.localToGlobal(Offset.zero).dy;
    final bottom = top + box.size.height;

    if (globalY < top + _autoScrollEdgeSize) {
      final intensity =
          ((top + _autoScrollEdgeSize) - globalY) / _autoScrollEdgeSize;
      return -_autoScrollMaxSpeed * intensity.clamp(0.0, 1.0);
    }
    if (globalY > bottom - _autoScrollEdgeSize) {
      final intensity =
          (globalY - (bottom - _autoScrollEdgeSize)) / _autoScrollEdgeSize;
      return _autoScrollMaxSpeed * intensity.clamp(0.0, 1.0);
    }
    return 0;
  }

  void _ensureAutoScrollTimer() {
    if (_autoScrollTimer != null) return;
    _autoScrollTimer = Timer.periodic(const Duration(milliseconds: 16), (_) {
      if (_autoScrollDelta == 0 || !_verticalScrollController.hasClients) {
        _stopAutoScroll();
        return;
      }
      final position = _verticalScrollController.position;
      final next = (position.pixels + _autoScrollDelta).clamp(
        0.0,
        position.maxScrollExtent,
      );
      if (next == position.pixels) {
        _stopAutoScroll();
        return;
      }
      _verticalScrollController.jumpTo(next);
    });
  }

  void _stopAutoScroll() {
    _autoScrollTimer?.cancel();
    _autoScrollTimer = null;
    _autoScrollDelta = 0;
  }

  Future<void> _handleDropMatch(
    TournamentMatch match,
    String courtId,
    DateTime slotStart,
  ) async {
    _stopAutoScroll();
    setState(() {
      _draggingMatchId = null;
      _savingMatchId = match.id;
    });
    try {
      await widget.onDropMatch(match, courtId, slotStart);
    } finally {
      if (mounted) {
        setState(() => _savingMatchId = null);
      }
    }
  }

  @override
  void dispose() {
    _stopAutoScroll();
    _verticalScrollController.dispose();
    super.dispose();
  }

  void _scrollToInitial() {
    if (_scrolledForDayKey == widget.selectedDayKey) return;
    if (!_verticalScrollController.hasClients) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToInitial());
      return;
    }

    final gridEnd = widget.slots.isNotEmpty
        ? widget.slots.last.add(
            const Duration(minutes: ScheduleGridLogic.slotMinutes),
          )
        : widget.gridStart;

    final todayKey = ScheduleLogic.dayKeyFromDate(nexagoEventNow());
    double targetOffset = 0;

    if (widget.selectedDayKey == todayKey) {
      final nowOffset = ScheduleGridLogic.nowLineOffset(
        gridStart: widget.gridStart,
        gridEnd: gridEnd,
      );
      if (nowOffset != null) {
        targetOffset = (nowOffset - ScheduleGridLogic.slotHeight * 2).clamp(
          0.0,
          _verticalScrollController.position.maxScrollExtent,
        );
      }
    } else {
      TournamentMatch? firstScheduled;
      for (final list in widget.matchesByCourt.values) {
        for (final match in list) {
          final time = match.scheduleTime;
          if (time == null) continue;
          if (firstScheduled == null ||
              time.isBefore(firstScheduled.scheduleTime!)) {
            firstScheduled = match;
          }
        }
      }
      if (firstScheduled?.scheduleTime != null) {
        final top = ScheduleGridLogic.matchTopOffset(
          match: firstScheduled!,
          gridStart: widget.gridStart,
        );
        targetOffset = (top - ScheduleGridLogic.slotHeight).clamp(
          0.0,
          double.infinity,
        );
      }
    }

    _verticalScrollController.jumpTo(
      targetOffset.clamp(
        0.0,
        _verticalScrollController.position.maxScrollExtent,
      ),
    );
    _scrolledForDayKey = widget.selectedDayKey;
  }

  @override
  Widget build(BuildContext context) {
    final slots = widget.slots;
    final gridStart = widget.gridStart;
    final gridHeight = ScheduleGridLogic.gridTotalHeight(slots);
    final gridEnd = slots.isNotEmpty
        ? slots.last.add(const Duration(minutes: ScheduleGridLogic.slotMinutes))
        : gridStart;
    final showNowLine =
        widget.selectedDayKey == ScheduleLogic.dayKeyFromDate(nexagoEventNow());

    return Stack(
      fit: StackFit.expand,
      children: [
        SingleChildScrollView(
          key: _viewportKey,
          controller: _verticalScrollController,
          padding: const EdgeInsets.only(
            bottom: 16 + kScheduleGridFloatingActionClearance,
          ),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            controller: widget.horizontalScrollController,
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: SizedBox(
              height: gridHeight,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _ScheduleGridTimeColumn(slots: slots),
                      for (final court in widget.courts)
                        _ScheduleGridCourtColumn(
                          court: court,
                          slots: slots,
                          gridStart: gridStart,
                          matches: widget.matchesByCourt[court.id] ?? const [],
                          categoryLabelsByMatchId:
                              widget.categoryLabelsByMatchId,
                          categoryAccentByCategoryId:
                              widget.categoryAccentByCategoryId,
                          categoryMatchesByCategoryId:
                              widget.categoryMatchesByCategoryId,
                          enrichedByMatchId: widget.enrichedByMatchId,
                          defaultDurationMin: widget.defaultDurationMin,
                          draggingMatchId: _draggingMatchId,
                          savingMatchId: _savingMatchId,
                          onMatchTap: widget.onMatchTap,
                          onDropMatch: _handleDropMatch,
                          onDragStarted: _onDragStarted,
                          onDragUpdate: _onDragUpdate,
                          onDragEnded: _onDragEnded,
                        ),
                    ],
                  ),
                  if (showNowLine)
                    _ScheduleGridNowLineOverlay(
                      gridStart: gridStart,
                      gridEnd: gridEnd,
                    ),
                ],
              ),
            ),
          ),
        ),
        if (_savingMatchId != null)
          Positioned.fill(
            child: ColoredBox(
              color: Colors.black.withValues(alpha: 0.06),
              child: Center(
                child: Material(
                  color: context.themeColors.surfaceCard,
                  elevation: 2,
                  borderRadius: BorderRadius.circular(12),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 20,
                      vertical: 14,
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: AppColors.brand,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Text(
                          'Atualizando horário…',
                          style: AppTypography.soraRegular(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: context.themeColors.onSurface,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// Atualiza só a linha “agora” — evita rebuild da grade inteira a cada 30s.
class _ScheduleGridNowLineOverlay extends StatefulWidget {
  const _ScheduleGridNowLineOverlay({
    required this.gridStart,
    required this.gridEnd,
  });

  final DateTime gridStart;
  final DateTime gridEnd;

  @override
  State<_ScheduleGridNowLineOverlay> createState() =>
      _ScheduleGridNowLineOverlayState();
}

class _ScheduleGridNowLineOverlayState
    extends State<_ScheduleGridNowLineOverlay> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final nowOffset = ScheduleGridLogic.nowLineOffset(
      gridStart: widget.gridStart,
      gridEnd: widget.gridEnd,
    );
    if (nowOffset == null) return const SizedBox.shrink();
    return Positioned(
      top: nowOffset,
      left: 0,
      right: 0,
      child: ScheduleGridNowLine(
        timeLabel: ScheduleGridLogic.timeLabel(nexagoEventNow()),
      ),
    );
  }
}

class ScheduleGridNowLine extends StatelessWidget {
  const ScheduleGridNowLine({super.key, required this.timeLabel});

  final String timeLabel;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          timeLabel,
          style: AppTypography.mono(
            fontSize: 10,
            fontWeight: FontWeight.w800,
            color: AppColors.live,
          ),
        ),
        Expanded(
          child: Container(
            height: 2,
            margin: const EdgeInsets.symmetric(horizontal: 6),
            color: AppColors.live,
          ),
        ),
        Container(
          width: 8,
          height: 8,
          decoration: const BoxDecoration(
            color: AppColors.live,
            shape: BoxShape.circle,
          ),
        ),
      ],
    );
  }
}

/// Espaço extra no fim da grade para os botões flutuantes.
const kScheduleGridFloatingActionClearance = 88.0;

class ScheduleGridActionBar extends StatelessWidget {
  const ScheduleGridActionBar({
    super.key,
    required this.onAuto,
    required this.onSchedule,
    this.scheduleEnabled = true,
  });

  final VoidCallback onAuto;
  final VoidCallback onSchedule;
  final bool scheduleEnabled;

  @override
  Widget build(BuildContext context) {
    final shadow = AppColors.black.withValues(alpha: 0.14);
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        child: Row(
          children: [
            Material(
              elevation: 8,
              shadowColor: shadow,
              color: context.themeColors.surfaceCard,
              borderRadius: BorderRadius.circular(14),
              clipBehavior: Clip.antiAlias,
              child: OutlinedButton.icon(
                onPressed: scheduleEnabled ? onAuto : null,
                icon: const Icon(Icons.auto_fix_high_rounded, size: 18),
                label: const Text('Auto'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: context.themeColors.onSurface,
                  backgroundColor: context.themeColors.surfaceCard,
                  side: BorderSide.none,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 14,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Material(
                elevation: 8,
                shadowColor: shadow,
                borderRadius: BorderRadius.circular(14),
                clipBehavior: Clip.antiAlias,
                child: FilledButton.icon(
                  onPressed: scheduleEnabled ? onSchedule : null,
                  icon: const Icon(Icons.add_rounded, size: 20),
                  label: const Text('Agendar partida'),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: Colors.white,
                    disabledBackgroundColor: AppColors.brand.withValues(
                      alpha: 0.45,
                    ),
                    disabledForegroundColor: Colors.white.withValues(
                      alpha: 0.8,
                    ),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                    textStyle: AppTypography.soraRegular(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ScheduleGridTimeColumn extends StatelessWidget {
  const _ScheduleGridTimeColumn({required this.slots});

  final List<DateTime> slots;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: ScheduleGridLogic.timeColumnWidth,
      child: Column(
        children: [
          for (final slot in slots)
            SizedBox(
              height: ScheduleGridLogic.slotHeight,
              child: Align(
                alignment: Alignment.topRight,
                child: Padding(
                  padding: const EdgeInsets.only(top: 2, right: 6),
                  child: Text(
                    ScheduleGridLogic.timeLabel(slot),
                    style: AppTypography.mono(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: context.themeColors.onSurfaceMuted,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _ScheduleGridCourtColumn extends StatelessWidget {
  const _ScheduleGridCourtColumn({
    required this.court,
    required this.slots,
    required this.gridStart,
    required this.matches,
    required this.categoryLabelsByMatchId,
    required this.categoryAccentByCategoryId,
    required this.categoryMatchesByCategoryId,
    required this.enrichedByMatchId,
    required this.defaultDurationMin,
    required this.draggingMatchId,
    required this.savingMatchId,
    required this.onMatchTap,
    required this.onDropMatch,
    required this.onDragStarted,
    required this.onDragUpdate,
    required this.onDragEnded,
  });

  final TournamentCourt court;
  final List<DateTime> slots;
  final DateTime gridStart;
  final List<TournamentMatch> matches;
  final Map<String, String> categoryLabelsByMatchId;
  final Map<String, Color> categoryAccentByCategoryId;
  final Map<String, List<TournamentMatch>> categoryMatchesByCategoryId;
  final Map<String, TournamentMatchCardViewModel> enrichedByMatchId;
  final int defaultDurationMin;
  final String? draggingMatchId;
  final String? savingMatchId;
  final ValueChanged<TournamentMatch> onMatchTap;
  final Future<void> Function(
    TournamentMatch match,
    String courtId,
    DateTime slotStart,
  )
  onDropMatch;
  final ValueChanged<TournamentMatch> onDragStarted;
  final ValueChanged<DragUpdateDetails> onDragUpdate;
  final VoidCallback onDragEnded;

  @override
  Widget build(BuildContext context) {
    final gridHeight = ScheduleGridLogic.gridTotalHeight(slots);

    return SizedBox(
      width: ScheduleGridLogic.courtColumnWidth,
      height: gridHeight,
      child: Stack(
        children: [
          Column(
            children: [
              for (final slot in slots)
                _ScheduleGridDropSlot(
                  courtId: court.id,
                  slot: slot,
                  gridStart: gridStart,
                  showDropHint: draggingMatchId != null,
                  onDropMatch: onDropMatch,
                ),
            ],
          ),
          for (final match in matches)
            Positioned(
              top: ScheduleGridLogic.matchTopOffset(
                match: match,
                gridStart: gridStart,
              ),
              left: 4,
              right: 4,
              height: ScheduleGridLogic.matchBlockHeight(
                match: match,
                defaultDurationMin: defaultDurationMin,
              ),
              child: IgnorePointer(
                ignoring: draggingMatchId != null || savingMatchId != null,
                child: Builder(
                  builder: (context) {
                    final categoryLabel =
                        categoryLabelsByMatchId[match.id] ?? match.categoryId;
                    final header = ScheduleGridLogic.matchCardHeader(
                      match: match,
                      categoryCompactLabel: categoryLabel,
                      categoryMatches:
                          categoryMatchesByCategoryId[match.categoryId] ??
                          const [],
                    );
                    final matchPhase = ScheduleGridLogic.matchPhase(match);
                    return _ScheduleGridMatchCard(
                      match: match,
                      eyebrowLabel: header.eyebrow,
                      phaseLabel: header.phaseLabel,
                      accentColor: ScheduleGridLogic.matchCardAccentColor(
                        categoryId: match.categoryId,
                        categoryColors: categoryAccentByCategoryId,
                        phase: matchPhase,
                      ),
                      teamALine: scheduleGridTeamLine(
                        match: match,
                        sideA: true,
                        enriched: enrichedByMatchId[match.id],
                      ),
                      teamBLine: scheduleGridTeamLine(
                        match: match,
                        sideA: false,
                        enriched: enrichedByMatchId[match.id],
                      ),
                      timeRange: ScheduleGridLogic.matchTimeRange(
                        match,
                        defaultDurationMin: defaultDurationMin,
                      ),
                      phase: matchPhase,
                      showAlert: ScheduleGridLogic.showAlertIcon(match),
                      isSaving: savingMatchId == match.id,
                      onTap: () => onMatchTap(match),
                      onDragStarted: () => onDragStarted(match),
                      onDragUpdate: onDragUpdate,
                      onDragEnded: onDragEnded,
                    );
                  },
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _ScheduleGridDropSlot extends StatelessWidget {
  const _ScheduleGridDropSlot({
    required this.courtId,
    required this.slot,
    required this.gridStart,
    required this.showDropHint,
    required this.onDropMatch,
  });

  final String courtId;
  final DateTime slot;
  final DateTime gridStart;
  final bool showDropHint;
  final Future<void> Function(
    TournamentMatch match,
    String courtId,
    DateTime slotStart,
  )
  onDropMatch;

  @override
  Widget build(BuildContext context) {
    return DragTarget<TournamentMatch>(
      onWillAcceptWithDetails: (_) => showDropHint,
      onAcceptWithDetails: (details) {
        onDropMatch(
          details.data,
          courtId,
          ScheduleGridLogic.slotDateTime(gridStart: gridStart, slot: slot),
        );
      },
      builder: (context, candidate, rejected) {
        final active = showDropHint && candidate.isNotEmpty;
        return Container(
          height: ScheduleGridLogic.slotHeight,
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(
                color: context.themeColors.onSurfaceMuted.withValues(
                  alpha: 0.08,
                ),
              ),
              right: BorderSide(
                color: context.themeColors.onSurfaceMuted.withValues(
                  alpha: 0.08,
                ),
              ),
            ),
          ),
          child: active
              ? Center(
                  child: Container(
                    margin: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: AppColors.brand,
                        width: 1.5,
                        strokeAlign: BorderSide.strokeAlignInside,
                      ),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          'SOLTAR',
                          style: AppTypography.mono(
                            fontSize: 9,
                            fontWeight: FontWeight.w800,
                            color: AppColors.brand,
                            letterSpacing: 0.6,
                          ),
                        ),
                        Text(
                          ScheduleGridLogic.timeLabel(slot),
                          style: AppTypography.mono(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: AppColors.brand,
                          ),
                        ),
                      ],
                    ),
                  ),
                )
              : null,
        );
      },
    );
  }
}

class _ScheduleGridMatchCard extends StatelessWidget {
  const _ScheduleGridMatchCard({
    required this.match,
    required this.eyebrowLabel,
    required this.phaseLabel,
    required this.accentColor,
    required this.teamALine,
    required this.teamBLine,
    required this.timeRange,
    required this.phase,
    required this.showAlert,
    required this.isSaving,
    required this.onTap,
    required this.onDragStarted,
    required this.onDragUpdate,
    required this.onDragEnded,
  });

  final TournamentMatch match;
  final String eyebrowLabel;
  final String phaseLabel;
  final Color accentColor;
  final String teamALine;
  final String teamBLine;
  final String timeRange;
  final ScheduleGridMatchPhase phase;
  final bool showAlert;
  final bool isSaving;
  final VoidCallback onTap;
  final VoidCallback onDragStarted;
  final ValueChanged<DragUpdateDetails> onDragUpdate;
  final VoidCallback onDragEnded;

  @override
  Widget build(BuildContext context) {
    final card = Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.1),
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 4,
                decoration: BoxDecoration(
                  color: accentColor,
                  borderRadius: const BorderRadius.horizontal(
                    left: Radius.circular(10),
                  ),
                ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(5, 4, 5, 4),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              eyebrowLabel,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: AppTypography.mono(
                                fontSize: 9,
                                fontWeight: FontWeight.w800,
                                color: context.themeColors.onSurfaceMuted,
                                letterSpacing: 0.2,
                                height: 1.1,
                              ),
                            ),
                          ),
                          if (timeRange.isNotEmpty) ...[
                            const SizedBox(width: 4),
                            Text(
                              timeRange,
                              style: AppTypography.mono(
                                fontSize: 8,
                                fontWeight: FontWeight.w600,
                                color: context.themeColors.onSurfaceMuted,
                                height: 1.1,
                              ),
                            ),
                          ],
                          if (phase == ScheduleGridMatchPhase.live) ...[
                            const SizedBox(width: 4),
                            Container(
                              width: 5,
                              height: 5,
                              decoration: const BoxDecoration(
                                color: AppColors.live,
                                shape: BoxShape.circle,
                              ),
                            ),
                          ],
                          if (showAlert) ...[
                            const SizedBox(width: 2),
                            Icon(
                              Icons.notifications_none_rounded,
                              size: 11,
                              color: context.themeColors.onSurfaceMuted,
                            ),
                          ],
                        ],
                      ),
                      if (phaseLabel.trim().isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Text(
                            phaseLabel,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.mono(
                              fontSize: 8,
                              fontWeight: FontWeight.w700,
                              color: context.themeColors.onSurface,
                              height: 1.1,
                            ),
                          ),
                        ),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              teamALine,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: AppTypography.soraRegular(
                                fontSize: 10,
                                fontWeight: FontWeight.w800,
                                color: context.themeColors.onSurface,
                                height: 1.1,
                              ),
                            ),
                            Text(
                              teamBLine,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: AppTypography.soraRegular(
                                fontSize: 10,
                                fontWeight: FontWeight.w800,
                                color: context.themeColors.onSurface,
                                height: 1.1,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );

    final cardWithSaving = Stack(
      fit: StackFit.expand,
      children: [
        card,
        if (isSaving)
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: context.themeColors.surfaceRaised.withValues(
                  alpha: 0.72,
                ),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Center(
                child: SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            ),
          ),
      ],
    );

    return LongPressDraggable<TournamentMatch>(
      data: match,
      maxSimultaneousDrags: isSaving ? 0 : 1,
      feedback: Material(
        color: Colors.transparent,
        child: Opacity(
          opacity: 0.92,
          child: SizedBox(
            width: ScheduleGridLogic.courtColumnWidth - 8,
            height: ScheduleGridLogic.matchBlockHeight(
              match: match,
              defaultDurationMin: 30,
            ),
            child: _ScheduleGridMatchCard(
              match: match,
              eyebrowLabel: eyebrowLabel,
              phaseLabel: phaseLabel,
              accentColor: accentColor,
              teamALine: teamALine,
              teamBLine: teamBLine,
              timeRange: timeRange,
              phase: phase,
              showAlert: showAlert,
              isSaving: false,
              onTap: () {},
              onDragStarted: () {},
              onDragUpdate: (_) {},
              onDragEnded: () {},
            ),
          ),
        ),
      ),
      childWhenDragging: const SizedBox.shrink(),
      onDragStarted: onDragStarted,
      onDragUpdate: onDragUpdate,
      onDragEnd: (_) => onDragEnded(),
      onDraggableCanceled: (_, __) => onDragEnded(),
      child: cardWithSaving,
    );
  }
}

class _ScheduleGridIconButton extends StatelessWidget {
  const _ScheduleGridIconButton({required this.icon, required this.onPressed});

  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceRaised,
      shape: const CircleBorder(),
      child: InkWell(
        onTap: onPressed,
        customBorder: const CircleBorder(),
        child: SizedBox(
          width: 40,
          height: 40,
          child: Icon(icon, size: 20, color: context.themeColors.onSurface),
        ),
      ),
    );
  }
}
