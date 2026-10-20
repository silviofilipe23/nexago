import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/layout/nexa_page_header.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../../professor_links/application/professor_links_providers.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_agenda_providers.dart';
import '../../application/professor_wallet_providers.dart';
import '../../domain/professor_agenda.dart';
import '../../domain/professor_lessons.dart';
import '../../domain/professor_students_logic.dart' show professorShortDate;
import '../../domain/professor_wallet_logic.dart' show professorMonthName;
import '../../infrastructure/professor_students_repository.dart';
import '../actions/professor_action_widgets.dart' show ProfessorActionHint;
import '../professor_shell_page.dart';
import '../wallet/professor_wallet_lessons.dart' show startProfessorLesson;
import '../widgets/professor_students_widgets.dart';
import 'professor_agenda_widgets.dart';

const _weekdayShort = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const _weekdayLetter = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

String _weekday(String dateKey) =>
    _weekdayShort[DateTime.parse(dateKey).weekday - 1];

/// Aba Agenda do modo Professor (E1 Dia · E2 Semana · E3 Mês): aulas de
/// turma, da carteira e os bloqueios, com a cor de cada arena. Carrega só
/// o intervalo da visão (a semana ou o mês).
class ProfessorAgendaPage extends ConsumerWidget {
  const ProfessorAgendaPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final view = ref.watch(professorAgendaViewProvider);
    final date = ref.watch(professorAgendaSelectedDateProvider);
    final now = ref.watch(professorAgendaNowProvider);
    final range = professorAgendaRange(view, date);
    final async = ref.watch(professorAgendaItemsProvider(range));
    final items = async.valueOrNull;

    void setDate(String key) =>
        ref.read(professorAgendaDateProvider.notifier).state = key;
    void setView(ProfessorAgendaView v) =>
        ref.read(professorAgendaViewProvider.notifier).state = v;

    return Scaffold(
      backgroundColor: colors.canvas,
      body: NexaPageHeader(
        topGap: 10,
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
        header: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Agenda',
                    style: ProfessorLinksStyle.display(
                      24,
                      color: colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    _subtitle(view, date, range, items),
                    key: const Key('professor-agenda-subtitle'),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ProfessorLinksStyle.mono(
                      10.5,
                      color: ProfessorLinksStyle.dim(colors),
                    ).copyWith(letterSpacing: 0.8),
                  ),
                ],
              ),
            ),
            ProfessorLinksRoundButton(
              key: const Key('professor-agenda-sync'),
              icon: Icons.event_repeat_rounded,
              semanticLabel: 'Sincronizar calendário',
              onTap: () =>
                  context.pushNamed(AppRouteNames.professorCalendarSync),
            ),
            const SizedBox(width: 8),
            ProfessorLinksRoundButton(
              key: const Key('professor-agenda-add'),
              icon: Icons.add_rounded,
              filled: true,
              semanticLabel: 'Bloquear período ou nova aula',
              onTap: () => showProfessorAgendaAddSheet(context, ref),
            ),
          ],
        ),
        child: RefreshIndicator(
          color: AppColors.brand,
          onRefresh: () async {
            ref.invalidate(professorAgendaSessionsProvider(range));
            await ref
                .read(professorAgendaSessionsProvider(range).future)
                .then<void>((_) {}, onError: (_) {});
          },
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: EdgeInsets.fromLTRB(
              20,
              8,
              20,
              professorShellBottomPadding(context),
            ),
            children: [
              ArenaClassSegmented<ProfessorAgendaView>(
                items: const [
                  (ProfessorAgendaView.day, 'Dia'),
                  (ProfessorAgendaView.week, 'Semana'),
                  (ProfessorAgendaView.month, 'Mês'),
                ],
                selected: view,
                onChanged: setView,
              ),
              const SizedBox(height: 12),
              _PeriodNav(
                label: _periodLabel(view, date, range),
                isCurrent: _containsToday(view, date, now.todayKey),
                onPrev: () => setDate(view == ProfessorAgendaView.month
                    ? professorShiftMonth(date, -1)
                    : professorShiftDay(date, -7)),
                onNext: () => setDate(view == ProfessorAgendaView.month
                    ? professorShiftMonth(date, 1)
                    : professorShiftDay(date, 7)),
                onToday: () =>
                    ref.read(professorAgendaDateProvider.notifier).state = null,
              ),
              const SizedBox(height: 12),
              if (items == null && async.hasError)
                ProfessorRetryCard(
                  message: async.error is ProfessorStudentsException
                      ? (async.error as ProfessorStudentsException).message
                      : 'Não foi possível carregar sua agenda.',
                  onRetry: () =>
                      ref.invalidate(professorAgendaSessionsProvider(range)),
                )
              else if (items == null)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 40),
                  child: Center(
                    child: CircularProgressIndicator(color: AppColors.brand),
                  ),
                )
              else ...[
                if (professorAgendaConflicts(items) case final c
                    when c.isNotEmpty) ...[
                  ProfessorConflictBanner(conflicts: c),
                  const SizedBox(height: 12),
                ],
                switch (view) {
                  ProfessorAgendaView.day => _DayView(
                      items: items,
                      date: date,
                      onPick: setDate,
                    ),
                  ProfessorAgendaView.week => _WeekView(
                      items: items,
                      date: date,
                      onPickDay: (d) {
                        setDate(d);
                        setView(ProfessorAgendaView.day);
                      },
                    ),
                  ProfessorAgendaView.month => _MonthView(
                      items: items,
                      date: date,
                      onPickDay: (d) {
                        setDate(d);
                        setView(ProfessorAgendaView.day);
                      },
                    ),
                },
              ],
            ],
          ),
        ),
      ),
    );
  }

  static bool _containsToday(
    ProfessorAgendaView view,
    String date,
    String todayKey,
  ) {
    final r = professorAgendaRange(view, date);
    return todayKey.compareTo(r.fromKey) >= 0 &&
        todayKey.compareTo(r.toKey) <= 0;
  }

  static String _periodLabel(
    ProfessorAgendaView view,
    String date,
    ProfessorAgendaRange r,
  ) {
    if (view == ProfessorAgendaView.month) {
      final m = professorMonthName(date.substring(0, 7));
      return '${m[0].toUpperCase()}${m.substring(1)} ${date.substring(0, 4)}';
    }
    return '${professorShortDate(r.fromKey)} – ${professorShortDate(r.toKey)}';
  }

  static String _subtitle(
    ProfessorAgendaView view,
    String date,
    ProfessorAgendaRange r,
    List<ProfessorAgendaItem>? items,
  ) {
    String count(int n) => '$n AULA${n == 1 ? '' : 'S'}';
    final all = items ?? const [];
    switch (view) {
      case ProfessorAgendaView.day:
        final n = professorLessonCountOn(all, date);
        final arenas = {
          for (final i in professorItemsOn(all, date))
            if (!i.isBlock && !i.canceled) i.arenaId,
        }.length;
        return [
          '${_weekday(date)}, ${professorShortDate(date)}'.toUpperCase(),
          if (items != null) count(n),
          if (arenas > 1) '$arenas ARENAS',
        ].join(' · ');
      case ProfessorAgendaView.week:
        final n = all.where((i) => !i.isBlock && !i.canceled).length;
        return [
          '${professorShortDate(r.fromKey)}–${professorShortDate(r.toKey)}'
              .toUpperCase(),
          if (items != null) count(n),
        ].join(' · ');
      case ProfessorAgendaView.month:
        final s = professorMonthSummary(all, date.substring(0, 7));
        return [
          '${professorMonthName(date.substring(0, 7))} ${date.substring(0, 4)}'
              .toUpperCase(),
          if (items != null) count(s.lessons),
        ].join(' · ');
    }
  }
}

class _PeriodNav extends StatelessWidget {
  const _PeriodNav({
    required this.label,
    required this.isCurrent,
    required this.onPrev,
    required this.onNext,
    required this.onToday,
  });

  final String label;
  final bool isCurrent;
  final VoidCallback onPrev;
  final VoidCallback onNext;
  final VoidCallback onToday;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      children: [
        IconButton(
          key: const Key('professor-agenda-prev'),
          visualDensity: VisualDensity.compact,
          icon: const Icon(Icons.chevron_left_rounded),
          tooltip: 'Anterior',
          onPressed: onPrev,
        ),
        Expanded(
          child: Text(
            label,
            key: const Key('professor-agenda-period'),
            textAlign: TextAlign.center,
            style: ProfessorLinksStyle.display(
              13.5,
              weight: FontWeight.w700,
              color: colors.onSurface,
            ),
          ),
        ),
        if (!isCurrent)
          TextButton(
            key: const Key('professor-agenda-today'),
            onPressed: onToday,
            child: const Text('Hoje'),
          ),
        IconButton(
          key: const Key('professor-agenda-next'),
          visualDensity: VisualDensity.compact,
          icon: const Icon(Icons.chevron_right_rounded),
          tooltip: 'Próximo',
          onPressed: onNext,
        ),
      ],
    );
  }
}

// ── E1 Dia ───────────────────────────────────────────────────────────────

class _DayView extends ConsumerWidget {
  const _DayView({
    required this.items,
    required this.date,
    required this.onPick,
  });

  final List<ProfessorAgendaItem> items;
  final String date;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final now = ref.watch(professorAgendaNowProvider);
    final palette = ref.watch(professorArenaPaletteProvider);
    final entries = professorDayEntries(
      items,
      dateKey: date,
      todayKey: now.todayKey,
      nowMin: now.nowMin,
    );
    final days = professorWeekDays(date);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            for (var i = 0; i < 7; i++) ...[
              if (i > 0) const SizedBox(width: 6),
              Expanded(
                child: _DayTile(
                  key: Key('professor-agenda-day-${days[i]}'),
                  letter: _weekdayLetter[i],
                  day: int.parse(days[i].substring(8)),
                  count: professorLessonCountOn(items, days[i]),
                  selected: days[i] == date,
                  today: days[i] == now.todayKey,
                  onTap: () => onPick(days[i]),
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 12),
        ProfessorArenaLegend(items: professorItemsOn(items, date)),
        const SizedBox(height: 10),
        if (entries.isEmpty)
          const ProfessorLinksCard(
            key: Key('professor-agenda-day-empty'),
            child: ProfessorMutedText('Nenhuma aula neste dia.'),
          ),
        for (final e in entries)
          if (e.isTravel)
            Padding(
              key: Key('professor-agenda-travel-${e.toArena}'),
              padding: const EdgeInsets.fromLTRB(56, 4, 0, 4),
              child: Row(
                children: [
                  Expanded(
                    child: Divider(color: ProfessorLinksStyle.line2(colors)),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'DESLOCAMENTO · ${e.fromArena} → ${e.toArena}'
                        .toUpperCase(),
                    style: ProfessorLinksStyle.mono(
                      9.5,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Divider(color: ProfessorLinksStyle.line2(colors)),
                  ),
                ],
              ),
            )
          else
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 5),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 44,
                    child: Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            e.item!.startLabel,
                            style: ProfessorLinksStyle.mono(
                              13,
                              color: colors.onSurface,
                            ),
                          ),
                          Text(
                            e.item!.endLabel,
                            style: ProfessorLinksStyle.mono(
                              9.5,
                              color: ProfessorLinksStyle.dim(colors),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ProfessorAgendaCard(
                      key: Key('professor-agenda-item-${e.item!.id}'),
                      item: e.item!,
                      color: professorItemColor(palette, e.item!),
                      live: e.phase == ProfessorAgendaPhase.live,
                      dimmed: e.phase == ProfessorAgendaPhase.done,
                      onTap: () => openProfessorAgendaItem(context, e.item!),
                    ),
                  ),
                ],
              ),
            ),
      ],
    );
  }
}

class _DayTile extends StatelessWidget {
  const _DayTile({
    super.key,
    required this.letter,
    required this.day,
    required this.count,
    required this.selected,
    required this.today,
    required this.onTap,
  });

  final String letter;
  final int day;
  final int count;
  final bool selected;
  final bool today;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final fg = selected ? ProfessorLinksStyle.onBrand : colors.onSurface;
    final dim = selected
        ? ProfessorLinksStyle.onBrand
        : ProfessorLinksStyle.dim(colors);
    return Material(
      color: selected ? AppColors.brand : ProfessorLinksStyle.soft(colors),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          height: 58,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected
                  ? Colors.transparent
                  : today
                      ? AppColors.brand.withValues(alpha: 0.5)
                      : ProfessorLinksStyle.line(colors),
            ),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(letter, style: ProfessorLinksStyle.mono(9, color: dim)),
              Text(
                '$day',
                style: ProfessorLinksStyle.display(15,
                    weight: FontWeight.w700, color: fg),
              ),
              Text(
                count == 0 ? '—' : '$count',
                style: ProfessorLinksStyle.mono(8.5, color: dim),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── E2 Semana ────────────────────────────────────────────────────────────

/// Grade da Semana: das 6h às 22h.
const int kProfessorWeekStartHour = 6;
const int kProfessorWeekEndHour = 22;
const double _hourHeight = 30;

class _WeekView extends ConsumerWidget {
  const _WeekView({
    required this.items,
    required this.date,
    required this.onPickDay,
  });

  final List<ProfessorAgendaItem> items;
  final String date;
  final ValueChanged<String> onPickDay;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final now = ref.watch(professorAgendaNowProvider);
    final palette = ref.watch(professorArenaPaletteProvider);
    final days = professorWeekDays(date);
    const startMin = kProfessorWeekStartHour * 60;
    const endMin = kProfessorWeekEndHour * 60;
    const height =
        (kProfessorWeekEndHour - kProfessorWeekStartHour) * _hourHeight;
    double y(int minutes) =>
        (minutes.clamp(startMin, endMin) - startMin) / 60 * _hourHeight;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            const SizedBox(width: 30),
            for (var i = 0; i < 7; i++)
              Expanded(
                child: InkWell(
                  key: Key('professor-agenda-week-head-${days[i]}'),
                  onTap: () => onPickDay(days[i]),
                  child: Column(
                    children: [
                      Text(
                        _weekdayShort[i],
                        style: ProfessorLinksStyle.mono(
                          9.5,
                          color: days[i] == now.todayKey
                              ? AppColors.brand
                              : ProfessorLinksStyle.dim(colors),
                        ),
                      ),
                      Text(
                        '${int.parse(days[i].substring(8))}',
                        style: ProfessorLinksStyle.display(
                          13,
                          weight: FontWeight.w700,
                          color: days[i] == now.todayKey
                              ? AppColors.brand
                              : colors.onSurface,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 6),
        SizedBox(
          height: height,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                width: 30,
                child: Column(
                  children: [
                    for (var h = kProfessorWeekStartHour;
                        h < kProfessorWeekEndHour;
                        h++)
                      SizedBox(
                        height: _hourHeight,
                        child: Align(
                          alignment: Alignment.topLeft,
                          child: Text(
                            '${h}h',
                            style: ProfessorLinksStyle.mono(
                              8.5,
                              color: ProfessorLinksStyle.dim(colors),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              for (final d in days)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 1.5),
                    child: Container(
                      key: Key('professor-agenda-week-col-$d'),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(8),
                        color: d == now.todayKey
                            ? AppColors.brand.withValues(alpha: 0.04)
                            : ProfessorLinksStyle.soft(colors),
                      ),
                      child: Stack(
                        clipBehavior: Clip.hardEdge,
                        children: [
                          for (final i in professorItemsOn(items, d))
                            if (i.endMin > startMin && i.startMin < endMin)
                              Positioned(
                                left: 1,
                                right: 1,
                                top: y(i.startMin) + 1,
                                height: (y(i.endMin) - y(i.startMin) - 2).clamp(
                                  6,
                                  height,
                                ),
                                child: _WeekBlock(
                                  key: Key('professor-agenda-block-${i.id}'),
                                  item: i,
                                  color: professorItemColor(palette, i),
                                  onTap: () =>
                                      openProfessorAgendaItem(context, i),
                                ),
                              ),
                          if (d == now.todayKey &&
                              now.nowMin >= startMin &&
                              now.nowMin <= endMin)
                            Positioned(
                              key: const Key('professor-agenda-now-line'),
                              left: 0,
                              right: 0,
                              top: y(now.nowMin),
                              height: 2,
                              child: IgnorePointer(
                                child: ColoredBox(
                                  color: AppColors.live.withValues(alpha: 0.7),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 10,
          runSpacing: 4,
          children: [
            for (final (k, l) in const [
              ('T', 'Turma'),
              ('P', 'Particular'),
              ('D', 'Dupla'),
              ('E', 'Experimental'),
              ('R', 'Reposição'),
              ('B', 'Bloqueio'),
            ])
              Text.rich(
                TextSpan(children: [
                  TextSpan(
                    text: '$k ',
                    style: ProfessorLinksStyle.mono(
                      10,
                      color: ProfessorLinksStyle.mute(colors),
                    ),
                  ),
                  TextSpan(text: l),
                ]),
                style: AppTypography.bodyS.copyWith(
                  fontSize: 10.5,
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ),
          ],
        ),
        const SizedBox(height: 10),
        ProfessorArenaLegend(items: items),
      ],
    );
  }
}

class _WeekBlock extends StatelessWidget {
  const _WeekBlock({
    super.key,
    required this.item,
    required this.color,
    required this.onTap,
  });

  final ProfessorAgendaItem item;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: '${item.typeLabel} ${item.title} ${item.startLabel}',
      child: GestureDetector(
        onTap: onTap,
        child: Opacity(
          opacity: item.canceled ? 0.4 : 1,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: CustomPaint(
              painter: item.isBlock ? const ProfessorHatchPainter() : null,
              child: Container(
                decoration: BoxDecoration(
                  color: item.isBlock ? null : color.withValues(alpha: 0.19),
                  border: Border(left: BorderSide(color: color, width: 2)),
                ),
                alignment: Alignment.center,
                child: Text(
                  item.letter,
                  style: ProfessorLinksStyle.mono(8.5, color: color),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ── E3 Mês ───────────────────────────────────────────────────────────────

class _MonthView extends ConsumerWidget {
  const _MonthView({
    required this.items,
    required this.date,
    required this.onPickDay,
  });

  final List<ProfessorAgendaItem> items;
  final String date;
  final ValueChanged<String> onPickDay;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final todayKey = ref.watch(professorAgendaNowProvider).todayKey;
    final grid = professorMonthGrid(date);
    final blocked = professorBlockedDays(items);
    final summary = professorMonthSummary(items, date.substring(0, 7));

    Widget cell(String d) {
      final n = professorLessonCountOn(items, d);
      final isToday = d == todayKey;
      final isBlocked = blocked.contains(d);
      final past = d.compareTo(todayKey) < 0;
      return Opacity(
        opacity: past && !isToday ? 0.55 : 1,
        child: GestureDetector(
          key: Key('professor-agenda-month-$d'),
          onTap: () => onPickDay(d),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(11),
            child: CustomPaint(
              painter:
                  isBlocked && !isToday ? const ProfessorHatchPainter() : null,
              child: Container(
                height: 50,
                padding: const EdgeInsets.only(top: 6),
                decoration: BoxDecoration(
                  color: isToday
                      ? AppColors.brand
                      : isBlocked
                          ? null
                          : ProfessorLinksStyle.soft(colors),
                  borderRadius: BorderRadius.circular(11),
                  border: Border.all(
                    color: isToday
                        ? Colors.transparent
                        : isBlocked
                            ? AppColors.live.withValues(alpha: 0.3)
                            : ProfessorLinksStyle.line(colors),
                  ),
                ),
                child: Column(
                  children: [
                    Text(
                      '${int.parse(d.substring(8))}',
                      style: ProfessorLinksStyle.display(
                        13,
                        weight: FontWeight.w700,
                        color: isToday
                            ? ProfessorLinksStyle.onBrand
                            : colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        for (var k = 0; k < (n > 4 ? 4 : n); k++)
                          Container(
                            width: 4,
                            height: 4,
                            margin: const EdgeInsets.symmetric(horizontal: 1),
                            decoration: BoxDecoration(
                              color: isToday
                                  ? ProfessorLinksStyle.onBrand
                                  : AppColors.brand,
                              shape: BoxShape.circle,
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    }

    final cells = <Widget>[
      for (var i = 0; i < grid.leading; i++) const SizedBox.shrink(),
      for (final d in grid.days) cell(d),
    ];
    final rows = <List<Widget>>[];
    for (var i = 0; i < cells.length; i += 7) {
      rows.add(cells.sublist(i, (i + 7).clamp(0, cells.length)));
    }

    Widget stat(String value, String label, Key key, {Color? color}) =>
        Expanded(
          child: Container(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
            decoration: BoxDecoration(
              color: ProfessorLinksStyle.soft(colors),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: ProfessorLinksStyle.line(colors)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  value,
                  key: key,
                  style: ProfessorLinksStyle.display(
                    17,
                    color: color ?? colors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  label,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 10.5,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ],
            ),
          ),
        );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            for (final l in _weekdayLetter)
              Expanded(
                child: Center(
                  child: Text(
                    l,
                    style: ProfessorLinksStyle.mono(
                      9.5,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 6),
        for (final row in rows)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Row(
              children: [
                for (var i = 0; i < 7; i++) ...[
                  if (i > 0) const SizedBox(width: 4),
                  Expanded(
                    child: i < row.length ? row[i] : const SizedBox.shrink(),
                  ),
                ],
              ],
            ),
          ),
        const SizedBox(height: 10),
        Row(
          children: [
            stat('${summary.lessons}', 'aulas',
                const Key('professor-agenda-month-lessons')),
            const SizedBox(width: 8),
            stat(summary.hoursLabel, 'em quadra',
                const Key('professor-agenda-month-hours')),
            const SizedBox(width: 8),
            stat(
              '${summary.blockedDays}',
              'dia${summary.blockedDays == 1 ? '' : 's'} bloqueado'
                  '${summary.blockedDays == 1 ? '' : 's'}',
              const Key('professor-agenda-month-blocked'),
              color: summary.blockedDays > 0 ? AppColors.live : null,
            ),
          ],
        ),
        const SizedBox(height: 10),
        ProfessorArenaLegend(items: items),
      ],
    );
  }
}

// ── "+" ──────────────────────────────────────────────────────────────────

/// "+" da Agenda: bloquear período e, para o independente, "Nova aula" para
/// um aluno da carteira (o fluxo da fase 4).
Future<void> showProfessorAgendaAddSheet(
  BuildContext context,
  WidgetRef ref,
) {
  return showProfessorLinksSheet<void>(
    context,
    builder: (sheetContext) => Consumer(
      builder: (context, ref, _) {
        final colors = context.themeColors;
        final independent = ref.watch(professorHasIndependentLinkProvider);
        final students = [
          for (final s
              in ref.watch(professorWalletStudentsProvider).valueOrNull ??
                  const [])
            if (s.active) s,
        ];
        final links = ref.watch(myProfessorLinksProvider).valueOrNull;
        final arenas = links == null ? null : professorLessonArenas(links);
        final canLesson = students.isNotEmpty && (arenas?.isNotEmpty ?? false);

        Widget option({
          required Key key,
          required IconData icon,
          required String title,
          required String subtitle,
          VoidCallback? onTap,
        }) =>
            ProfessorLinksCard(
              key: key,
              onTap: onTap,
              child: Opacity(
                opacity: onTap == null ? 0.5 : 1,
                child: Row(
                  children: [
                    Icon(icon, color: AppColors.brand),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            title,
                            style: ProfessorLinksStyle.display(
                              14,
                              weight: FontWeight.w700,
                              color: colors.onSurface,
                            ),
                          ),
                          const SizedBox(height: 2),
                          ProfessorMutedText(subtitle),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            );

        return ProfessorLinksSheetBody(
          title: 'Adicionar à agenda',
          children: [
            const SizedBox(height: 14),
            option(
              key: const Key('professor-agenda-add-block'),
              icon: Icons.block_rounded,
              title: 'Bloquear período',
              subtitle: 'Folga, torneio, viagem ou saúde',
              onTap: () {
                Navigator.of(sheetContext).pop();
                context.pushNamed(AppRouteNames.professorBlockNew);
              },
            ),
            if (independent) ...[
              const SizedBox(height: 10),
              option(
                key: const Key('professor-agenda-add-lesson'),
                icon: Icons.event_available_outlined,
                title: 'Nova aula',
                subtitle: 'Para um aluno da sua carteira · você reserva a '
                    'quadra',
                onTap: canLesson
                    ? () async {
                        final athleteId = await _pickStudent(
                          sheetContext,
                          [for (final s in students) (s.athleteId, s.name)],
                        );
                        if (athleteId == null || !context.mounted) return;
                        if (sheetContext.mounted) {
                          Navigator.of(sheetContext).pop();
                        }
                        await startProfessorLesson(
                          context,
                          ref,
                          athleteId: athleteId,
                          arenas: arenas!,
                        );
                      }
                    : null,
              ),
              if (!canLesson) ...[
                const SizedBox(height: 6),
                ProfessorActionHint(
                  students.isEmpty
                      ? 'Adicione alunos à carteira em Mais › Carteira própria.'
                      : 'Peça a uma arena um vínculo independente com '
                          '"Reservar quadras".',
                ),
              ],
            ],
          ],
        );
      },
    ),
  );
}

Future<String?> _pickStudent(
  BuildContext context,
  List<(String, String)> students,
) =>
    showProfessorLinksSheet<String>(
      context,
      builder: (sheetContext) => ProfessorLinksSheetBody(
        title: 'Aula para quem?',
        children: [
          for (final (id, name) in students) ...[
            const SizedBox(height: 8),
            ProfessorLinksCard(
              key: Key('professor-agenda-pick-$id'),
              onTap: () => Navigator.of(sheetContext).pop(id),
              child: Text(
                name,
                style: ProfessorLinksStyle.display(
                  14,
                  weight: FontWeight.w600,
                  color: sheetContext.themeColors.onSurface,
                ),
              ),
            ),
          ],
        ],
      ),
    );
