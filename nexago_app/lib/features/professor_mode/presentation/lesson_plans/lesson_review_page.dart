import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/time/nexago_event_timezone.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../arena/domain/aulas/arena_class_logic.dart'
    show arenaClassInitials;
import '../../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_lesson_plans_providers.dart';
import '../../domain/professor_lesson_plans.dart';
import '../../infrastructure/professor_students_repository.dart'
    show ProfessorStudentsException;
import '../wallet/professor_wallet_widgets.dart';
import '../widgets/professor_students_widgets.dart';
import '../availability/availability_widgets.dart' show AvailabilityChoiceChip;
import 'lesson_plan_widgets.dart';

Color lessonBlockRatingColor(LessonBlockRating r) => switch (r) {
      LessonBlockRating.ok => AppColors.win,
      LessonBlockRating.adjust => AppColors.pending,
      LessonBlockRating.no => AppColors.live,
      LessonBlockRating.skipped => AppColors.onSurfaceMuted,
    };

const _rateOptions = [
  LessonBlockRating.ok,
  LessonBlockRating.adjust,
  LessonBlockRating.no,
];

/// H7 · Registro da aula: como foi cada bloco, a anotação geral (só o
/// professor) e o feedback de cada aluno (enviar ou privado, com exercício
/// para casa). Abre preenchido com o registro já salvo.
class ProfessorLessonReviewPage extends ConsumerStatefulWidget {
  const ProfessorLessonReviewPage({super.key, required this.planId});

  final String planId;

  @override
  ConsumerState<ProfessorLessonReviewPage> createState() =>
      _ProfessorLessonReviewPageState();
}

class _FeedbackState {
  _FeedbackState({
    required this.athleteId,
    required this.name,
    required String text,
    required this.send,
    this.homework,
    this.previous,
  }) : text = TextEditingController(text: text);

  final String athleteId;
  final String name;
  final TextEditingController text;
  bool send;
  LessonHomework? homework;

  /// O que já estava salvo (com `sentAt` se foi enviado).
  final LessonFeedbackEntry? previous;

  LessonFeedbackEntry get entry => LessonFeedbackEntry(
        athleteId: athleteId,
        name: name,
        text: text.text.trim(),
        send: send,
        homework: homework,
      );

  /// Enviado e o texto não mudou.
  bool get alreadySent =>
      previous?.sentAt != null && previous!.text == text.text.trim();
}

class _ProfessorLessonReviewPageState
    extends ConsumerState<ProfessorLessonReviewPage> {
  final _note = TextEditingController();
  final _ratings = <String, LessonBlockRating>{};
  final _feedback = <String, _FeedbackState>{};
  bool _ready = false;
  bool _studentsMerged = false;
  bool _saving = false;
  LessonPlan? _plan;

  @override
  void dispose() {
    _note.dispose();
    for (final f in _feedback.values) {
      f.text.dispose();
    }
    super.dispose();
  }

  void _init(LessonPlan plan) {
    _plan = plan;
    final r = plan.review;
    if (r != null) {
      _note.text = r.generalNote;
      _ratings.addAll(r.blockRatings);
      for (final f in r.feedback) {
        _feedback[f.athleteId] = _FeedbackState(
          athleteId: f.athleteId,
          name: f.name,
          text: f.text,
          send: f.send,
          homework: f.homework,
          previous: f,
        );
      }
    }
    _ready = true;
  }

  void _mergeStudents(List<LessonPlanStudent> students) {
    for (final s in students) {
      _feedback.putIfAbsent(
        s.athleteId,
        () => _FeedbackState(
          athleteId: s.athleteId,
          name: s.name,
          text: '',
          send: true,
        ),
      );
    }
    _studentsMerged = true;
  }

  LessonReviewDraft _draft() => LessonReviewDraft(
        planId: widget.planId,
        blockRatings: Map.of(_ratings),
        generalNote: _note.text,
        feedback: [for (final f in _feedback.values) f.entry],
      );

  int get _toSend => _feedback.values
      .where((f) => lessonFeedbackWillSend(f.entry, f.previous))
      .length;

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final sent = await ref
          .read(professorLessonPlansRepositoryProvider)
          .saveReview(_draft());
      if (!mounted) return;
      showAppSnackBar(
        context,
        sent == 0
            ? 'Registro da aula salvo.'
            : 'Registro salvo · $sent feedback${sent == 1 ? '' : 's'} '
                'enviado${sent == 1 ? '' : 's'}.',
      );
      popOrGo(context, AppRoutes.professorLessonPlans);
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      showAppSnackBar(
        context,
        e is ProfessorStudentsException
            ? e.message
            : 'Não foi possível salvar o registro.',
        isError: true,
      );
    }
  }

  Future<void> _pickHomework(_FeedbackState f) async {
    final hw = await showProfessorLinksSheet<LessonHomework>(
      context,
      builder: (_) => const _HomeworkSheet(),
    );
    if (hw == null || !mounted) return;
    setState(() => f.homework = hw);
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(professorLessonPlanByIdProvider(widget.planId));
    final plan = async.valueOrNull;
    if (!_ready && plan != null) _init(plan);
    final p = _plan ?? plan;
    if (p == null) {
      return ProfessorLinksScaffold(
        title: 'Registro da aula',
        onBack: () => popOrGo(context, AppRoutes.professorLessonPlans),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            if (!async.hasValue && !async.hasError)
              const ProfessorWalletLoading()
            else
              const ProfessorLinksCard(
                key: Key('lesson-review-missing'),
                child: ProfessorMutedText('Plano não encontrado.'),
              ),
          ],
        ),
      );
    }
    final lessonAsync =
        ref.watch(lessonPlanLessonProvider((kind: p.kind, refId: p.refId)));
    final students = lessonAsync.valueOrNull?.students;
    if (!_studentsMerged && students != null) _mergeStudents(students);
    final colors = context.themeColors;
    final toSend = _toSend;

    return ProfessorLinksScaffold(
      title: 'Registro da aula',
      subtitle: '${p.title.toUpperCase()} · ${lessonPlanWeekdayDay(p.date)}',
      onBack: () => popOrGo(context, AppRoutes.professorLessonPlans),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              children: [
                const ProfessorLinksKicker('Como foi cada bloco'),
                const SizedBox(height: 8),
                if (p.blocks.isEmpty)
                  const ProfessorMutedText('Este plano não tem blocos.'),
                for (var i = 0; i < p.blocks.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: _RateRow(
                      index: i,
                      block: p.blocks[i],
                      rating: _ratings[p.blocks[i].id],
                      onRate: (r) => setState(() {
                        final id = p.blocks[i].id;
                        if (_ratings[id] == r) {
                          _ratings.remove(id);
                        } else {
                          _ratings[id] = r;
                        }
                      }),
                    ),
                  ),
                if (p.blocks.isNotEmpty)
                  Wrap(
                    spacing: 12,
                    runSpacing: 4,
                    children: [
                      for (final r in _rateOptions)
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 6,
                              height: 6,
                              decoration: BoxDecoration(
                                color: lessonBlockRatingColor(r),
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: 5),
                            Text(
                              r.label,
                              style: AppTypography.bodyS.copyWith(
                                fontSize: 10.5,
                                color: ProfessorLinksStyle.dim(colors),
                              ),
                            ),
                          ],
                        ),
                    ],
                  ),
                const SizedBox(height: 18),
                const ProfessorLinksKicker('Anotação geral · só você'),
                const SizedBox(height: 8),
                TextField(
                  key: const Key('lesson-review-note'),
                  controller: _note,
                  minLines: 2,
                  maxLines: 6,
                  maxLength: 2000,
                  textCapitalization: TextCapitalization.sentences,
                  style: AppTypography.bodyM.copyWith(color: colors.onSurface),
                  decoration: _deco(colors, 'O que mudar na próxima aula'),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    const Expanded(
                      child: ProfessorLinksKicker('Feedback para alunos'),
                    ),
                    Text(
                      '$toSend para enviar',
                      key: const Key('lesson-review-to-send'),
                      style: ProfessorLinksStyle.mono(
                        10.5,
                        color: colors.onSurface,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                if (students == null && lessonAsync.isLoading)
                  const ProfessorWalletLoading()
                else if (_feedback.isEmpty)
                  ProfessorMutedText(
                    lessonAsync.hasError
                        ? 'Não foi possível carregar os alunos desta aula.'
                        : 'Nenhum aluno com conta nesta aula.',
                  ),
                for (final f in _feedback.values) ...[
                  _FeedbackCard(
                    state: f,
                    stars: p.ratings[f.athleteId],
                    onChanged: () => setState(() {}),
                    onHomework: () => _pickHomework(f),
                  ),
                  const SizedBox(height: 10),
                ],
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              child: ProfessorLinksPrimaryButton(
                key: const Key('lesson-review-save'),
                label: toSend == 0
                    ? 'Salvar'
                    : 'Salvar e enviar $toSend '
                        'feedback${toSend == 1 ? '' : 's'}',
                loading: _saving,
                onPressed: _save,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

InputDecoration _deco(AppThemeColors colors, String hint) => InputDecoration(
      isDense: true,
      hintText: hint,
      counterText: '',
      filled: true,
      fillColor: ProfessorLinksStyle.soft(colors),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(13),
        borderSide: BorderSide(color: ProfessorLinksStyle.line2(colors)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(13),
        borderSide: const BorderSide(color: AppColors.brand),
      ),
    );

class _RateRow extends StatelessWidget {
  const _RateRow({
    required this.index,
    required this.block,
    required this.rating,
    required this.onRate,
  });

  final int index;
  final LessonPlanBlock block;
  final LessonBlockRating? rating;
  final ValueChanged<LessonBlockRating> onRate;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksCard(
      padding: const EdgeInsets.fromLTRB(10, 9, 9, 9),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              width: 4,
              decoration: BoxDecoration(
                color: lessonPlanCategoryColor(block.category),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    block.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ProfessorLinksStyle.display(
                      12.5,
                      weight: FontWeight.w600,
                      color: colors.onSurface,
                    ),
                  ),
                  Text(
                    rating == LessonBlockRating.skipped
                        ? 'PULADO · SEM TEMPO'
                        : '${block.minutes}′',
                    style: ProfessorLinksStyle.mono(
                      9.5,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
              ),
            ),
            for (final r in _rateOptions)
              Padding(
                padding: const EdgeInsets.only(left: 4),
                child: Tooltip(
                  message: r.label,
                  child: Material(
                    color: rating == r
                        ? lessonBlockRatingColor(r).withValues(alpha: 0.14)
                        : ProfessorLinksStyle.soft(colors),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(9),
                      side: BorderSide(
                        color: rating == r
                            ? lessonBlockRatingColor(r)
                            : ProfessorLinksStyle.line(colors),
                      ),
                    ),
                    child: InkWell(
                      key: Key('lesson-review-rate-$index-${r.name}'),
                      borderRadius: BorderRadius.circular(9),
                      onTap: () => onRate(r),
                      child: SizedBox.square(
                        dimension: 32,
                        child: Center(
                          child: Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                              color: rating == r
                                  ? lessonBlockRatingColor(r)
                                  : ProfessorLinksStyle.dim(colors),
                              shape: BoxShape.circle,
                            ),
                          ),
                        ),
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

class _FeedbackCard extends StatelessWidget {
  const _FeedbackCard({
    required this.state,
    required this.onChanged,
    required this.onHomework,
    this.stars,
  });

  final _FeedbackState state;
  final int? stars;
  final VoidCallback onChanged;
  final VoidCallback onHomework;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final f = state;
    final sentAt = f.alreadySent ? f.previous!.sentAt : null;
    String sentLabel(DateTime at) {
      final l = toNexagoEventLocal(at);
      return 'ENVIADO ${l.day.toString().padLeft(2, '0')}/'
          '${l.month.toString().padLeft(2, '0')}';
    }

    return ProfessorLinksCard(
      key: Key('lesson-review-feedback-${f.athleteId}'),
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              ArenaClassAvatar(initials: arenaClassInitials(f.name), size: 30),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  f.name,
                  style: ProfessorLinksStyle.display(
                    13,
                    weight: FontWeight.w600,
                    color: colors.onSurface,
                  ),
                ),
              ),
              if (stars != null) ...[
                Text(
                  '★ $stars',
                  style: ProfessorLinksStyle.mono(
                    11,
                    color: colors.readableTone(AppColors.brand),
                  ),
                ),
                const SizedBox(width: 8),
              ],
              if (sentAt != null)
                Text(
                  sentLabel(sentAt),
                  key: Key('lesson-review-sent-${f.athleteId}'),
                  style: ProfessorLinksStyle.mono(
                    9.5,
                    color: colors.readableTone(AppColors.win),
                  ),
                )
              else ...[
                Text(
                  f.send ? 'Enviar' : 'Privado',
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 11,
                    color: f.send
                        ? colors.readableTone(AppColors.win)
                        : ProfessorLinksStyle.dim(colors),
                  ),
                ),
                Switch(
                  key: Key('lesson-review-send-${f.athleteId}'),
                  value: f.send,
                  activeThumbColor: ProfessorLinksStyle.onBrand,
                  activeTrackColor: AppColors.brand,
                  onChanged: (v) {
                    f.send = v;
                    onChanged();
                  },
                ),
              ],
            ],
          ),
          const SizedBox(height: 8),
          TextField(
            key: Key('lesson-review-text-${f.athleteId}'),
            controller: f.text,
            minLines: 2,
            maxLines: 5,
            maxLength: 1000,
            textCapitalization: TextCapitalization.sentences,
            onChanged: (_) => onChanged(),
            style: AppTypography.bodyS.copyWith(
              fontSize: 13,
              color: colors.onSurface,
            ),
            decoration: _deco(colors, 'Como foi a aula para ${f.name}'),
          ),
          const SizedBox(height: 8),
          if (f.homework == null)
            Align(
              alignment: Alignment.centerLeft,
              child: LessonPlanSmallButton(
                key: Key('lesson-review-homework-${f.athleteId}'),
                label: 'Exercício para casa',
                icon: Icons.add_rounded,
                onTap: onHomework,
              ),
            )
          else
            Container(
              key: Key('lesson-review-homework-set-${f.athleteId}'),
              padding: const EdgeInsets.fromLTRB(11, 8, 4, 8),
              decoration: BoxDecoration(
                color: ProfessorLinksStyle.soft(colors),
                borderRadius: BorderRadius.circular(11),
                border: Border.all(color: ProfessorLinksStyle.line(colors)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          f.homework!.name,
                          style: ProfessorLinksStyle.display(
                            12.5,
                            weight: FontWeight.w600,
                            color: colors.onSurface,
                          ),
                        ),
                        if (f.homework!.detail.isNotEmpty)
                          Text(
                            f.homework!.detail,
                            style: AppTypography.bodyS.copyWith(
                              fontSize: 11.5,
                              color: ProfessorLinksStyle.dim(colors),
                            ),
                          ),
                        Text(
                          '${f.homework!.sets} '
                          '${f.homework!.sets == 1 ? 'série' : 'séries'}/dia · '
                          '${f.homework!.daysTarget} '
                          '${f.homework!.daysTarget == 1 ? 'dia' : 'dias'} na semana',
                          style: ProfessorLinksStyle.mono(
                            10,
                            color: ProfessorLinksStyle.dim(colors),
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Tirar exercício',
                    onPressed: () {
                      f.homework = null;
                      onChanged();
                    },
                    icon: Icon(Icons.close_rounded,
                        size: 18, color: ProfessorLinksStyle.dim(colors)),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Exercício para casa: da biblioteca ou escrito na hora.
class _HomeworkSheet extends ConsumerStatefulWidget {
  const _HomeworkSheet();

  @override
  ConsumerState<_HomeworkSheet> createState() => _HomeworkSheetState();
}

class _HomeworkSheetState extends ConsumerState<_HomeworkSheet> {
  final _name = TextEditingController();
  final _detail = TextEditingController();
  int _sets = kLessonHomeworkDefaultSets;
  int _days = kLessonHomeworkDefaultDays;

  @override
  void dispose() {
    _name.dispose();
    _detail.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final library = ref.watch(lessonExerciseLibraryProvider);
    return ProfessorLinksSheetBody(
      title: 'Exercício para casa',
      subtitle: 'Escreva um ou escolha da biblioteca',
      children: [
        ProfessorWalletField(
          key: const Key('lesson-homework-name'),
          label: 'Nome',
          controller: _name,
          hint: 'Ex.: Lançamento + flexão',
          maxLength: 80,
        ),
        ProfessorWalletField(
          key: const Key('lesson-homework-detail'),
          label: 'Como fazer',
          controller: _detail,
          hint: 'Ex.: 3×10 sem bola',
          maxLength: 200,
        ),
        _HomeworkDose(
          label: 'Séries por dia',
          keyPrefix: 'lesson-homework-sets',
          options: const [1, 2, 3, 4, 5],
          value: _sets,
          onChanged: (v) => setState(() => _sets = v),
        ),
        _HomeworkDose(
          label: 'Dias na semana',
          keyPrefix: 'lesson-homework-days',
          options: const [1, 2, 3, 4, 5, 6, 7],
          value: _days,
          onChanged: (v) => setState(() => _days = v),
        ),
        ProfessorLinksPrimaryButton(
          key: const Key('lesson-homework-use'),
          label: 'Usar este exercício',
          onPressed: () {
            if (_name.text.trim().isEmpty) return;
            Navigator.pop(
              context,
              LessonHomework(
                name: _name.text.trim(),
                detail: _detail.text.trim(),
                sets: _sets,
                daysTarget: _days,
              ),
            );
          },
        ),
        const ProfessorLinksKicker('Da biblioteca'),
        for (final e in library)
          ProfessorLinksCard(
            key: Key('lesson-homework-pick-${e.id}'),
            padding: const EdgeInsets.all(10),
            onTap: () => Navigator.pop(
              context,
              LessonHomework(
                name: e.name,
                detail: e.steps.isNotEmpty ? e.steps.first : e.detail,
                sets: _sets,
                daysTarget: _days,
                category: e.category,
                videoUrl:
                    e.videoUrl.startsWith('https://') ? e.videoUrl : null,
              ),
            ),
            child: Row(
              children: [
                LessonExerciseThumb(category: e.category, size: 36),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    e.name,
                    style: ProfessorLinksStyle.display(
                      12.5,
                      weight: FontWeight.w600,
                      color: colors.onSurface,
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

/// "Séries por dia" / "Dias na semana" da tarefa (o aluno marca no app, T9).
class _HomeworkDose extends StatelessWidget {
  const _HomeworkDose({
    required this.label,
    required this.keyPrefix,
    required this.options,
    required this.value,
    required this.onChanged,
  });

  final String label;
  final String keyPrefix;
  final List<int> options;
  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ProfessorLinksKicker(label),
        const SizedBox(height: 6),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final o in options)
              AvailabilityChoiceChip(
                key: Key('$keyPrefix-$o'),
                label: '$o',
                selected: o == value,
                onTap: () => onChanged(o),
              ),
          ],
        ),
      ],
    );
  }
}
