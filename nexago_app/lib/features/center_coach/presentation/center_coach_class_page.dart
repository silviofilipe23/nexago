import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/time/nexago_event_timezone.dart';
import '../../arena/domain/aulas/arena_class_logic.dart';
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../athlete_training/domain/athlete_training.dart'
    show trainingWeekdayDay;
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/center_coach_providers.dart';
import '../domain/center_coach.dart';
import 'center_coach_agenda_page.dart' show openCoachSession;
import 'widgets/center_coach_widgets.dart';

enum _Tab { classes, students }

/// Janela do histórico: 90 dias para trás e as próximas 3 semanas.
const int kCoachHistoryDays = 90;

/// P8 · Histórico da turma: presença, vagas, aulas (com correções) e os
/// alunos da turma com a frequência de cada um.
class CenterCoachClassPage extends ConsumerStatefulWidget {
  const CenterCoachClassPage({
    super.key,
    required this.centerId,
    required this.classId,
  });

  final String centerId;
  final String classId;

  @override
  ConsumerState<CenterCoachClassPage> createState() =>
      _CenterCoachClassPageState();
}

class _CenterCoachClassPageState extends ConsumerState<CenterCoachClassPage> {
  _Tab _tab = _Tab.classes;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final today = nexagoEventDayKey(ref.watch(professorLinksClockProvider)());
    CenterCoachClass? cls;
    for (final c
        in ref.watch(coachClassesProvider(widget.centerId)).valueOrNull ??
            const <CenterCoachClass>[]) {
      if (c.id == widget.classId) cls = c;
    }
    final range = (
      centerId: widget.centerId,
      classId: widget.classId,
      fromKey: coachShiftDay(today, -kCoachHistoryDays),
      toKey: coachShiftDay(today, 21),
    );
    final async = ref.watch(coachClassSessionsProvider(range));
    final sessions = async.valueOrNull ?? const <CenterCoachSession>[];
    final past = [
      for (final s in sessions)
        if (s.date.compareTo(today) <= 0) s,
    ];
    final presence = classPresencePercent(past);
    final cancelled = past.where((s) => s.isCancelled).length;
    final students =
        ref.watch(coachStudentsProvider(widget.centerId)).valueOrNull ??
        const {};

    return ProfessorLinksScaffold(
      title: cls?.name ?? 'Turma',
      subtitle: cls == null
          ? null
          : [
              coachClassScheduleLabel(cls),
              if (cls.courtName.isNotEmpty) cls.courtName,
            ].where((s) => s.isNotEmpty).join(' · ').toUpperCase(),
      onBack: () => popOrGo(context, AppRoutes.centerCoachAgenda),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          ArenaClassSegmented<_Tab>(
            items: const [(_Tab.classes, 'Aulas'), (_Tab.students, 'Alunos')],
            selected: _tab,
            onChanged: (t) => setState(() => _tab = t),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              for (final (v, l) in [
                (presence == null ? '—' : '$presence%', 'presença'),
                (
                  cls == null ? '—' : '${cls.seatsTaken}/${cls.capacity}',
                  'vagas',
                ),
                ('$cancelled', cancelled == 1 ? 'cancelada' : 'canceladas'),
              ]) ...[
                Expanded(
                  child: _Stat(value: v, label: l),
                ),
                if (l != 'cancelada' && l != 'canceladas')
                  const SizedBox(width: 8),
              ],
            ],
          ),
          const SizedBox(height: 12),
          if (async.isLoading && async.valueOrNull == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 30),
              child: Center(
                child: CircularProgressIndicator(color: AppColors.brand),
              ),
            )
          else if (async.hasError && async.valueOrNull == null)
            ProfessorRetryCard(
              message: 'Não foi possível carregar o histórico da turma.',
              onRetry: () => ref.invalidate(coachClassSessionsProvider(range)),
            )
          else if (_tab == _Tab.classes)
            _sessionsList(context, colors, past)
          else
            _studentsList(colors, cls, past, students),
        ],
      ),
    );
  }

  Widget _sessionsList(
    BuildContext context,
    AppThemeColors colors,
    List<CenterCoachSession> past,
  ) {
    if (past.isEmpty) {
      return const ProfessorLinksCard(
        child: ProfessorMutedText('Nenhuma aula passada nos últimos 90 dias.'),
      );
    }
    return ProfessorLinksCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (final (i, s) in past.indexed)
            InkWell(
              key: Key('center-coach-history-${s.id}'),
              onTap: () => openCoachSession(context, widget.centerId, s.id),
              child: Container(
                padding: const EdgeInsets.fromLTRB(14, 13, 14, 13),
                decoration: BoxDecoration(
                  border: i == 0
                      ? null
                      : Border(
                          top: BorderSide(
                            color: ProfessorLinksStyle.line(colors),
                          ),
                        ),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            trainingWeekdayDay(s.date),
                            style: ProfessorLinksStyle.display(
                              13.5,
                              weight: FontWeight.w600,
                              color: s.isCancelled
                                  ? ProfessorLinksStyle.dim(colors)
                                  : colors.onSurface,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            _statusOf(s),
                            style: AppTypography.bodyS.copyWith(
                              fontSize: 11,
                              color: s.isCancelled
                                  ? colors.readableTone(AppColors.live)
                                  : !s.isDone
                                  ? colors.readableTone(AppColors.pending)
                                  : ProfessorLinksStyle.dim(colors),
                            ),
                          ),
                        ],
                      ),
                    ),
                    Text(
                      s.isCancelled || s.attendance.isEmpty
                          ? '—'
                          : '${s.attendance.values.where((m) => m == CenterMark.present).length}/${s.attendance.length}',
                      style: ProfessorLinksStyle.mono(
                        12,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Icon(
                      Icons.chevron_right_rounded,
                      size: 16,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _studentsList(
    AppThemeColors colors,
    CenterCoachClass? cls,
    List<CenterCoachSession> past,
    Map<String, CenterCoachStudent> students,
  ) {
    final ids = cls?.rosterStudentIds ?? const <String>[];
    if (ids.isEmpty) {
      return const ProfessorLinksCard(
        child: ProfessorMutedText('Nenhum aluno matriculado nesta turma.'),
      );
    }
    return Column(
      children: [
        for (final id in ids) ...[
          Builder(
            builder: (context) {
              final marks = [
                for (final s in past)
                  if (s.isDone && s.attendance[id] != null) s.attendance[id]!,
              ];
              final present = marks
                  .where((m) => m == CenterMark.present)
                  .length;
              final st = students[id];
              final name = st?.name ?? 'Aluno';
              return ProfessorLinksCard(
                key: Key('center-coach-class-student-$id'),
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    ArenaClassAvatar(
                      initials: arenaClassInitials(name),
                      size: 34,
                    ),
                    const SizedBox(width: 11),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            name,
                            style: ProfessorLinksStyle.display(
                              13.5,
                              weight: FontWeight.w700,
                              color: colors.onSurface,
                            ),
                          ),
                          Text(
                            [
                              marks.isEmpty
                                  ? 'Sem chamada ainda'
                                  : '$present de ${marks.length} aulas',
                              if ((st?.makeupCredits ?? 0) > 0)
                                '${st!.makeupCredits} reposição',
                              if (st?.isMinor ?? false) 'Menor',
                            ].join(' · '),
                            style: AppTypography.bodyS.copyWith(
                              fontSize: 11,
                              color: ProfessorLinksStyle.dim(colors),
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (st?.billingHold ?? false)
                      const ArenaClassTag(
                        label: 'Pendência',
                        color: AppColors.live,
                      ),
                    if (marks.isNotEmpty) ...[
                      const SizedBox(width: 8),
                      Text(
                        '${(present * 100 / marks.length).round()}%',
                        style: ProfessorLinksStyle.mono(
                          12,
                          color: colors.onSurface,
                        ),
                      ),
                    ],
                  ],
                ),
              );
            },
          ),
          const SizedBox(height: 8),
        ],
      ],
    );
  }
}

String _statusOf(CenterCoachSession s) {
  if (s.isCancelled) {
    return 'Cancelada${s.changeReason.isEmpty ? '' : ' · ${s.changeReason}'}';
  }
  if (!s.isDone) return 'Chamada não finalizada';
  final fixes = s.attendanceLog.length;
  return [
    'Finalizada',
    if (fixes > 0) fixes == 1 ? '1 correção' : '$fixes correções',
  ].join(' · ');
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 11, 12, 11),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ProfessorLinksStyle.line(colors)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: ProfessorLinksStyle.display(17, color: colors.onSurface),
          ),
          Text(
            label,
            style: AppTypography.bodyS.copyWith(
              fontSize: 10.5,
              color: ProfessorLinksStyle.dim(colors),
            ),
          ),
        ],
      ),
    );
  }
}
