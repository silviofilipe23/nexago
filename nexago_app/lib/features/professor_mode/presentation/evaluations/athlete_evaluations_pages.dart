import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_evaluations_providers.dart';
import '../../domain/professor_evaluations.dart';
import '../widgets/professor_students_widgets.dart';
import 'evaluation_widgets.dart';

/// Lado do ATLETA: as avaliações enviadas pelos professores (mais recente
/// primeiro). Toque abre o detalhe.
class AthleteEvaluationsPage extends ConsumerWidget {
  const AthleteEvaluationsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final async = ref.watch(receivedEvaluationsProvider);
    final list = async.valueOrNull;
    return ProfessorLinksScaffold(
      title: 'Avaliações',
      subtitle: 'DOS SEUS PROFESSORES',
      onBack: () => popOrGo(context, AppRoutes.home),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          if (list == null && async.hasError)
            ProfessorRetryCard(
              message: 'Não foi possível carregar suas avaliações.',
              onRetry: () => ref.invalidate(receivedEvaluationsProvider),
            )
          else if (list == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(
                child: CircularProgressIndicator(color: AppColors.brand),
              ),
            )
          else if (list.isEmpty)
            const ProfessorLinksCard(
              key: Key('athlete-evaluations-empty'),
              child: ProfessorMutedText(
                'Nenhuma avaliação ainda. Quando seu professor avaliar sua '
                'evolução no mês, ela aparece aqui.',
              ),
            )
          else
            for (final e in list) ...[
              ProfessorLinksCard(
                key: Key('athlete-evaluation-${e.id}'),
                onTap: () => context.pushNamed(
                  AppRouteNames.athleteEvaluation,
                  pathParameters: {'evaluationId': e.id},
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            evaluationPeriodLabel(e.period),
                            style: ProfessorLinksStyle.display(
                              14.5,
                              color: colors.onSurface,
                            ),
                          ),
                          Text(
                            '${e.professorName} · '
                            '${evaluationSportLabel(e.sport)}',
                            style: AppTypography.bodyS.copyWith(
                              fontSize: 11.5,
                              color: ProfessorLinksStyle.dim(colors),
                            ),
                          ),
                        ],
                      ),
                    ),
                    EvaluationOverallBadge(
                      overall: e.overall,
                      delta: e.delta,
                      size: 22,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
            ],
        ],
      ),
    );
  }
}

/// Detalhe da avaliação para o ATLETA (push `professor_evaluation`).
class AthleteEvaluationPage extends ConsumerWidget {
  const AthleteEvaluationPage({super.key, required this.evaluationId});

  final String evaluationId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(receivedEvaluationsProvider);
    ProfessorEvaluation? e;
    for (final x in async.valueOrNull ?? const <ProfessorEvaluation>[]) {
      if (x.id == evaluationId) e = x;
    }
    return ProfessorLinksScaffold(
      title: e == null ? 'Avaliação' : 'Sua avaliação',
      subtitle:
          e == null ? null : evaluationPeriodLabel(e.period).toUpperCase(),
      onBack: () => popOrGo(context, AppRoutes.athleteEvaluations),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          if (e != null)
            EvaluationReport(evaluation: e)
          else if (!async.hasValue && !async.hasError)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(
                child: CircularProgressIndicator(color: AppColors.brand),
              ),
            )
          else
            const ProfessorLinksNote(
              'Esta avaliação não está disponível para esta conta.',
              key: Key('athlete-evaluation-missing'),
            ),
        ],
      ),
    );
  }
}
