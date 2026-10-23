import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../../professor_mode/domain/professor_agenda.dart';
import '../../../professor_mode/presentation/agenda/professor_agenda_widgets.dart'
    show kProfessorArenaColors;
import '../../domain/center_agenda.dart';
import '../../domain/center_coach.dart';

/// Visões Semana e Mês da agenda do centro e a navegação de período — o
/// mesmo desenho da Agenda do Professor (E1–E3), com a cor de cada turma.

const _weekdayShort = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const _weekdayLetter = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

/// Cor de cada turma (mesma paleta das arenas na agenda do Professor).
Map<String, Color> centerClassColors(Iterable<CenterCoachSession> sessions) {
  final palette = professorArenaPalette(sessions.map((s) => s.classId));
  return {
    for (final e in palette.entries)
      e.key: kProfessorArenaColors[e.value % kProfessorArenaColors.length],
  };
}

Color centerClassColor(Map<String, Color> colors, String classId) =>
    colors[classId] ?? AppColors.brandHover;

/// ‹ período › com "Hoje" quando o período não contém hoje.
class CenterAgendaPeriodNav extends StatelessWidget {
  const CenterAgendaPeriodNav({
    super.key,
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
          key: const Key('center-agenda-prev'),
          visualDensity: VisualDensity.compact,
          icon: const Icon(Icons.chevron_left_rounded),
          tooltip: 'Anterior',
          onPressed: onPrev,
        ),
        Expanded(
          child: Text(
            label,
            key: const Key('center-agenda-period'),
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
            key: const Key('center-agenda-today'),
            onPressed: onToday,
            child: const Text('Hoje'),
          ),
        IconButton(
          key: const Key('center-agenda-next'),
          visualDensity: VisualDensity.compact,
          icon: const Icon(Icons.chevron_right_rounded),
          tooltip: 'Próximo',
          onPressed: onNext,
        ),
      ],
    );
  }
}

/// Legenda das turmas (bolinha + nome).
class CenterAgendaLegend extends StatelessWidget {
  const CenterAgendaLegend({
    super.key,
    required this.sessions,
    required this.classColors,
  });

  final List<CenterCoachSession> sessions;
  final Map<String, Color> classColors;

  @override
  Widget build(BuildContext context) {
    final names = <String, String>{
      for (final s in sessions)
        if (!s.isCancelled) s.classId: s.className,
    };
    if (names.length < 2) return const SizedBox.shrink();
    final entries = names.entries.toList()
      ..sort((a, b) => a.value.compareTo(b.value));
    return Wrap(
      spacing: 14,
      runSpacing: 6,
      children: [
        for (final e in entries)
          Row(
            key: Key('center-agenda-legend-${e.key}'),
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: centerClassColor(classColors, e.key),
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 6),
              Text(
                e.value,
                style: AppTypography.bodyS.copyWith(
                  fontSize: 11,
                  color: ProfessorLinksStyle.mute(context.themeColors),
                ),
              ),
            ],
          ),
      ],
    );
  }
}

// ── Semana ───────────────────────────────────────────────────────────────

const int _startHour = 6;
const int _endHour = 22;
const double _hourHeight = 30;

/// Grade da semana (6h–22h): um bloco por aula, na cor da turma; tocar no
/// dia abre o Dia, tocar no bloco abre a aula.
class CenterAgendaWeekView extends StatelessWidget {
  const CenterAgendaWeekView({
    super.key,
    required this.sessions,
    required this.date,
    required this.todayKey,
    required this.nowMin,
    required this.classColors,
    required this.onPickDay,
    required this.onOpen,
  });

  final List<CenterCoachSession> sessions;
  final String date;
  final String todayKey;
  final int nowMin;
  final Map<String, Color> classColors;
  final ValueChanged<String> onPickDay;
  final ValueChanged<CenterCoachSession> onOpen;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final days = professorWeekDays(date);
    const startMin = _startHour * 60;
    const endMin = _endHour * 60;
    const height = (_endHour - _startHour) * _hourHeight;
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
                  key: Key('center-agenda-week-head-${days[i]}'),
                  onTap: () => onPickDay(days[i]),
                  child: Column(
                    children: [
                      Text(
                        _weekdayShort[i],
                        style: ProfessorLinksStyle.mono(
                          9.5,
                          color: days[i] == todayKey
                              ? colors.brandText
                              : ProfessorLinksStyle.dim(colors),
                        ),
                      ),
                      Text(
                        '${int.parse(days[i].substring(8))}',
                        style: ProfessorLinksStyle.display(
                          13,
                          weight: FontWeight.w700,
                          color: days[i] == todayKey
                              ? colors.brandText
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
                    for (var h = _startHour; h < _endHour; h++)
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
                      key: Key('center-agenda-week-col-$d'),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(8),
                        color: d == todayKey
                            ? AppColors.brand.withValues(alpha: 0.04)
                            : ProfessorLinksStyle.soft(colors),
                      ),
                      child: Stack(
                        clipBehavior: Clip.hardEdge,
                        children: [
                          for (final s in centerSessionsOn(sessions, d))
                            if (centerSessionMinutes(s) case final m?
                                when m.end > startMin && m.start < endMin)
                              Positioned(
                                left: 1,
                                right: 1,
                                top: y(m.start) + 1,
                                height: (y(m.end) - y(m.start) - 2).clamp(
                                  6,
                                  height,
                                ),
                                child: _WeekBlock(
                                  key: Key('center-agenda-block-${s.id}'),
                                  session: s,
                                  color: centerClassColor(
                                    classColors,
                                    s.classId,
                                  ),
                                  onTap: () => onOpen(s),
                                ),
                              ),
                          if (d == todayKey &&
                              nowMin >= startMin &&
                              nowMin <= endMin)
                            Positioned(
                              key: const Key('center-agenda-now-line'),
                              left: 0,
                              right: 0,
                              top: y(nowMin),
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
        CenterAgendaLegend(sessions: sessions, classColors: classColors),
      ],
    );
  }
}

class _WeekBlock extends StatelessWidget {
  const _WeekBlock({
    super.key,
    required this.session,
    required this.color,
    required this.onTap,
  });

  final CenterCoachSession session;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final s = session;
    final letter =
        s.className.trim().isEmpty ? 'A' : s.className.trim()[0].toUpperCase();
    return Semantics(
      button: true,
      label: '${s.className} ${s.startTime}',
      child: GestureDetector(
        onTap: onTap,
        child: Opacity(
          opacity: s.isCancelled ? 0.35 : 1,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: Container(
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.19),
                border: Border(left: BorderSide(color: color, width: 2)),
              ),
              alignment: Alignment.center,
              child: Text(
                letter,
                style: ProfessorLinksStyle.mono(8.5, color: color),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ── Mês ──────────────────────────────────────────────────────────────────

/// Calendário do mês: bolinhas por aula, hoje em laranja; tocar abre o Dia.
class CenterAgendaMonthView extends StatelessWidget {
  const CenterAgendaMonthView({
    super.key,
    required this.sessions,
    required this.date,
    required this.todayKey,
    required this.classColors,
    required this.onPickDay,
  });

  final List<CenterCoachSession> sessions;
  final String date;
  final String todayKey;
  final Map<String, Color> classColors;
  final ValueChanged<String> onPickDay;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final grid = professorMonthGrid(date);
    final summary = centerMonthSummary(sessions, date.substring(0, 7));

    Widget cell(String d) {
      final n = centerSessionCountOn(sessions, d);
      final isToday = d == todayKey;
      final past = d.compareTo(todayKey) < 0;
      return Opacity(
        opacity: past && !isToday ? 0.55 : 1,
        child: GestureDetector(
          key: Key('center-agenda-month-$d'),
          onTap: () => onPickDay(d),
          child: Container(
            height: 50,
            padding: const EdgeInsets.only(top: 6),
            decoration: BoxDecoration(
              color:
                  isToday ? AppColors.brand : ProfessorLinksStyle.soft(colors),
              borderRadius: BorderRadius.circular(11),
              border: Border.all(
                color: isToday
                    ? Colors.transparent
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
            stat(
              '${summary.sessions}',
              summary.sessions == 1 ? 'aula' : 'aulas',
              const Key('center-agenda-month-sessions'),
            ),
            const SizedBox(width: 8),
            stat(
              centerHoursLabel(summary.minutes),
              'em quadra',
              const Key('center-agenda-month-hours'),
            ),
            const SizedBox(width: 8),
            stat(
              '${summary.cancelled}',
              summary.cancelled == 1 ? 'cancelada' : 'canceladas',
              const Key('center-agenda-month-cancelled'),
              color: summary.cancelled > 0 ? AppColors.live : null,
            ),
          ],
        ),
        const SizedBox(height: 10),
        CenterAgendaLegend(sessions: sessions, classColors: classColors),
      ],
    );
  }
}
