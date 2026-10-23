import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/center_coach_providers.dart';
import '../domain/center_coach.dart';
import 'widgets/center_coach_widgets.dart';
import 'widgets/center_mode_tab_scope.dart';

/// Turmas do centro: as do professor (aba Turmas do app do professor) ou
/// todas para a gestão. Cada uma abre o histórico (P8).
class CenterCoachClassesPage extends ConsumerWidget {
  const CenterCoachClassesPage({super.key, required this.centerId});

  final String centerId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final uid = ref.watch(professorLinksUidProvider);
    final member = ref.watch(centerMembershipProvider(centerId));
    final classesAsync = ref.watch(coachClassesProvider(centerId));
    final all = member?.isManager ?? false;
    final classes = [
      for (final c in classesAsync.valueOrNull ?? const <CenterCoachClass>[])
        if ((all || c.coachUid == uid) &&
            (c.status == 'active' || c.status == 'draft'))
          c,
    ]..sort((a, b) => a.name.compareTo(b.name));
    final seats = classes.fold<int>(0, (n, c) => n + c.seatsTaken);

    return ProfessorLinksScaffold(
      title: 'Turmas',
      subtitle:
          '${member?.centerName.toUpperCase() ?? 'CENTRO'} · '
          '${classes.length} ${classes.length == 1 ? 'TURMA' : 'TURMAS'} · '
          '$seats ${seats == 1 ? 'ALUNO' : 'ALUNOS'}',
      showBack: !CenterModeTabScope.of(context),
      onBack: () => popOrGo(context, AppRoutes.centerCoachAgenda),
      body: ListView(
        padding: centerListPadding(context),
        children: [
          if (classesAsync.isLoading && classesAsync.valueOrNull == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(
                child: CircularProgressIndicator(color: AppColors.brand),
              ),
            )
          else if (classesAsync.hasError)
            ProfessorRetryCard(
              message: 'Não foi possível carregar as turmas.',
              onRetry: () => ref.invalidate(coachClassesProvider(centerId)),
            )
          else if (classes.isEmpty)
            ProfessorLinksCard(
              key: const Key('center-classes-empty'),
              child: ProfessorMutedText(
                all
                    ? 'O centro ainda não tem turmas. Crie as turmas no painel '
                          'web do centro.'
                    : 'Você ainda não tem turma neste centro.',
              ),
            )
          else
            for (final c in classes) ...[
              CenterCoachClassRow(
                key: Key('center-classes-row-${c.id}'),
                cls: c,
                onTap: () => context.pushNamed(
                  AppRouteNames.centerCoachClass,
                  pathParameters: {'centerId': centerId, 'classId': c.id},
                ),
              ),
              const SizedBox(height: 8),
            ],
          if (classes.any((c) => c.status == 'draft')) ...[
            const SizedBox(height: 4),
            ProfessorLinksNote(
              'Turma em rascunho ainda não gera aulas na agenda.',
              tone: ProfessorLinksNoteTone.blue,
            ),
          ],
        ],
      ),
    );
  }
}
