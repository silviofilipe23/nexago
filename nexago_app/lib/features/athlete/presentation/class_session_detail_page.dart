import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../arena/domain/aulas/arena_class.dart';
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../arenas/domain/arena_booking_labels.dart';
import '../../professor_mode/domain/professor_lesson_plans.dart'
    show LessonPlanKind;
import '../../professor_mode/presentation/lesson_plans/athlete_lesson_plan_pages.dart'
    show AthleteLessonPlanLink;
import '../domain/agenda/athlete_agenda_logic.dart';
import '../domain/agenda/class_agenda_entry.dart';
import '../domain/agenda/class_story.dart';
import 'class_story_page.dart';

/// Abre o detalhe da aula por cima do shell.
Future<void> openClassSessionDetail(
  BuildContext context,
  ClassAgendaEntry session,
) {
  return Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) => ClassSessionDetailPage(session: session),
    ),
  );
}

/// Agenda · F2 — detalhe da aula do aluno: números do treino, professor,
/// onde e quando, a chamada e, com a aula concluída, "Compartilhar no story".
class ClassSessionDetailPage extends ConsumerWidget {
  const ClassSessionDetailPage({super.key, required this.session, this.now});

  final ClassAgendaEntry session;

  /// Relógio injetável para teste.
  final DateTime? now;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final shareable = isClassStoryShareable(session, now ?? DateTime.now());
    final stats = watchClassStoryStats(ref, session);
    final statusLabel = classAgendaStatusLabel(session);
    final date = formatTicketDateCompact(session.date).replaceAll('•', '·');
    final teacher = session.teacherName.trim();

    return Scaffold(
      backgroundColor: colors.canvas,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ArenaClassHeader(
              eyebrow: '$date · $statusLabel',
              title: session.className,
              onBack: () => Navigator.of(context).maybePop(),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                children: [
                  if (shareable) ...[
                    _StatsCard(stats: stats),
                    const SizedBox(height: 18),
                  ],
                  if (teacher.isNotEmpty) ...[
                    Row(
                      children: [
                        ArenaClassAvatar(
                          initials: _initials(teacher),
                          size: 40,
                        ),
                        const SizedBox(width: 11),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                teacher,
                                style: AppTypography.soraRegular(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w700,
                                  color: colors.onSurface,
                                ),
                              ),
                              Text(
                                'Professor',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: colors.onSurfaceMuted,
                                ),
                              ),
                            ],
                          ),
                        ),
                        ArenaClassTypeTag(
                          type: ArenaClassTypeX.fromId(session.classType),
                        ),
                      ],
                    ),
                    const SizedBox(height: 18),
                  ],
                  _InfoRow(
                    icon: Icons.place_outlined,
                    text: [
                      session.arenaName,
                      if (session.courtName.isNotEmpty) session.courtName,
                    ].join(' · '),
                  ),
                  _InfoRow(
                    icon: Icons.schedule_rounded,
                    text: [
                      date,
                      [session.startTime, session.endTime]
                          .where((s) => s.isNotEmpty)
                          .join('–'),
                    ].join(' · '),
                  ),
                  _InfoRow(
                    icon: Icons.fact_check_outlined,
                    text: _attendanceText(session),
                  ),
                  // Plano da aula publicado pelo professor (H8).
                  if (!session.isCanceled)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: AthleteLessonPlanLink(
                        kind: LessonPlanKind.session,
                        refId: session.sessionId,
                      ),
                    ),
                ],
              ),
            ),
            if (shareable)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: SizedBox(
                  height: 52,
                  child: FilledButton.icon(
                    key: const Key('class-detail-story'),
                    onPressed: () => openClassStory(context, session),
                    icon: const Icon(Icons.amp_stories_outlined, size: 18),
                    label: Text(
                      'Compartilhar no story',
                      style: AppTypography.soraRegular(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brand,
                      foregroundColor: const Color(0xFF0A0A0A),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
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

String _attendanceText(ClassAgendaEntry e) {
  if (e.isCanceled) return 'Aula cancelada pela arena';
  return switch (e.myMark) {
    'present' => 'Presença confirmada na chamada',
    'absent' => 'Falta na chamada',
    'excused' => 'Falta justificada',
    _ => 'Chamada ainda não feita',
  };
}

String _initials(String name) {
  final parts =
      name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  return '${parts.first[0]}${parts.length > 1 ? parts.last[0] : ''}'
      .toUpperCase();
}

class _StatsCard extends StatelessWidget {
  const _StatsCard({required this.stats});

  final ClassStoryStats stats;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final cells = <(String, String)>[
      if (stats.minutes != null) ('${stats.minutes}′', 'Duração'),
      ('${stats.monthOrdinal}º', 'Treino do mês'),
      ('${stats.weekStreak} sem.', 'Sequência'),
    ];
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.onSurface.withValues(alpha: 0.08)),
      ),
      child: Row(
        children: [
          for (var i = 0; i < cells.length; i++)
            Expanded(
              child: Container(
                padding: EdgeInsets.only(left: i == 0 ? 0 : 12),
                decoration: i == 0
                    ? null
                    : BoxDecoration(
                        border: Border(
                          left: BorderSide(
                            color: colors.onSurface.withValues(alpha: 0.08),
                          ),
                        ),
                      ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      cells[i].$1,
                      style: AppTypography.soraRegular(
                        fontSize: 19,
                        fontWeight: FontWeight.w800,
                        color: i == cells.length - 1
                            ? colors.brandText
                            : colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      cells[i].$2,
                      style: TextStyle(
                        fontSize: 11,
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Icon(icon, size: 18, color: colors.onSurfaceMuted),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: TextStyle(fontSize: 13.5, color: colors.onSurface),
            ),
          ),
        ],
      ),
    );
  }
}
