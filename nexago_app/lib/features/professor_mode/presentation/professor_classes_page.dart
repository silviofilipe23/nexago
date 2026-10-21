import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../arena/domain/aulas/arena_class.dart';
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../application/professor_own_classes_providers.dart';
import '../application/professor_students_providers.dart';
import '../domain/professor_students.dart';
import '../domain/professor_students_logic.dart';
import 'own_classes/professor_own_classes_section.dart';
import 'widgets/professor_students_widgets.dart';

/// Minhas turmas (A4), aberta pelo Mais: as turmas em que o professor dá
/// aula, com vagas, presença, próxima aula e a fila de espera.
class ProfessorClassesPage extends ConsumerWidget {
  const ProfessorClassesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(professorStudentsProvider);
    final snapshot = async.valueOrNull;
    final classes = snapshot?.classes ?? const <ProfessorClassSummary>[];
    final multiArena = (snapshot?.arenas.length ?? 0) > 1;
    final ownClasses =
        ref.watch(professorOwnClassesProvider).valueOrNull ?? const [];

    return ProfessorLinksScaffold(
      title: 'Minhas turmas',
      subtitle: snapshot == null
          ? null
          : professorClassesSubtitle(
              classes,
              ownActive: ownClasses.where((c) => c.isActive).length,
              ownStudents: ownClasses
                  .where((c) => c.isActive)
                  .fold<int>(0, (sum, c) => sum + c.studentCount),
            ),
      onBack: () => popOrGo(context, AppRoutes.professorMore),
      body: RefreshIndicator(
        color: AppColors.brand,
        onRefresh: () async {
          ref.invalidate(professorOwnClassesProvider);
          ref.invalidate(professorStudentsProvider);
          await ref
              .read(professorStudentsProvider.future)
              .then<void>((_) {}, onError: (_) {});
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            // Turmas próprias do independente (B10), antes das da arena.
            const ProfessorOwnClassesSection(),
            if (snapshot == null)
              async.hasError
                  ? ProfessorRetryCard(
                      message: 'Não foi possível carregar suas turmas.',
                      onRetry: () => ref.invalidate(professorStudentsProvider),
                    )
                  : const Padding(
                      padding: EdgeInsets.symmetric(vertical: 40),
                      child: Center(
                        child: CircularProgressIndicator(
                          color: AppColors.brand,
                        ),
                      ),
                    )
            else if (classes.isEmpty && ownClasses.isEmpty)
              const ProfessorLinksCard(
                key: Key('professor-classes-empty'),
                child: ProfessorMutedText(
                  'Nenhuma turma sua aparece aqui. Elas surgem quando uma arena '
                  'escala você e o vínculo libera "Gerenciar as próprias aulas".',
                ),
              )
            else ...[
              if (ownClasses.isNotEmpty && classes.isNotEmpty) ...[
                const ProfessorLinksKicker('Turmas da arena'),
                const SizedBox(height: 8),
              ],
              for (final c in classes) ...[
                _ClassCard(
                  key: Key('professor-class-${c.classId}'),
                  cls: c,
                  todayKey: snapshot.todayKey,
                  showArena: multiArena,
                  // Fase 2: com "Matricular alunos", abre a lista de espera.
                  onTap: snapshot.arena(c.arenaId)?.actions.canEnrollStudents ==
                          true
                      ? () => context.pushNamed(
                            AppRouteNames.professorWaitlist,
                            pathParameters: {
                              'arenaId': c.arenaId,
                              'classId': c.classId,
                            },
                          )
                      : null,
                ),
                const SizedBox(height: 12),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

class _ClassCard extends StatelessWidget {
  const _ClassCard({
    super.key,
    required this.cls,
    required this.todayKey,
    required this.showArena,
    this.onTap,
  });

  final ProfessorClassSummary cls;
  final String todayKey;
  final bool showArena;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final c = cls;
    final next = professorNextClassLabel(c.nextDate, c.startTime, todayKey);
    final isToday = c.nextDate == todayKey;
    final schedule = [
      professorScheduleLabel(c.weekdays, c.startTime),
      if (c.courtName.isNotEmpty) c.courtName,
      if (showArena) c.arenaName,
    ].join(' · ');

    Widget meter(String label, String value, int percent, Color? color) =>
        Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    label,
                    style: ProfessorLinksStyle.mono(
                      9.5,
                      weight: FontWeight.w600,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ),
                Text(
                  value,
                  style: ProfessorLinksStyle.mono(
                    10.5,
                    color: colors.onSurface,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            ProfessorMeter(percent: percent, color: color),
          ],
        );

    return ProfessorLinksCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(
                c.level.label.toUpperCase(),
                style: ProfessorLinksStyle.mono(
                  9,
                  color: ProfessorLinksStyle.mute(colors),
                ).copyWith(letterSpacing: 1),
              ),
              if (c.waitlistCount > 0)
                Text(
                  ' · ${c.waitlistCount} NA ESPERA',
                  style: ProfessorLinksStyle.mono(
                    9,
                    color: AppColors.pending,
                  ).copyWith(letterSpacing: 0.8),
                ),
              const Spacer(),
              if (c.isPaused)
                ArenaClassTag(
                  label: 'Pausada',
                  color: ProfessorLinksStyle.mute(colors),
                )
              else if (next != null)
                Text(
                  next,
                  style: ProfessorLinksStyle.mono(
                    10.5,
                    color: isToday
                        ? AppColors.brandHover
                        : ProfessorLinksStyle.dim(colors),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Text(
                  c.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ProfessorLinksStyle.display(
                    17,
                    weight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
              ),
              if (c.type != ArenaClassType.turma) ...[
                const SizedBox(width: 8),
                ArenaClassTypeTag(type: c.type),
              ],
            ],
          ),
          const SizedBox(height: 3),
          Text(
            schedule,
            style: AppTypography.bodyS.copyWith(
              fontSize: 12,
              color: ProfessorLinksStyle.dim(colors),
            ),
          ),
          const SizedBox(height: 13),
          Row(
            children: [
              Expanded(
                child: meter(
                  'VAGAS',
                  '${c.activeCount}/${c.capacity}',
                  professorOccupancy(c),
                  null,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: meter(
                  'PRESENÇA',
                  c.presenceRate == null ? '—' : '${c.presenceRate}%',
                  c.presenceRate ?? 0,
                  AppColors.win,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
