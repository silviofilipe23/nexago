import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../arena/domain/aulas/arena_class_logic.dart';
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../application/athlete_training_providers.dart';
import '../domain/athlete_training.dart';
import '../domain/class_review.dart';
import '../infrastructure/class_presence_repository.dart'
    show ClassPresenceException;
import '../infrastructure/class_review_repository.dart';
import 'widgets/class_review_widgets.dart';
import 'widgets/training_origin_widgets.dart';
import 'widgets/training_widgets.dart';

/// Avaliar aulas (protótipo `at-avaliar.jsx`): A1 "Como foi?", A2–A5 o
/// formulário por origem, A6 avaliação enviada e A7 minhas avaliações.

/// "o centro" / "a arena" / "o professor".
String _whoLabel(TrainingOrigin o) => switch (o) {
      TrainingOrigin.center => 'o centro',
      TrainingOrigin.arena => 'a arena',
      TrainingOrigin.private => 'o professor',
    };

String _durationLabel(TrainingSession t) {
  final m = t.endAt.difference(t.startAt).inMinutes;
  return m > 0 ? '$m min' : '';
}

// ── A1 ───────────────────────────────────────────────────────────────────

/// A1 · Treino concluído — "Como foi a aula?" com as estrelas rápidas do
/// treino mais recente; continuar abre o formulário com a nota já marcada.
class AthleteTrainingReviewStartPage extends ConsumerStatefulWidget {
  const AthleteTrainingReviewStartPage({super.key});

  @override
  ConsumerState<AthleteTrainingReviewStartPage> createState() =>
      _AthleteTrainingReviewStartPageState();
}

class _AthleteTrainingReviewStartPageState
    extends ConsumerState<AthleteTrainingReviewStartPage> {
  int _stars = 0;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final pending = ref.watch(pendingClassReviewsProvider);
    final now = ref.watch(professorLinksClockProvider)();

    Widget body;
    if (pending == null) {
      body = const Center(
        child: CircularProgressIndicator(color: AppColors.brand),
      );
    } else if (pending.isEmpty) {
      body = ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          ProfessorLinksCard(
            key: const Key('review-start-empty'),
            child: Text(
              'Nenhum treino esperando avaliação. Treinos com presença '
              'aparecem aqui por $kClassReviewWindowDays dias.',
              style: AppTypography.bodyS.copyWith(
                fontSize: 13,
                height: 1.45,
                color: ProfessorLinksStyle.mute(colors),
              ),
            ),
          ),
          const SizedBox(height: 12),
          ProfessorLinksGhostButton(
            label: 'Minhas avaliações',
            onPressed: () =>
                context.pushNamed(AppRouteNames.athleteTrainingReviews),
          ),
        ],
      );
    } else {
      final first = pending.first;
      final t = first.training;
      final others = pending.skip(1).toList();
      final sub = [
        t.title,
        t.arenaName.isEmpty ? t.centerName : t.arenaName,
        _durationLabel(t)
      ].where((s) => s.isNotEmpty).join(' · ');
      final names = [
        t.professorName,
        if (t.origin == TrainingOrigin.arena) t.arenaName,
        if (t.origin == TrainingOrigin.center) t.centerName,
      ].where((s) => s.trim().isNotEmpty).toList();
      body = ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          const SizedBox(height: 10),
          Center(
            child: Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: colors.win.withValues(alpha: 0.12),
                border: Border.all(color: colors.win.withValues(alpha: 0.4)),
              ),
              child: Icon(
                Icons.check_rounded,
                size: 30,
                color: colors.readableTone(colors.win),
              ),
            ),
          ),
          const SizedBox(height: 14),
          Text(
            'Treino concluído',
            textAlign: TextAlign.center,
            style: ProfessorLinksStyle.display(25, color: colors.onSurface),
          ),
          const SizedBox(height: 6),
          Text(
            sub,
            textAlign: TextAlign.center,
            style: AppTypography.bodyS.copyWith(
              fontSize: 13,
              color: ProfessorLinksStyle.mute(colors),
            ),
          ),
          const SizedBox(height: 18),
          Container(
            key: const Key('review-start-card'),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: colors.surfaceCard,
              borderRadius: BorderRadius.circular(22),
              border: Border.all(
                color: AppColors.brand.withValues(alpha: 0.32),
              ),
              gradient: RadialGradient(
                center: const Alignment(1, -1),
                radius: 1.2,
                colors: [
                  AppColors.brand.withValues(alpha: 0.14),
                  AppColors.brand.withValues(alpha: 0),
                ],
              ),
            ),
            child: Column(
              children: [
                Text(
                  t.origin == TrainingOrigin.private
                      ? 'Como foi a particular?'
                      : 'Como foi a aula?',
                  style: ProfessorLinksStyle.display(
                    16,
                    weight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 12),
                ReviewStars(
                  value: _stars,
                  size: 38,
                  gap: 10,
                  keyPrefix: 'review-start-star',
                  onChanged: (n) => setState(() => _stars = n),
                ),
                const SizedBox(height: 10),
                Text(
                  _stars > 0
                      ? '${kReviewStarLabels[_stars]} · toque para detalhar'
                      : 'Leva 20 segundos',
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 12,
                    color: _stars > 0
                        ? colors.onSurface
                        : ProfessorLinksStyle.dim(colors),
                  ),
                ),
                if (_stars > 0) ...[
                  const SizedBox(height: 12),
                  ProfessorLinksPrimaryButton(
                    key: const Key('review-start-continue'),
                    label: 'Continuar',
                    height: 44,
                    onPressed: () =>
                        openClassReview(context, first.key, stars: _stars),
                  ),
                ],
              ],
            ),
          ),
          if (t.origin != TrainingOrigin.private && names.isNotEmpty) ...[
            const SizedBox(height: 14),
            Row(
              children: [
                for (var i = 0; i < names.length; i++)
                  Transform.translate(
                    offset: Offset(-8.0 * i, 0),
                    child: ArenaClassAvatar(
                      initials: arenaClassInitials(names[i]),
                      size: 28,
                      color: i == 0
                          ? ProfessorLinksStyle.blue
                          : trainingOriginColor(t.origin),
                    ),
                  ),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    'Na próxima tela você avalia a aula, o professor e '
                    '${_whoLabel(t.origin)} separadamente.',
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11.5,
                      height: 1.4,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ),
              ],
            ),
          ],
          if (others.isNotEmpty) ...[
            const TrainingSectionTitle('Também esperando avaliação'),
            for (final p in others) ...[
              _PendingRow(pending: p, now: now),
              const SizedBox(height: 10),
            ],
          ],
        ],
      );
    }

    return ProfessorLinksScaffold(
      title: 'Avaliar treino',
      subtitle: pending == null || pending.isEmpty
          ? 'AVALIAÇÕES'
          : '${pending.length} ${pending.length == 1 ? 'PENDENTE' : 'PENDENTES'}',
      onBack: () => popOrGo(context, AppRoutes.athleteTrainings),
      body: body,
    );
  }
}

/// Linha "para avaliar" (A1 e A7).
class _PendingRow extends StatelessWidget {
  const _PendingRow({required this.pending, required this.now});

  final PendingReview pending;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final t = pending.training;
    final who = [
      t.professorName,
      if (t.origin == TrainingOrigin.center) t.centerName,
      if (t.origin == TrainingOrigin.arena) t.arenaName,
    ].where((s) => s.trim().isNotEmpty).join(' · ');
    return ProfessorLinksCard(
      key: Key('review-pending-${pending.key}'),
      padding: EdgeInsets.zero,
      onTap: () => openClassReview(context, pending.key),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              width: 3,
              margin: const EdgeInsets.fromLTRB(0, 12, 12, 12),
              decoration: BoxDecoration(
                color: trainingOriginColor(t.origin),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      '${reviewDayLabel(t.dateKey, t.startTime)} · '
                              'expira em ${reviewExpiryLabel(pending.expiresAt, now)}'
                          .toUpperCase(),
                      style: ProfessorLinksStyle.mono(
                        9.5,
                        color: ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      t.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: ProfessorLinksStyle.display(
                        13.5,
                        weight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                    if (who.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        who,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.bodyS.copyWith(
                          fontSize: 11.5,
                          color: ProfessorLinksStyle.dim(colors),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 0, 13, 0),
              child: Center(
                child: SizedBox(
                  height: 34,
                  child: FilledButton(
                    onPressed: () => openClassReview(context, pending.key),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brand,
                      foregroundColor: ProfessorLinksStyle.onBrand,
                      padding: const EdgeInsets.symmetric(horizontal: 13),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                      textStyle: AppTypography.labelL.copyWith(fontSize: 12),
                    ),
                    child: const Text('Avaliar'),
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

// ── A2–A6 ────────────────────────────────────────────────────────────────

/// A2 (arena), A3 (centro), A4 (particular), A5 (nota baixa) e, depois de
/// enviar, A6. Edita a avaliação já enviada enquanto o prazo deixar.
class AthleteTrainingReviewPage extends ConsumerStatefulWidget {
  const AthleteTrainingReviewPage({
    super.key,
    required this.reviewKey,
    this.initialStars = 0,
  });

  final String reviewKey;

  /// Estrelas do A1 — vão para a primeira parte (aula; professor na
  /// particular).
  final int initialStars;

  @override
  ConsumerState<AthleteTrainingReviewPage> createState() =>
      _AthleteTrainingReviewPageState();
}

class _AthleteTrainingReviewPageState
    extends ConsumerState<AthleteTrainingReviewPage> {
  final _comment = TextEditingController();
  Map<ReviewPart, PartScore>? _scores;
  bool _showName = true;
  bool _wantsContact = true;
  bool _sending = false;
  String? _error;

  /// Depois de enviar: `true` se abriu chamado.
  bool? _sentTicket;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  /// Preenche uma vez, quando o treino (e a avaliação já enviada) chegam.
  void _init(TrainingSession t, ClassReview? existing) {
    if (_scores != null) return;
    final parts = reviewPartsFor(t.origin);
    if (existing != null) {
      _scores = {
        for (final p in parts) p: existing.scores[p] ?? const PartScore()
      };
      _comment.text = existing.comment;
      _showName = existing.showName;
      _wantsContact = existing.wantsContact || existing.ticket == null;
    } else {
      _scores = {for (final p in parts) p: const PartScore()};
      final n = widget.initialStars.clamp(0, 5);
      if (n > 0) _scores![parts.first] = const PartScore().withStars(n);
    }
  }

  Future<void> _send(TrainingSession t) async {
    final scores = _scores!;
    final low = scores.values.any((s) => s.isLow);
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final ticket = await ref.read(classReviewRepositoryProvider).submit(
            ClassReviewDraft(
              training: t,
              scores: scores,
              comment: _comment.text,
              showName: _showName,
              wantsContact:
                  low && t.origin != TrainingOrigin.private && _wantsContact,
            ),
          );
      if (mounted) setState(() => _sentTicket = ticket);
    } on ClassPresenceException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Não foi possível enviar sua avaliação.');
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final trainings = ref.watch(athleteTrainingsProvider);
    final reviews = ref.watch(myClassReviewsProvider);
    final now = ref.watch(professorLinksClockProvider)();
    TrainingSession? t;
    for (final s in trainings ?? const <TrainingSession>[]) {
      if (classReviewKey(s) == widget.reviewKey) t = s;
    }
    ClassReview? existing;
    for (final r in reviews.valueOrNull ?? const <ClassReview>[]) {
      if (r.key == widget.reviewKey) existing = r;
    }
    final loading = trainings == null || !reviews.hasValue;
    if (t != null && !loading) _init(t, existing);

    final title = _sentTicket != null ? 'Avaliação enviada' : 'Avaliar treino';
    if (loading) {
      return ProfessorLinksScaffold(
        title: title,
        onBack: () => popOrGo(context, AppRoutes.athleteTrainings),
        body: const Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
      );
    }
    if (t == null) {
      return ProfessorLinksScaffold(
        title: title,
        onBack: () => popOrGo(context, AppRoutes.athleteTrainings),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            ProfessorLinksCard(
              key: const Key('review-not-found'),
              child: Text(
                'Não encontramos este treino. Avaliações ficam abertas por '
                '$kClassReviewWindowDays dias depois da aula.',
                style: AppTypography.bodyS.copyWith(
                  fontSize: 13,
                  height: 1.45,
                  color: ProfessorLinksStyle.mute(colors),
                ),
              ),
            ),
          ],
        ),
      );
    }
    final training = t;
    if (_sentTicket != null) {
      return _SentView(
        training: training,
        scores: _scores!,
        showName: _showName,
        ticketOpened: _sentTicket!,
      );
    }

    final scores = _scores!;
    final targets = reviewTargetsFor(training);
    final done = scores.values.where((s) => s.isSet).length;
    final ready = done == scores.length;
    final low = scores.values.any((s) => s.isLow);
    final readOnly = existing != null && !existing.canEdit(now);
    final who = _whoLabel(training.origin);

    return ProfessorLinksScaffold(
      title: 'Avaliar treino',
      subtitle: '${reviewDayLabel(training.dateKey, training.startTime)} · '
          '${switch (training.origin) {
        TrainingOrigin.private => 'PARTICULAR',
        TrainingOrigin.arena => 'ARENA',
        TrainingOrigin.center => 'CENTRO',
      }}',
      onBack: () => popOrGo(context, AppRoutes.athleteTrainings),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              key: const Key('review-form'),
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              children: [
                ReviewSessionCard(training: training),
                if (readOnly) ...[
                  const SizedBox(height: 12),
                  const ProfessorLinksNote(
                    'O prazo para editar esta avaliação acabou.',
                    tone: ProfessorLinksNoteTone.yellow,
                  ),
                ],
                TrainingSectionTitle(
                  targets.length == 1
                      ? 'Avalie o professor'
                      : 'Avalie cada parte · $done/${targets.length}',
                ),
                for (final target in targets) ...[
                  IgnorePointer(
                    ignoring: readOnly,
                    child: ReviewPartBlock(
                      target: target,
                      score: scores[target.part]!,
                      onChanged: (s) =>
                          setState(() => _scores![target.part] = s),
                    ),
                  ),
                  const SizedBox(height: 10),
                ],
                if (low && training.origin != TrainingOrigin.private) ...[
                  ReviewSwitchRow(
                    key: const Key('review-contact'),
                    danger: true,
                    title: 'Pedir retorno d$who',
                    subtitle: 'A gestão recebe sua avaliação como chamado e '
                        'responde aqui no app.',
                    value: _wantsContact,
                    onChanged: readOnly
                        ? (_) {}
                        : (v) => setState(() => _wantsContact = v),
                  ),
                  const SizedBox(height: 10),
                ],
                const TrainingSectionTitle('Comentário'),
                TextField(
                  key: const Key('review-comment'),
                  controller: _comment,
                  enabled: !readOnly,
                  minLines: 3,
                  maxLines: 6,
                  maxLength: kClassReviewCommentMax,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 13,
                    height: 1.45,
                    color: colors.onSurface,
                  ),
                  decoration: InputDecoration(
                    hintText:
                        'Conte o que funcionou ou o que faltou (opcional)',
                    hintStyle: AppTypography.bodyS.copyWith(
                      fontSize: 13,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                    filled: true,
                    fillColor: colors.surfaceRaised,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: BorderSide(
                        color: ProfessorLinksStyle.line2(colors),
                      ),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: BorderSide(
                        color: ProfessorLinksStyle.line2(colors),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                ReviewSwitchRow(
                  key: const Key('review-show-name'),
                  title: 'Mostrar meu nome',
                  subtitle: _showName
                      ? 'O professor${training.origin == TrainingOrigin.private ? '' : ' e $who'} '
                          'veem quem avaliou.'
                      : 'Sua avaliação entra na média sem seu nome.',
                  value: _showName,
                  onChanged:
                      readOnly ? (_) {} : (v) => setState(() => _showName = v),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 10),
                  ProfessorLinksNote(
                    _error!,
                    tone: ProfessorLinksNoteTone.red,
                  ),
                ],
              ],
            ),
          ),
          if (!readOnly)
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ProfessorLinksPrimaryButton(
                      key: const Key('review-send'),
                      label: existing == null
                          ? 'Enviar avaliação'
                          : 'Salvar alterações',
                      loading: _sending,
                      onPressed: ready ? () => _send(training) : null,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      ready
                          ? 'Você pode editar por $kClassReviewEditDays dias'
                          : 'Falta avaliar ${scores.length - done}',
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 11,
                        color: ProfessorLinksStyle.dim(colors),
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

/// A6 · Avaliação enviada — as notas e quem vê o quê.
class _SentView extends ConsumerWidget {
  const _SentView({
    required this.training,
    required this.scores,
    required this.showName,
    required this.ticketOpened,
  });

  final TrainingSession training;
  final Map<ReviewPart, PartScore> scores;
  final bool showName;
  final bool ticketOpened;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final t = training;
    final targets = reviewTargetsFor(t);
    final placeName = targets
        .where((x) => x.part == ReviewPart.place)
        .map((x) => x.title)
        .firstOrNull;
    final pending = (ref.watch(pendingClassReviewsProvider) ?? const [])
        .where((p) => p.key != classReviewKey(t))
        .toList();
    final viewers = <(String, String, Color?)>[
      (
        t.professorName.isEmpty ? 'Professor' : t.professorName,
        'Vê a nota e o seu comentário',
        ProfessorLinksStyle.blue,
      ),
      if (placeName != null)
        (
          placeName,
          showName
              ? 'Vê as notas e o comentário com seu nome'
              : 'Vê as notas e o comentário, sem seu nome',
          trainingOriginColor(t.origin),
        ),
      ('Perfil público', 'Só a média, sem comentários', null),
    ];
    return ProfessorLinksScaffold(
      title: 'Avaliar treino',
      onBack: () => popOrGo(context, AppRoutes.athleteTrainings),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              key: const Key('review-sent'),
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              children: [
                const SizedBox(height: 8),
                Center(
                  child: Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: colors.win.withValues(alpha: 0.12),
                      border:
                          Border.all(color: colors.win.withValues(alpha: 0.4)),
                    ),
                    child: Icon(
                      Icons.check_rounded,
                      size: 30,
                      color: colors.readableTone(colors.win),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  'Avaliação enviada',
                  textAlign: TextAlign.center,
                  style:
                      ProfessorLinksStyle.display(24, color: colors.onSurface),
                ),
                const SizedBox(height: 6),
                Text(
                  ticketOpened && placeName != null
                      ? '$placeName recebeu seu pedido de retorno e responde '
                          'aqui no app.'
                      : 'Obrigado! Sua avaliação ajuda '
                          '${_whoLabel(t.origin)} a melhorar.',
                  textAlign: TextAlign.center,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 13,
                    height: 1.45,
                    color: ProfessorLinksStyle.mute(colors),
                  ),
                ),
                const SizedBox(height: 16),
                ProfessorLinksCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              '${reviewDayLabel(t.dateKey, '')} · ${t.title}'
                                  .toUpperCase(),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: ProfessorLinksStyle.mono(
                                9.5,
                                color: ProfessorLinksStyle.dim(colors),
                              ),
                            ),
                          ),
                          TrainingOriginTag(t.origin),
                        ],
                      ),
                      for (final target in targets) ...[
                        const SizedBox(height: 11),
                        Divider(
                          height: 1,
                          color: ProfessorLinksStyle.line(colors),
                        ),
                        const SizedBox(height: 11),
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                target.title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: AppTypography.bodyS.copyWith(
                                  fontSize: 13,
                                  color: colors.onSurface,
                                ),
                              ),
                            ),
                            ReviewStars(
                              value: scores[target.part]?.stars ?? 0,
                              size: 15,
                              gap: 3,
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
                const TrainingSectionTitle('Quem vê'),
                for (final (name, desc, color) in viewers) ...[
                  Row(
                    children: [
                      if (color != null)
                        ArenaClassAvatar(
                          initials: arenaClassInitials(name),
                          size: 34,
                          color: color,
                        )
                      else
                        Container(
                          width: 34,
                          height: 34,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: colors.surfaceRaised,
                            border: Border.all(
                              color: ProfessorLinksStyle.line2(colors),
                            ),
                          ),
                          child: Icon(
                            Icons.visibility_outlined,
                            size: 16,
                            color: ProfessorLinksStyle.mute(colors),
                          ),
                        ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              name,
                              style: ProfessorLinksStyle.display(
                                13,
                                weight: FontWeight.w600,
                                color: colors.onSurface,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              desc,
                              style: AppTypography.bodyS.copyWith(
                                fontSize: 11.5,
                                color: ProfessorLinksStyle.dim(colors),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                ],
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (pending.isNotEmpty) ...[
                    ProfessorLinksPrimaryButton(
                      key: const Key('review-next'),
                      label: 'Avaliar próximo · ${pending.length} '
                          '${pending.length == 1 ? 'pendente' : 'pendentes'}',
                      onPressed: () => context.pushReplacementNamed(
                        AppRouteNames.athleteTrainingReview,
                        pathParameters: {'key': pending.first.key},
                      ),
                    ),
                    const SizedBox(height: 8),
                  ],
                  ProfessorLinksGhostButton(
                    key: const Key('review-done'),
                    label: 'Voltar aos treinos',
                    height: 44,
                    onPressed: () =>
                        context.goNamed(AppRouteNames.athleteTrainings),
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

// ── A7 ───────────────────────────────────────────────────────────────────

/// A7 · Minhas avaliações — para avaliar (com o prazo) e enviadas, com a
/// resposta da gestão quando houver.
class AthleteTrainingReviewsPage extends ConsumerStatefulWidget {
  const AthleteTrainingReviewsPage({super.key});

  @override
  ConsumerState<AthleteTrainingReviewsPage> createState() =>
      _AthleteTrainingReviewsPageState();
}

class _AthleteTrainingReviewsPageState
    extends ConsumerState<AthleteTrainingReviewsPage> {
  TrainingOrigin? _origin;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final pendingAll = ref.watch(pendingClassReviewsProvider);
    final reviewsAsync = ref.watch(myClassReviewsProvider);
    final sentAll = reviewsAsync.valueOrNull;
    final now = ref.watch(professorLinksClockProvider)();
    final origins = {
      for (final p in pendingAll ?? const <PendingReview>[]) p.training.origin,
      for (final r in sentAll ?? const <ClassReview>[]) r.origin,
    }.toList()
      ..sort((a, b) => a.index.compareTo(b.index));
    final pending = [
      for (final p in pendingAll ?? const <PendingReview>[])
        if (_origin == null || p.training.origin == _origin) p,
    ];
    final sent = [
      for (final r in sentAll ?? const <ClassReview>[])
        if (_origin == null || r.origin == _origin) r,
    ];
    final loading = pendingAll == null || sentAll == null;

    return ProfessorLinksScaffold(
      title: 'Minhas avaliações',
      subtitle: loading
          ? 'AVALIAÇÕES'
          : '${pendingAll.length} '
              '${pendingAll.length == 1 ? 'PENDENTE' : 'PENDENTES'} · '
              '${sentAll.length} '
              '${sentAll.length == 1 ? 'ENVIADA' : 'ENVIADAS'}',
      onBack: () => popOrGo(context, AppRoutes.athleteTrainings),
      body: loading && reviewsAsync.hasError
          ? Padding(
              padding: const EdgeInsets.all(20),
              child: ProfessorLinksNote(
                'Não foi possível carregar suas avaliações.',
                tone: ProfessorLinksNoteTone.red,
              ),
            )
          : loading
              ? const Center(
                  child: CircularProgressIndicator(color: AppColors.brand),
                )
              : ListView(
                  key: const Key('reviews-list'),
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
                  children: [
                    if (origins.length > 1) ...[
                      TrainingOriginFilter(
                        origins: origins,
                        selected: _origin,
                        onChanged: (o) => setState(() => _origin = o),
                      ),
                      const SizedBox(height: 4),
                    ],
                    if (pending.isNotEmpty) ...[
                      const TrainingSectionTitle('Para avaliar'),
                      for (final p in pending) ...[
                        _PendingRow(pending: p, now: now),
                        const SizedBox(height: 10),
                      ],
                    ],
                    const TrainingSectionTitle('Enviadas'),
                    if (sent.isEmpty)
                      ProfessorLinksCard(
                        key: const Key('reviews-empty'),
                        child: Text(
                          'Você ainda não avaliou nenhum treino.',
                          style: AppTypography.bodyS.copyWith(
                            fontSize: 13,
                            color: ProfessorLinksStyle.mute(colors),
                          ),
                        ),
                      )
                    else
                      for (final r in sent) ...[
                        _SentReviewCard(review: r, now: now),
                        const SizedBox(height: 10),
                      ],
                  ],
                ),
    );
  }
}

class _SentReviewCard extends StatelessWidget {
  const _SentReviewCard({required this.review, required this.now});

  final ClassReview review;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final r = review;
    final ticket = r.ticket;
    final canEdit = r.canEdit(now);
    return ProfessorLinksCard(
      key: Key('review-sent-${r.key}'),
      onTap: canEdit ? () => openClassReview(context, r.key) : null,
      padding: const EdgeInsets.all(13),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(
                reviewDayLabel(r.date, '').toUpperCase(),
                style: ProfessorLinksStyle.mono(
                  9.5,
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  r.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ProfessorLinksStyle.display(
                    13,
                    weight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
              ),
              TrainingOriginTag(r.origin),
            ],
          ),
          const SizedBox(height: 10),
          ReviewScoreChips(review: r),
          if (ticket != null) ...[
            const SizedBox(height: 10),
            _TicketBox(review: r, ticket: ticket),
          ],
          if (canEdit) ...[
            const SizedBox(height: 8),
            Text(
              'Toque para editar',
              style: AppTypography.bodyS.copyWith(
                fontSize: 11,
                color: ProfessorLinksStyle.dim(colors),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _TicketBox extends StatelessWidget {
  const _TicketBox({required this.review, required this.ticket});

  final ClassReview review;
  final ReviewTicket ticket;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final reply = ticket.reply;
    final who = ticket.repliedByName ??
        (review.placeName.isEmpty ? 'Gestão' : '${review.placeName} · gestão');
    final (label, tone) = switch (ticket.status) {
      'resolved' => ('RESOLVIDO', colors.win),
      'answered' => ('RESPONDIDO', colors.win),
      _ => ('AGUARDANDO RETORNO', colors.pending),
    };
    return Container(
      key: Key('review-ticket-${review.key}'),
      padding: const EdgeInsets.all(11),
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.22)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TrainingOriginMark(
            origin: review.origin,
            name: review.placeName.isEmpty ? 'G' : review.placeName,
            size: 28,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        who,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: ProfessorLinksStyle.display(
                          12,
                          weight: FontWeight.w700,
                          color: colors.onSurface,
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      label,
                      style: ProfessorLinksStyle.mono(
                        8.5,
                        color: colors.readableTone(tone),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  reply ?? 'Você pediu retorno. A gestão responde por aqui.',
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 12,
                    height: 1.45,
                    color: ProfessorLinksStyle.mute(colors),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
