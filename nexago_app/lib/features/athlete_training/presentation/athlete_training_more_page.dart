import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../athlete/domain/agenda/athlete_agenda_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../application/athlete_training_providers.dart';
import 'training_shell_page.dart';
import 'widgets/training_widgets.dart';

/// Aba "Mais" de Meus treinos: o que não virou aba (aulas, avaliações,
/// professores e pagamentos).
class AthleteTrainingMorePage extends ConsumerWidget {
  const AthleteTrainingMorePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pendingReviews = ref.watch(pendingClassReviewsProvider) ?? const [];
    final centers =
        ref.watch(athleteTrainingCentersProvider).valueOrNull ?? const [];
    final charges = ref.watch(myClassChargesProvider).valueOrNull ?? const [];

    return ProfessorLinksScaffold(
      title: 'Mais',
      subtitle: 'TUDO SOBRE SEUS TREINOS',
      // Aba do shell: voltar leva à aba Treinos.
      onBack: () => context.go(AppRoutes.athleteTrainings),
      body: ListView(
        padding: EdgeInsets.fromLTRB(
          20,
          8,
          20,
          trainingShellBottomPadding(context),
        ),
        children: [
          const TrainingSectionTitle('Aulas'),
          TrainingTilesBlock(
            children: [
              TrainingListTile(
                key: const Key('training-more-classes'),
                icon: Icons.event_note_outlined,
                title: 'Minhas aulas',
                subtitle: 'Próximas e histórico de presença',
                onTap: () =>
                    context.pushNamed(AppRouteNames.athleteTrainingClasses),
              ),
              TrainingListTile(
                key: const Key('training-more-private'),
                icon: Icons.event_available_outlined,
                title: 'Aulas particulares',
                subtitle: 'Agendar, remarcar e cancelar',
                onTap: () =>
                    context.pushNamed(AppRouteNames.athletePrivateLessons),
              ),
              TrainingListTile(
                key: const Key('training-more-reviews'),
                icon: Icons.star_outline_rounded,
                title: 'Minhas avaliações',
                subtitle: pendingReviews.isEmpty
                    ? 'Notas que você deu às aulas e respostas'
                    : pendingReviews.length == 1
                        ? '1 treino para avaliar'
                        : '${pendingReviews.length} treinos para avaliar',
                highlight: pendingReviews.isNotEmpty,
                onTap: () =>
                    context.pushNamed(AppRouteNames.athleteTrainingReviews),
              ),
            ],
          ),
          const TrainingSectionTitle('Professores'),
          TrainingTilesBlock(
            children: [
              TrainingListTile(
                key: const Key('training-more-professors'),
                icon: Icons.sports_outlined,
                title: 'Meus professores',
                subtitle: 'Mensagem e agendamento',
                onTap: () =>
                    context.pushNamed(AppRouteNames.athleteTrainingProfessors),
              ),
              TrainingListTile(
                key: const Key('training-more-find'),
                icon: Icons.person_search_outlined,
                title: 'Encontrar professor',
                subtitle: 'Professores das arenas perto de você',
                onTap: () => context
                    .pushNamed(AppRouteNames.athleteTrainingFindProfessor),
              ),
            ],
          ),
          const TrainingSectionTitle('Pagamentos'),
          TrainingTilesBlock(
            children: [
              TrainingListTile(
                key: const Key('training-more-plans'),
                icon: Icons.credit_card_outlined,
                title: 'Planos e pagamentos',
                subtitle: charges.isNotEmpty
                    ? (charges.length == 1
                        ? '1 mensalidade em aberto'
                        : '${charges.length} mensalidades em aberto')
                    : centers.isEmpty
                        ? 'Arena e professor, lado a lado'
                        : 'Cada origem cobra separado',
                highlight: charges.any((c) => c.overdue),
                onTap: () =>
                    context.pushNamed(AppRouteNames.athleteTrainingPlans),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
