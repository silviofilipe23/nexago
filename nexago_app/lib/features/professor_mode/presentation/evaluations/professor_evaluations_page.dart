import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../arena/domain/aulas/arena_class_logic.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_form_atoms.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_evaluations_providers.dart';
import '../../application/professor_students_providers.dart';
import '../../domain/professor_evaluations.dart';
import '../../infrastructure/professor_students_repository.dart';
import '../wallet/professor_wallet_widgets.dart';
import '../widgets/professor_students_widgets.dart';
import 'evaluation_widgets.dart';

/// Abre "Avaliar" do aluno (mês corrente, ou [period]).
void openProfessorEvaluate(
  BuildContext context,
  String athleteId, {
  String? period,
}) =>
    context.pushNamed(
      AppRouteNames.professorEvaluate,
      pathParameters: {'athleteId': athleteId},
      queryParameters: {if (period != null) 'period': period},
    );

/// Mais › Avaliações: pendentes do mês (sem avaliação enviada) e as
/// recentes (rascunhos e enviadas).
class ProfessorEvaluationsPage extends ConsumerWidget {
  const ProfessorEvaluationsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final async = ref.watch(professorEvaluationsProvider);
    final mine = async.valueOrNull;
    final period = ref.watch(professorEvaluationPeriodProvider);
    final pending = ref.watch(evaluationPendingProvider);
    return ProfessorLinksScaffold(
      title: 'Avaliações',
      subtitle: evaluationPeriodLabel(period).toUpperCase(),
      onBack: () => popOrGo(context, AppRoutes.professorMore),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: [
          if (mine == null && async.hasError)
            ProfessorRetryCard(
              message: 'Não foi possível carregar as avaliações.',
              onRetry: () => ref.invalidate(professorEvaluationsProvider),
            )
          else if (mine == null)
            const ProfessorWalletLoading()
          else ...[
            ProfessorLinksKicker(
              pending.isEmpty ? 'Pendentes' : 'Pendentes · ${pending.length}',
            ),
            const SizedBox(height: 4),
            if (pending.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child:
                    ProfessorMutedText('Todos os alunos avaliados neste mês.'),
              )
            else
              for (final s in pending)
                _StudentRow(
                  key: Key('evaluation-pending-${s.athleteId}'),
                  name: s.name,
                  photoUrl: s.photoUrl,
                  sub: evaluationFor(mine, s.athleteId, period) != null
                      ? 'Rascunho salvo'
                      : 'Sem avaliação este mês',
                  trailing: 'AVALIAR',
                  onTap: () => openProfessorEvaluate(context, s.athleteId),
                ),
            const SizedBox(height: 22),
            const ProfessorLinksKicker('Recentes'),
            const SizedBox(height: 4),
            if (mine.isEmpty)
              const ProfessorMutedText('Nenhuma avaliação ainda.')
            else
              for (final e in mine.take(30))
                _StudentRow(
                  key: Key('evaluation-${e.id}'),
                  name: e.athleteName,
                  sub: '${evaluationPeriodLabel(e.period)} · '
                      '${e.isSent ? 'enviada' : 'rascunho'}',
                  trailing: evaluationScoreLabel(e.overall),
                  trailingColor: e.isSent
                      ? colors.onSurface
                      : ProfessorLinksStyle.dim(colors),
                  onTap: () => openProfessorEvaluate(
                    context,
                    e.athleteId,
                    period: e.period,
                  ),
                ),
          ],
        ],
      ),
    );
  }
}

class _StudentRow extends StatelessWidget {
  const _StudentRow({
    super.key,
    required this.name,
    required this.sub,
    required this.trailing,
    required this.onTap,
    this.photoUrl,
    this.trailingColor,
  });

  final String name;
  final String sub;
  final String trailing;
  final String? photoUrl;
  final Color? trailingColor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(color: ProfessorLinksStyle.line(colors)),
          ),
        ),
        child: Row(
          children: [
            ArenaClassAvatar(
              initials: arenaClassInitials(name),
              photoUrl: photoUrl,
              size: 38,
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
                      weight: FontWeight.w600,
                      color: colors.onSurface,
                    ),
                  ),
                  Text(
                    sub,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11.5,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
              ),
            ),
            Text(
              trailing,
              style: ProfessorLinksStyle.mono(
                11,
                color: trailingColor ?? AppColors.brand,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A6 Avaliar: nota geral ao vivo (+delta vs mês anterior enviado),
/// fundamentos 0–10 em meio ponto, comentário, até 3 focos e nível sugerido.
/// Cada salvamento grava o formulário inteiro; "Enviar" avisa o aluno (uma
/// vez — editar uma enviada não reenvia).
class ProfessorEvaluatePage extends ConsumerStatefulWidget {
  const ProfessorEvaluatePage(
      {super.key, required this.athleteId, this.period});

  final String athleteId;
  final String? period;

  @override
  ConsumerState<ProfessorEvaluatePage> createState() =>
      _ProfessorEvaluatePageState();
}

class _ProfessorEvaluatePageState extends ConsumerState<ProfessorEvaluatePage> {
  final _comment = TextEditingController();
  final _focus = [
    TextEditingController(),
    TextEditingController(),
    TextEditingController(),
  ];
  String _sport = kEvaluationDefaultSport;
  Map<String, double> _scores = const {};
  String? _level;
  bool _loaded = false;
  bool _saving = false;

  @override
  void dispose() {
    _comment.dispose();
    for (final c in _focus) {
      c.dispose();
    }
    super.dispose();
  }

  void _init(ProfessorEvaluation? current, ProfessorEvaluation? previous) {
    _sport = current?.sport ?? previous?.sport ?? kEvaluationDefaultSport;
    _scores = evaluationInitialScores(
      _sport,
      current: current,
      previous: previous,
    );
    _comment.text = current?.comment ?? '';
    for (var i = 0; i < _focus.length; i++) {
      _focus[i].text =
          (current != null && i < current.focus.length) ? current.focus[i] : '';
    }
    _level = current?.suggestedLevel ?? previous?.suggestedLevel;
    _loaded = true;
  }

  Future<void> _save({
    required bool send,
    required String period,
    required String name,
  }) async {
    setState(() => _saving = true);
    try {
      final r = await ref.read(professorEvaluationsRepositoryProvider).save(
            ProfessorEvaluationInput(
              athleteId: widget.athleteId,
              period: period,
              sport: _sport,
              scores: _scores,
              comment: _comment.text,
              focus: [for (final c in _focus) c.text],
              suggestedLevel: _level,
              send: send,
            ),
          );
      if (!mounted) return;
      showAppSnackBar(
        context,
        r.status == ProfessorEvaluationStatus.sent
            ? (send ? 'Avaliação enviada para $name.' : 'Avaliação atualizada.')
            : 'Rascunho salvo.',
      );
      popOrGo(context, AppRoutes.professorEvaluations);
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      showAppSnackBar(
        context,
        e is ProfessorStudentsException
            ? e.message
            : 'Não foi possível salvar a avaliação.',
        isError: true,
      );
    }
  }

  Future<void> _delete(ProfessorEvaluation draft) async {
    final ok = await confirmProfessorWalletAction(
      context,
      title: 'Apagar rascunho?',
      body: 'A avaliação de ${evaluationPeriodLabel(draft.period)} é apagada.',
      confirmLabel: 'Apagar',
    );
    if (!ok || !mounted) return;
    final done = await runProfessorWalletAction(
      context,
      () => ref.read(professorEvaluationsRepositoryProvider).delete(draft.id),
      message: 'Rascunho apagado.',
    );
    if (done && mounted) popOrGo(context, AppRoutes.professorEvaluations);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final async = ref.watch(professorEvaluationsProvider);
    final mine = async.valueOrNull;
    final String period =
        widget.period ?? ref.watch(professorEvaluationPeriodProvider);
    final students = ref.watch(evaluableStudentsProvider);
    EvaluableStudent? student;
    for (final s in students) {
      if (s.athleteId == widget.athleteId) student = s;
    }
    final current =
        mine == null ? null : evaluationFor(mine, widget.athleteId, period);
    final previousPeriod = evaluationPreviousPeriod(period);
    final prevEval = mine == null
        ? null
        : evaluationFor(mine, widget.athleteId, previousPeriod);
    final previous = prevEval?.isSent ?? false ? prevEval : null;
    final name = student?.name ?? current?.athleteName ?? 'Aluno';

    if (mine == null) {
      return ProfessorLinksScaffold(
        title: 'Avaliar',
        onBack: () => popOrGo(context, AppRoutes.professorEvaluations),
        body: async.hasError
            ? Padding(
                padding: const EdgeInsets.all(20),
                child: ProfessorRetryCard(
                  message: 'Não foi possível carregar a avaliação.',
                  onRetry: () => ref.invalidate(professorEvaluationsProvider),
                ),
              )
            : const ProfessorWalletLoading(),
      );
    }
    if (!_loaded) _init(current, previous);

    // Presença das turmas (quando o aluno está numa).
    int? presence;
    for (final s
        in ref.watch(professorStudentsProvider).valueOrNull?.students ??
            const []) {
      if (s.athleteId == widget.athleteId && s.presenceRate != null) {
        presence = s.presenceRate;
      }
    }
    final overall = evaluationOverall(_sport, _scores);
    final delta = previous == null ? null : overall - previous.overall;
    final first = name.trim().split(RegExp(r'\s+')).first;
    final sent = current?.isSent ?? false;

    return ProfessorLinksScaffold(
      title: 'Avaliar $first',
      subtitle: [
        evaluationPeriodLabel(period),
        if (sent) 'enviada' else if (current != null) 'rascunho',
      ].join(' · ').toUpperCase(),
      onBack: () => popOrGo(context, AppRoutes.professorEvaluations),
      trailing: current != null && !sent
          ? ProfessorLinksRoundButton(
              key: const Key('evaluation-delete'),
              icon: Icons.delete_outline_rounded,
              semanticLabel: 'Apagar rascunho',
              onTap: () => _delete(current),
            )
          : null,
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              children: [
                ProfessorLinksCard(
                  child: Row(
                    children: [
                      ArenaClassAvatar(
                        initials: arenaClassInitials(name),
                        photoUrl: student?.photoUrl,
                        size: 48,
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              name,
                              style: ProfessorLinksStyle.display(
                                16,
                                color: colors.onSurface,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              [
                                if (presence != null) '$presence% presença',
                                if (previous != null)
                                  'mês anterior ${evaluationScoreLabel(previous.overall)}',
                              ].join(' · '),
                              style: AppTypography.bodyS.copyWith(
                                fontSize: 11.5,
                                color: ProfessorLinksStyle.dim(colors),
                              ),
                            ),
                          ],
                        ),
                      ),
                      EvaluationOverallBadge(overall: overall, delta: delta),
                    ],
                  ),
                ),
                const SizedBox(height: 18),
                const ProfessorLinksKicker('Esporte'),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final e in kEvaluationSportLabels.entries)
                      ArenaClassChip(
                        key: Key('evaluation-sport-${e.key}'),
                        label: e.value,
                        selected: _sport == e.key,
                        onTap: () => setState(() {
                          _sport = e.key;
                          _scores = evaluationInitialScores(
                            e.key,
                            current: current?.sport == e.key ? current : null,
                            previous:
                                previous?.sport == e.key ? previous : null,
                          );
                        }),
                      ),
                  ],
                ),
                const SizedBox(height: 22),
                const ProfessorLinksKicker('Fundamentos'),
                for (final (key, label) in evaluationFundamentals(_sport)) ...[
                  const SizedBox(height: 12),
                  EvaluationScoreRow(
                    key: Key('evaluation-score-$key'),
                    label: label,
                    value: _scores[key] ?? 0,
                    previous: previous?.sport == _sport
                        ? previous?.scores[key]
                        : null,
                    onChanged: (v) =>
                        setState(() => _scores = {..._scores, key: v}),
                  ),
                ],
                const SizedBox(height: 22),
                ProfessorWalletField(
                  key: const Key('evaluation-comment'),
                  label: 'Comentário',
                  hint: 'O que evoluiu e o que treinar',
                  controller: _comment,
                  maxLength: kEvaluationCommentMax,
                  textCapitalization: TextCapitalization.sentences,
                ),
                const SizedBox(height: 18),
                const ProfessorLinksKicker('Foco do próximo mês (até 3)'),
                for (var i = 0; i < _focus.length; i++) ...[
                  const SizedBox(height: 8),
                  ProfessorWalletField(
                    key: Key('evaluation-focus-$i'),
                    label: 'Foco ${i + 1}',
                    controller: _focus[i],
                    maxLength: kEvaluationFocusLength,
                    textCapitalization: TextCapitalization.sentences,
                  ),
                ],
                const SizedBox(height: 18),
                const ProfessorLinksKicker('Nível sugerido'),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  children: [
                    ArenaClassChip(
                      key: const Key('evaluation-level-none'),
                      label: 'Sem sugestão',
                      selected: _level == null,
                      onTap: () => setState(() => _level = null),
                    ),
                    for (final e in kEvaluationLevels.entries)
                      ArenaClassChip(
                        key: Key('evaluation-level-${e.key}'),
                        label: e.value,
                        selected: _level == e.key,
                        onTap: () => setState(() => _level = e.key),
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
                  if (!sent) ...[
                    Expanded(
                      child: ProfessorLinksGhostButton(
                        key: const Key('evaluation-save-draft'),
                        label: 'Rascunho',
                        height: 52,
                        loading: _saving,
                        onPressed: () =>
                            _save(send: false, period: period, name: first),
                      ),
                    ),
                    const SizedBox(width: 8),
                  ],
                  Expanded(
                    flex: 2,
                    child: ProfessorLinksPrimaryButton(
                      key: const Key('evaluation-send'),
                      label: sent ? 'Salvar alterações' : 'Enviar para $first',
                      loading: _saving,
                      onPressed: () =>
                          _save(send: true, period: period, name: first),
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

/// Faixa da avaliação nas telas do aluno (B3/B4): a nota mais recente
/// enviada com o delta ("7.2 +0.8") e o botão "Avaliar".
class StudentEvaluationStrip extends ConsumerWidget {
  const StudentEvaluationStrip({super.key, required this.athleteId});

  final String athleteId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final mine =
        ref.watch(professorEvaluationsProvider).valueOrNull ?? const [];
    final latest = latestSentFor(mine, athleteId);
    return ProfessorLinksCard(
      key: Key('student-evaluation-strip-$athleteId'),
      padding: const EdgeInsets.fromLTRB(14, 10, 10, 10),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const ProfessorLinksKicker('Avaliação'),
                const SizedBox(height: 2),
                Text(
                  latest == null
                      ? 'Ainda sem avaliação enviada'
                      : evaluationPeriodLabel(latest.period),
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 12,
                    color: ProfessorLinksStyle.mute(colors),
                  ),
                ),
              ],
            ),
          ),
          if (latest != null) ...[
            EvaluationOverallBadge(
              overall: latest.overall,
              delta: latest.delta,
              size: 22,
            ),
            const SizedBox(width: 10),
          ],
          TextButton(
            key: Key('student-evaluate-$athleteId'),
            onPressed: () => openProfessorEvaluate(context, athleteId),
            child: const Text('Avaliar'),
          ),
        ],
      ),
    );
  }
}
