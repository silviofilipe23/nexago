import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/agenda/nexa_agenda.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../../professor_mode/domain/professor_agenda.dart';
import '../../../professor_mode/presentation/agenda/professor_agenda_widgets.dart'
    show kProfessorArenaColors;
import '../../domain/center_agenda.dart';
import '../../domain/center_coach.dart';

/// Semana e Mês da agenda do centro sobre o componente da agenda
/// (`NexaAgenda*`, o mesmo da Agenda do Professor), com a cor de cada turma.

const String kCenterAgendaKeys = 'center-agenda';

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

/// Legenda das turmas (bolinha + nome), com duas ou mais turmas.
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
            key: Key('$kCenterAgendaKeys-legend-${e.key}'),
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

/// Semana: um bloco por aula na cor da turma (inicial do nome).
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
    final byId = {for (final s in sessions) s.id: s};
    return NexaAgendaWeekGrid(
      keyPrefix: kCenterAgendaKeys,
      days: professorWeekDays(date),
      todayKey: todayKey,
      nowMin: nowMin,
      blocks: [
        for (final s in sessions)
          if (centerSessionMinutes(s) case final m?)
            NexaAgendaBlock(
              id: s.id,
              date: s.date,
              startMin: m.start,
              endMin: m.end,
              color: centerClassColor(classColors, s.classId),
              letter: s.className.trim().isEmpty
                  ? 'A'
                  : s.className.trim()[0].toUpperCase(),
              semanticLabel: '${s.className} ${s.startTime}',
              faded: s.isCancelled,
            ),
      ],
      onPickDay: onPickDay,
      onOpen: (id) {
        final s = byId[id];
        if (s != null) onOpen(s);
      },
      footer: [
        CenterAgendaLegend(sessions: sessions, classColors: classColors),
      ],
    );
  }
}

/// Mês: bolinhas por aula; rodapé com aulas, horas em quadra e canceladas.
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
    final grid = professorMonthGrid(date);
    final summary = centerMonthSummary(sessions, date.substring(0, 7));
    return NexaAgendaMonthGrid(
      keyPrefix: kCenterAgendaKeys,
      days: grid.days,
      leading: grid.leading,
      todayKey: todayKey,
      countOf: (d) => centerSessionCountOn(sessions, d),
      onPickDay: onPickDay,
      footer: [
        NexaAgendaStats(
          stats: [
            (
              value: '${summary.sessions}',
              label: summary.sessions == 1 ? 'aula' : 'aulas',
              key: const Key('$kCenterAgendaKeys-month-sessions'),
              color: null,
            ),
            (
              value: centerHoursLabel(summary.minutes),
              label: 'em quadra',
              key: const Key('$kCenterAgendaKeys-month-hours'),
              color: null,
            ),
            (
              value: '${summary.cancelled}',
              label: summary.cancelled == 1 ? 'cancelada' : 'canceladas',
              key: const Key('$kCenterAgendaKeys-month-cancelled'),
              color: summary.cancelled > 0 ? AppColors.live : null,
            ),
          ],
        ),
        CenterAgendaLegend(sessions: sessions, classColors: classColors),
      ],
    );
  }
}
