import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../arena/domain/aulas/arena_class_logic.dart';
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../messages/application/messages_providers.dart';
import '../../messages/domain/messages.dart';
import '../../messages/presentation/messages_widgets.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/availability/athlete_private_lessons_pages.dart'
    show openPrivateLessonBooking;
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../../../core/time/nexago_event_timezone.dart';
import '../application/athlete_training_providers.dart';
import '../domain/athlete_training.dart';
import 'athlete_training_find_professor_page.dart' show openProfessorProfile;
import 'training_shell_page.dart';

/// T10 · Meus professores — quem dá aula para o atleta (`getMyProfessors`:
/// turma da arena ou carteira do professor), o próximo treino com cada um e
/// os atalhos de mensagem e particular.
class AthleteTrainingProfessorsPage extends ConsumerWidget {
  const AthleteTrainingProfessorsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(myProfessorsProvider);
    final list = async.valueOrNull;
    final now = ref.watch(professorLinksClockProvider)();
    final trainings = ref.watch(athleteTrainingsProvider) ?? const [];
    return ProfessorLinksScaffold(
      title: 'Meus professores',
      subtitle: list == null
          ? null
          : '${list.length} ${list.length == 1 ? 'ATIVO' : 'ATIVOS'}',
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
          if (list == null && async.hasError)
            ProfessorRetryCard(
              message: 'Não foi possível carregar seus professores.',
              onRetry: () => ref.invalidate(myProfessorsProvider),
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
              key: Key('training-professors-empty'),
              child: ProfessorMutedText(
                'Você ainda não tem professor no nexaGO. Quando entrar numa '
                'turma da arena ou aceitar o convite de um professor, ele '
                'aparece aqui.',
              ),
            )
          else
            for (final p in list) ...[
              _ProfessorCard(
                professor: p,
                trainings: [
                  for (final t in trainings)
                    if (_isWith(t, p)) t,
                ],
                now: now,
              ),
              const SizedBox(height: 10),
            ],
          const SizedBox(height: 6),
          ProfessorLinksGhostButton(
            key: const Key('training-professors-find'),
            label: 'Encontrar professor',
            onPressed: () => context
                .pushNamed(AppRouteNames.athleteTrainingFindProfessor),
          ),
        ],
      ),
    );
  }

  /// A particular traz o uid; a aula da arena, só o nome do professor.
  static bool _isWith(TrainingSession t, MyProfessor p) =>
      t.professorUid.isNotEmpty
          ? t.professorUid == p.professorUid
          : t.professorName.trim().toLowerCase() == p.name.trim().toLowerCase();
}

class _ProfessorCard extends ConsumerStatefulWidget {
  const _ProfessorCard({
    required this.professor,
    required this.trainings,
    required this.now,
  });

  final MyProfessor professor;
  final List<TrainingSession> trainings;
  final DateTime now;

  @override
  ConsumerState<_ProfessorCard> createState() => _ProfessorCardState();
}

class _ProfessorCardState extends ConsumerState<_ProfessorCard> {
  bool _opening = false;

  Future<void> _message() async {
    setState(() => _opening = true);
    await openConversationWith(
      context,
      () => ref
          .read(messagesRepositoryProvider)
          .openStudentConversation(widget.professor.professorUid),
      professorMode: false,
    );
    if (mounted) setState(() => _opening = false);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final p = widget.professor;
    final next = nextTraining(widget.trainings, widget.now);
    final kinds = <String>{
      for (final t in widget.trainings) t.isPrivate ? 'Particular' : t.title,
    }.toList();
    final todayKey = nexagoEventDayKey(widget.now);
    return ProfessorLinksCard(
      key: Key('training-professor-${p.professorUid}'),
      onTap: () => openProfessorProfile(context, p.professorUid),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              ArenaClassAvatar(
                initials: arenaClassInitials(p.name),
                photoUrl: p.photoUrl,
                size: 46,
                zoomName: p.name,
                zoomRole: 'Professor',
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      p.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: ProfessorLinksStyle.display(
                        15.5,
                        weight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                    if (kinds.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        kinds.take(2).join(' · '),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.bodyS.copyWith(
                          fontSize: 12,
                          color: ProfessorLinksStyle.dim(colors),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            next == null
                ? 'SEM AULA MARCADA'
                : 'PRÓXIMA · ${trainingRelativeDay(next.dateKey, todayKey).toUpperCase()}'
                    ' ${next.startTime}',
            style: ProfessorLinksStyle.mono(
              10,
              color: ProfessorLinksStyle.dim(colors),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: ProfessorLinksGhostButton(
                  key: Key('training-professor-message-${p.professorUid}'),
                  label: 'Mensagem',
                  height: 40,
                  loading: _opening,
                  onPressed: _opening ? null : _message,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ProfessorLinksPrimaryButton(
                  key: Key('training-professor-book-${p.professorUid}'),
                  label: 'Agendar',
                  height: 40,
                  onPressed: () => openPrivateLessonBooking(
                    context,
                    professorUid: p.professorUid,
                    professorName: p.name,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
