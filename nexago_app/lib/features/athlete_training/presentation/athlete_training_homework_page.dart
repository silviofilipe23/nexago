import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/time/nexago_event_timezone.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../arena/domain/aulas/arena_class_logic.dart';
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../messages/application/messages_providers.dart';
import '../../messages/presentation/messages_widgets.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/application/professor_lesson_plans_providers.dart';
import '../../professor_mode/domain/professor_lesson_plans.dart';
import '../../professor_mode/presentation/lesson_plans/lesson_plan_widgets.dart';
import '../application/athlete_training_providers.dart';
import '../domain/athlete_training.dart';
import '../domain/homework_progress.dart';
import '../infrastructure/class_presence_repository.dart'
    show ClassPresenceException;
import '../infrastructure/homework_progress_repository.dart';
import 'widgets/training_widgets.dart';

/// Abre o treino em casa da visão [viewId].
void openTrainingHomework(BuildContext context, String viewId) {
  context.pushNamed(
    AppRouteNames.athleteTrainingHomework,
    pathParameters: {'viewId': viewId},
  );
}

/// Abre o vídeo do exercício fora do app. Injetável em teste.
final homeworkVideoLauncherProvider = Provider<Future<bool> Function(Uri)>(
  (ref) => (uri) => launchUrl(uri, mode: LaunchMode.externalApplication),
);

/// T9 · Treino em casa — a tarefa que o professor mandou no feedback da aula:
/// vídeo (quando veio da biblioteca), como fazer, as séries de hoje e a
/// semana. O professor vê o mesmo progresso (`homeworkProgress`).
class AthleteTrainingHomeworkPage extends ConsumerStatefulWidget {
  const AthleteTrainingHomeworkPage({super.key, required this.viewId});

  final String viewId;

  @override
  ConsumerState<AthleteTrainingHomeworkPage> createState() =>
      _AthleteTrainingHomeworkPageState();
}

class _AthleteTrainingHomeworkPageState
    extends ConsumerState<AthleteTrainingHomeworkPage> {
  /// Séries marcadas hoje, antes de salvar; `null` = o que está salvo.
  int? _draft;
  bool _saving = false;
  bool _opening = false;

  Future<void> _save(int setsDone, int sets) async {
    setState(() => _saving = true);
    try {
      await ref
          .read(homeworkProgressRepositoryProvider)
          .save(viewId: widget.viewId, setsDone: setsDone);
      if (!mounted) return;
      setState(() => _draft = null);
      showAppSnackBar(
        context,
        setsDone >= sets
            ? 'Dia concluído! O professor vê seu progresso.'
            : 'Treino salvo.',
      );
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        e is ClassPresenceException
            ? e.message
            : 'Não deu certo agora. Tente de novo.',
        isError: true,
      );
    }
    if (mounted) setState(() => _saving = false);
  }

  Future<void> _message(String professorUid) async {
    setState(() => _opening = true);
    await openConversationWith(
      context,
      () => ref
          .read(messagesRepositoryProvider)
          .openStudentConversation(professorUid),
      professorMode: false,
    );
    if (mounted) setState(() => _opening = false);
  }

  Future<void> _openVideo(String url) async {
    final ok = await ref.read(homeworkVideoLauncherProvider)(Uri.parse(url));
    if (!ok && mounted) {
      showAppSnackBar(context, 'Não foi possível abrir o vídeo.',
          isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final async = ref.watch(athleteLessonPlanViewProvider(widget.viewId));
    final view = async.valueOrNull;
    final homework = view == null ? null : homeworkOf(view);
    final sentAt = view?.feedback?.sentAt;

    if (view == null || homework == null || sentAt == null) {
      return ProfessorLinksScaffold(
        title: 'Treino em casa',
        onBack: () => popOrGo(context, AppRoutes.athleteTrainings),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            if (async.isLoading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Center(
                  child: CircularProgressIndicator(color: AppColors.brand),
                ),
              )
            else
              const ProfessorLinksNote(
                'Esta tarefa não está disponível para esta conta.',
                key: Key('homework-missing'),
              ),
          ],
        ),
      );
    }

    final now = ref.watch(professorLinksClockProvider)();
    final todayKey = nexagoEventDayKey(now);
    final window = homeworkWindowDays(sentAt);
    final open = homeworkOpenOn(sentAt, todayKey);
    final progress =
        (ref.watch(homeworkProgressProvider(widget.viewId)).valueOrNull ??
                const HomeworkProgress())
            .forRound(window.first, homework.name);
    final saved = progress.days[todayKey] ?? 0;
    final today = _draft ?? saved;
    final sets = homework.sets;
    // Conta hoje pelo que está marcado na tela (antes de salvar).
    final daysDone = homeworkDaysDone(
      {...progress.days, if (open) todayKey: today},
      sets,
    );
    final changed = today != saved;

    return ProfessorLinksScaffold(
      title: 'Treino em casa',
      subtitle: 'PROF. ${trainingFirstName(view.professorName).toUpperCase()}'
          ' · ATÉ ${trainingWeekdayDay(window.last)}',
      onBack: () => popOrGo(context, AppRoutes.athleteTrainings),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              children: [
                if (homework.videoUrl != null) ...[
                  _VideoCard(
                    category: homework.category,
                    onTap: () => _openVideo(homework.videoUrl!),
                  ),
                  const SizedBox(height: 14),
                ],
                if (homework.category != null) ...[
                  Align(
                    alignment: Alignment.centerLeft,
                    child: LessonPlanCategoryTag(homework.category!),
                  ),
                  const SizedBox(height: 8),
                ],
                Text(
                  homework.name,
                  style:
                      ProfessorLinksStyle.display(20, color: colors.onSurface),
                ),
                const SizedBox(height: 4),
                Text(
                  '$sets ${sets == 1 ? 'série' : 'séries'} por dia · '
                  '${homework.daysTarget} '
                  '${homework.daysTarget == 1 ? 'dia' : 'dias'} na semana',
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 13,
                    color: ProfessorLinksStyle.mute(colors),
                  ),
                ),
                if (homework.detail.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  ProfessorLinksCard(
                    padding: const EdgeInsets.fromLTRB(13, 11, 13, 11),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ArenaClassAvatar(
                          initials: arenaClassInitials(view.professorName),
                          size: 26,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            homework.detail,
                            style: AppTypography.bodyS.copyWith(
                              fontSize: 12.5,
                              height: 1.45,
                              color: ProfessorLinksStyle.mute(colors),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                TrainingSectionTitle(
                  open
                      ? 'Hoje · $today de $sets ${sets == 1 ? 'série' : 'séries'}'
                      : 'Prazo encerrado',
                ),
                if (open)
                  Row(
                    children: [
                      for (var i = 0; i < sets; i++) ...[
                        if (i > 0) const SizedBox(width: 8),
                        Expanded(
                          child: _SetBox(
                            key: Key('homework-set-$i'),
                            index: i,
                            done: i < today,
                            onTap: _saving
                                ? null
                                : () => setState(
                                      // Toque marca até aquela série; tocar na
                                      // última feita desmarca ela.
                                      () => _draft = i < today && i == today - 1
                                          ? i
                                          : i + 1,
                                    ),
                          ),
                        ),
                      ],
                    ],
                  )
                else
                  const ProfessorLinksNote(
                    'A tarefa valia por uma semana. Seu professor manda a '
                    'próxima depois da aula.',
                    key: Key('homework-closed'),
                  ),
                TrainingSectionTitle(
                  'Semana · $daysDone de ${homework.daysTarget} '
                  '${homework.daysTarget == 1 ? 'dia' : 'dias'}',
                ),
                Row(
                  children: [
                    for (final d in window)
                      Expanded(
                        child: _DayDot(
                          key: Key('homework-day-$d'),
                          label: d == todayKey
                              ? 'HOJE'
                              : trainingWeekdayDay(d).split(' ').first,
                          done: (d == todayKey
                                  ? today
                                  : (progress.days[d] ?? 0)) >=
                              sets,
                          today: d == todayKey,
                          future: d.compareTo(todayKey) > 0,
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              child: Row(
                children: [
                  SizedBox(
                    width: 132,
                    child: ProfessorLinksGhostButton(
                      key: const Key('homework-message'),
                      label: 'Mensagem',
                      loading: _opening,
                      onPressed: _opening || view.professorUid.isEmpty
                          ? null
                          : () => _message(view.professorUid),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ProfessorLinksPrimaryButton(
                      key: const Key('homework-save'),
                      label: !open
                          ? 'Prazo encerrado'
                          : today >= sets
                              ? (changed ? 'Concluir o dia' : 'Dia concluído')
                              : changed
                                  ? 'Salvar $today de $sets'
                                  : 'Faltam ${sets - today} '
                                      '${sets - today == 1 ? 'série' : 'séries'}',
                      loading: _saving,
                      onPressed: open && changed && !_saving
                          ? () => _save(today, sets)
                          : null,
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

class _VideoCard extends StatelessWidget {
  const _VideoCard({required this.category, required this.onTap});

  final LessonPlanCategory? category;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final tint =
        category == null ? AppColors.brand : lessonPlanCategoryColor(category!);
    return Semantics(
      button: true,
      label: 'Ver vídeo do exercício',
      child: GestureDetector(
        key: const Key('homework-video'),
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Container(
          height: 180,
          decoration: BoxDecoration(
            color: colors.surfaceCard,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: tint.withValues(alpha: 0.27)),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [tint.withValues(alpha: 0.14), colors.surfaceCard],
            ),
          ),
          child: Stack(
            children: [
              Center(
                child: Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.6),
                    shape: BoxShape.circle,
                    border:
                        Border.all(color: ProfessorLinksStyle.line2(colors)),
                  ),
                  child: const Icon(Icons.play_arrow_rounded,
                      size: 28, color: Colors.white),
                ),
              ),
              Positioned(
                left: 12,
                bottom: 10,
                child: Text(
                  'VÍDEO DO EXERCÍCIO',
                  style: ProfessorLinksStyle.mono(
                    10,
                    color: colors.onSurface.withValues(alpha: 0.5),
                  ).copyWith(letterSpacing: 1),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SetBox extends StatelessWidget {
  const _SetBox({
    super.key,
    required this.index,
    required this.done,
    required this.onTap,
  });

  final int index;
  final bool done;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final win = colors.win;
    return Semantics(
      button: true,
      checked: done,
      label: 'Série ${index + 1}',
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          height: 64,
          decoration: BoxDecoration(
            color: done ? win.withValues(alpha: 0.1) : colors.surfaceRaised,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: done
                  ? win.withValues(alpha: 0.45)
                  : ProfessorLinksStyle.line2(colors),
            ),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (done)
                Icon(Icons.check_rounded,
                    size: 20, color: colors.readableTone(win))
              else
                Text(
                  '${index + 1}',
                  style: ProfessorLinksStyle.mono(16, color: colors.onSurface),
                ),
              const SizedBox(height: 4),
              Text(
                'SÉRIE ${index + 1}',
                style: ProfessorLinksStyle.mono(
                  9.5,
                  color: done
                      ? colors.readableTone(win)
                      : ProfessorLinksStyle.dim(colors),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DayDot extends StatelessWidget {
  const _DayDot({
    super.key,
    required this.label,
    required this.done,
    required this.today,
    required this.future,
  });

  final String label;
  final bool done;
  final bool today;
  final bool future;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: done ? colors.win : Colors.transparent,
            border: done
                ? null
                : Border.all(
                    width: 1.5,
                    color: today
                        ? AppColors.brand
                        : future
                            ? ProfessorLinksStyle.line(colors)
                            : ProfessorLinksStyle.line2(colors),
                  ),
          ),
          child: done
              ? const Icon(Icons.check_rounded,
                  size: 16, color: ProfessorLinksStyle.onBrand)
              : null,
        ),
        const SizedBox(height: 6),
        Text(
          label,
          style: ProfessorLinksStyle.mono(
            9,
            color: today ? colors.brandText : ProfessorLinksStyle.dim(colors),
          ),
        ),
      ],
    );
  }
}
