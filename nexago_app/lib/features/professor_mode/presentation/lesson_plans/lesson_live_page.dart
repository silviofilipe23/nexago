import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/navigation_helpers.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/time/nexago_event_timezone.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../application/professor_agenda_providers.dart';
import '../../application/professor_lesson_plans_providers.dart';
import '../../domain/professor_lesson_plans.dart';
import '../wallet/professor_wallet_widgets.dart';
import '../widgets/professor_students_widgets.dart';
import 'lesson_plan_widgets.dart';

/// Abre o modo aula (H6) do plano.
void openLessonLive(BuildContext context, String planId) {
  context.pushNamed(
    AppRouteNames.professorLessonLive,
    queryParameters: {'planId': planId},
  );
}

/// Abre o registro pós-aula (H7) do plano.
void openLessonReview(BuildContext context, String planId) {
  context.pushNamed(
    AppRouteNames.professorLessonReview,
    queryParameters: {'planId': planId},
  );
}

/// H6 · Modo aula: cronômetro do bloco em andamento, nota (inclusive a
/// privada — a tela é do professor), foco individual e o próximo bloco. Só
/// no aparelho: nada vai ao servidor e o estado some ao sair. Em zero o
/// cronômetro passa a contar o excedente; o bloco não avança sozinho.
class ProfessorLessonLivePage extends ConsumerStatefulWidget {
  const ProfessorLessonLivePage({super.key, required this.planId});

  final String planId;

  @override
  ConsumerState<ProfessorLessonLivePage> createState() =>
      _ProfessorLessonLivePageState();
}

class _ProfessorLessonLivePageState
    extends ConsumerState<ProfessorLessonLivePage> {
  int _index = 0;
  Duration _accum = Duration.zero;
  DateTime? _since;
  Timer? _ticker;
  late final Future<void> Function(bool) _wakelock;

  DateTime _now() => ref.read(lessonLiveClockProvider)();

  @override
  void initState() {
    super.initState();
    _since = _now();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
    _wakelock = ref.read(lessonLiveWakelockProvider);
    unawaited(_wakelock(true));
  }

  @override
  void dispose() {
    _ticker?.cancel();
    unawaited(_wakelock(false));
    super.dispose();
  }

  bool get _running => _since != null;

  Duration get _elapsed =>
      _accum + (_since == null ? Duration.zero : _now().difference(_since!));

  void _toggle() => setState(() {
        if (_running) {
          _accum = _elapsed;
          _since = null;
        } else {
          _since = _now();
        }
      });

  void _next() => setState(() {
        _index++;
        _accum = Duration.zero;
        if (_running) _since = _now();
      });

  Future<bool> _confirmLeave() async {
    final r = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sair do modo aula?'),
        content: const Text(
          'O cronômetro para e o andamento desta aula não fica salvo.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Continuar aula'),
          ),
          FilledButton(
            key: const Key('lesson-live-leave'),
            style: FilledButton.styleFrom(backgroundColor: AppColors.live),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Sair'),
          ),
        ],
      ),
    );
    return r == true;
  }

  bool _leaving = false;

  Future<void> _leave() async {
    if (!await _confirmLeave() || !mounted) return;
    setState(() => _leaving = true);
    popOrGo(context, AppRoutes.professorLessonPlans);
  }

  void _finish() {
    setState(() => _leaving = true);
    context.pushReplacementNamed(
      AppRouteNames.professorLessonReview,
      queryParameters: {'planId': widget.planId},
    );
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(professorLessonPlanByIdProvider(widget.planId));
    final plan = async.valueOrNull;
    if (plan == null || plan.blocks.isEmpty) {
      return ProfessorLinksScaffold(
        title: 'Modo aula',
        onBack: () => popOrGo(context, AppRoutes.professorLessonPlans),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            if (!async.hasValue && !async.hasError)
              const ProfessorWalletLoading()
            else
              const ProfessorLinksCard(
                key: Key('lesson-live-missing'),
                child: ProfessorMutedText(
                  'Plano sem blocos. Monte o roteiro antes de iniciar a aula.',
                ),
              ),
          ],
        ),
      );
    }
    final colors = context.themeColors;
    final index = _index.clamp(0, plan.blocks.length - 1);
    final block = plan.blocks[index];
    final next = index + 1 < plan.blocks.length ? plan.blocks[index + 1] : null;
    final remaining = lessonLiveRemaining(block.minutes, _elapsed);
    final over = remaining.isNegative;
    final total = Duration(minutes: block.minutes).inSeconds;
    final percent = total == 0
        ? 100
        : ((_elapsed.inSeconds / total) * 100).round().clamp(0, 100);
    final c = lessonPlanCategoryColor(block.category);
    final local = toNexagoEventLocal(_now());
    final clock = '${local.hour.toString().padLeft(2, '0')}:'
        '${local.minute.toString().padLeft(2, '0')}';

    return PopScope(
      canPop: _leaving,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _leave();
      },
      child: ProfessorLinksScaffold(
        title: plan.title,
        subtitle: '${_running ? 'AO VIVO' : 'PAUSADO'} · $clock · '
            'BLOCO ${index + 1} DE ${plan.blocks.length}',
        onBack: _leave,
        body: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                children: [
                  LessonPlanTimeBar(
                    segments: lessonPlanSegmentsOf(plan.blocks),
                    durationMin: plan.totalMinutes,
                    height: 6,
                    activeIndex: index,
                  ),
                  const SizedBox(height: 14),
                  Container(
                    padding: const EdgeInsets.fromLTRB(18, 22, 18, 20),
                    decoration: BoxDecoration(
                      color: Color.alphaBlend(
                        c.withValues(alpha: 0.08),
                        colors.surfaceCard,
                      ),
                      borderRadius: BorderRadius.circular(22),
                      border: Border.all(color: c.withValues(alpha: 0.3)),
                    ),
                    child: Column(
                      children: [
                        LessonPlanCategoryTag(block.category, small: false),
                        const SizedBox(height: 10),
                        Text(
                          block.name,
                          key: const Key('lesson-live-name'),
                          textAlign: TextAlign.center,
                          style: ProfessorLinksStyle.display(
                            19,
                            color: colors.onSurface,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          lessonLiveClockLabel(remaining),
                          key: const Key('lesson-live-clock'),
                          style: AppTypography.mono(
                            fontSize: 62,
                            fontWeight: FontWeight.w700,
                            color: over
                                ? colors.readableTone(AppColors.pending)
                                : _running
                                    ? colors.onSurface
                                    : ProfessorLinksStyle.dim(colors),
                          ).copyWith(letterSpacing: -2, height: 1),
                        ),
                        const SizedBox(height: 12),
                        ProfessorMeter(
                          percent: percent,
                          color: over ? AppColors.pending : c,
                        ),
                        if (block.detail.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          Text(
                            block.detail,
                            textAlign: TextAlign.center,
                            style: AppTypography.bodyS.copyWith(
                              fontSize: 12,
                              color: ProfessorLinksStyle.dim(colors),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  if (block.hasNote) ...[
                    const SizedBox(height: 12),
                    LessonPlanNoteBox(
                      key: const Key('lesson-live-note'),
                      text: block.note,
                      public: block.notePublic,
                    ),
                  ],
                  if (plan.focus.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    const ProfessorLinksKicker('Foco individual'),
                    const SizedBox(height: 8),
                    for (final f in plan.focus)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text.rich(
                          TextSpan(
                            children: [
                              TextSpan(
                                text: f.name.split(' ').first,
                                style: ProfessorLinksStyle.display(
                                  12.5,
                                  weight: FontWeight.w600,
                                  color: colors.onSurface,
                                ),
                              ),
                              TextSpan(text: ' · ${f.text}'),
                            ],
                          ),
                          style: AppTypography.bodyS.copyWith(
                            fontSize: 12.5,
                            height: 1.4,
                            color: ProfessorLinksStyle.mute(colors),
                          ),
                        ),
                      ),
                  ],
                  if (next != null) ...[
                    const SizedBox(height: 12),
                    ProfessorLinksCard(
                      key: const Key('lesson-live-next-block'),
                      padding: const EdgeInsets.fromLTRB(13, 11, 13, 11),
                      child: Row(
                        children: [
                          Text(
                            'A SEGUIR',
                            style: ProfessorLinksStyle.mono(
                              9.5,
                              color: ProfessorLinksStyle.dim(colors),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              next.name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: ProfessorLinksStyle.display(
                                12.5,
                                weight: FontWeight.w600,
                                color: colors.onSurface,
                              ),
                            ),
                          ),
                          Text(
                            '${next.minutes}′',
                            style: ProfessorLinksStyle.mono(
                              11,
                              color: colors.onSurface,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                child: Row(
                  children: [
                    Semantics(
                      button: true,
                      label: _running ? 'Pausar' : 'Continuar',
                      child: Material(
                        color: ProfessorLinksStyle.soft(colors),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                          side: BorderSide(
                            color: ProfessorLinksStyle.line2(colors),
                          ),
                        ),
                        child: InkWell(
                          key: const Key('lesson-live-toggle'),
                          borderRadius: BorderRadius.circular(14),
                          onTap: _toggle,
                          child: SizedBox.square(
                            dimension: 52,
                            child: Icon(
                              _running
                                  ? Icons.pause_rounded
                                  : Icons.play_arrow_rounded,
                              color: colors.onSurface,
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: ProfessorLinksPrimaryButton(
                        key: const Key('lesson-live-next'),
                        label: next == null ? 'Encerrar aula' : 'Próximo bloco',
                        onPressed: next == null ? _finish : _next,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// "Iniciar aula" (plano de hoje com blocos) e "Registrar aula" (aula de
/// hoje ou passada) — editor, card da agenda e linhas da lista.
class LessonPlanDayActions extends ConsumerWidget {
  const LessonPlanDayActions({super.key, required this.plan});

  final LessonPlan plan;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final today = ref.watch(professorAgendaNowProvider).todayKey;
    final canStart = plan.date == today && plan.blocks.isNotEmpty;
    final canReview = plan.date.compareTo(today) <= 0;
    if (!canStart && !canReview) return const SizedBox.shrink();
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        if (canStart)
          LessonPlanSmallButton(
            key: Key('lesson-plan-start-${plan.refId}'),
            label: 'Iniciar aula',
            icon: Icons.play_arrow_rounded,
            accent: true,
            onTap: () => openLessonLive(context, plan.id),
          ),
        if (canReview)
          LessonPlanSmallButton(
            key: Key('lesson-plan-review-${plan.refId}'),
            label: plan.hasReview ? 'Ver registro' : 'Registrar aula',
            icon: Icons.fact_check_outlined,
            onTap: () => openLessonReview(context, plan.id),
          ),
      ],
    );
  }
}
