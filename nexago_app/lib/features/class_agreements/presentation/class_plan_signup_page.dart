import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/friendly_error_message.dart';
import '../../../core/formatting/app_currency_format.dart';
import '../../../core/layout/nexa_app_bar.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart' show showAppSnackBar;
import '../../../core/ui/nexa_async_view.dart';
import '../../../core/ui/nexa_bottom_action_bar.dart';
import '../../arena/domain/aulas/arena_class_logic.dart'
    show arenaClassInitials;
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart'
    show ArenaClassAvatar;
import '../../athlete_training/application/athlete_training_providers.dart'
    show contractSignAppVersionProvider, contractSignPlatformProvider;
import '../../athlete_training/presentation/widgets/center_contract_widgets.dart'
    show ContractEssentialsCard, ContractPaper;
import '../../schedule_plans/presentation/widgets/schedule_plan_ui.dart';
import '../application/class_agreements_providers.dart';
import '../domain/class_agreements.dart';
import '../infrastructure/class_agreements_repository.dart';

/// Contratar plano de aulas pelo app (canvas "Contratos de aulas", 01–06):
/// plano → professor → dias → contrato (ler até o fim) → assinar = matrícula.
/// Um atleta pode ter vários planos; cada um vira um contrato.
class ClassPlanSignupPage extends ConsumerStatefulWidget {
  const ClassPlanSignupPage({super.key, required this.arenaId, this.planId});

  final String arenaId;

  /// Plano já escolhido (entrada por um card do plano).
  final String? planId;

  @override
  ConsumerState<ClassPlanSignupPage> createState() =>
      _ClassPlanSignupPageState();
}

enum _Step { plan, teacher, days, contract, done }

class _ClassPlanSignupPageState extends ConsumerState<ClassPlanSignupPage> {
  _Step _step = _Step.plan;
  String? _planId;
  String? _teacherId;
  bool _anyTeacher = false;
  List<ClassSlotChoice> _slots = const [];

  /// Ciclo de pagamento escolhido (mensal por padrão).
  String _cycle = 'monthly';

  /// Vencimento escolhido (planos que deixam escolher) e forma de pagamento.
  int? _dueDay;
  String? _paymentForm;

  ClassEnrollmentPreview? _preview;
  Object? _previewError;
  bool _loadingPreview = false;
  String _cpf = '';

  final _scroll = ScrollController();
  final _reading = Stopwatch();
  bool _reachedEnd = false;
  double _progress = 0;

  bool _signing = false;
  ClassEnrollmentResult? _result;

  static const _endSlack = 24.0;

  @override
  void initState() {
    super.initState();
    _planId = widget.planId;
    _scroll.addListener(_measure);
  }

  @override
  void dispose() {
    _scroll
      ..removeListener(_measure)
      ..dispose();
    super.dispose();
  }

  void _measure() {
    if (_step != _Step.contract || _preview == null || !_scroll.hasClients) {
      return;
    }
    final p = _scroll.position;
    final max = p.maxScrollExtent;
    final progress = max <= 0 ? 1.0 : (p.pixels / max).clamp(0.0, 1.0);
    final reached = _reachedEnd || max <= 0 || p.pixels >= max - _endSlack;
    if (progress != _progress || reached != _reachedEnd) {
      setState(() {
        _progress = progress;
        _reachedEnd = reached;
      });
    }
  }

  /// O ciclo que vai para o servidor: o escolhido, se o plano oferece.
  String _cycleOf(ClassSignupPlan plan) =>
      cycleOptionOf(plan, _cycle)?.cycle ?? 'monthly';

  /// Vencimento: o escolhido, se o plano deixa escolher; senão o do plano.
  int? _dueDayOf(ClassSignupPlan plan) {
    final options = plan.billing.dueDayOptions;
    if (options.isEmpty) return null;
    final d = _dueDay;
    return d != null && options.contains(d) ? d : options.first;
  }

  /// Forma: a escolhida, se o plano aceita; senão Pix, senão a primeira.
  String _formOf(ClassSignupPlan plan) {
    final methods = plan.billing.methods;
    final f = _paymentForm;
    if (f != null && methods.contains(f)) return f;
    return methods.contains('pix') ? 'pix' : methods.first;
  }

  // ── navegação entre passos ─────────────────────────────────────────────

  void _goTo(_Step step) {
    setState(() => _step = step);
    if (_scroll.hasClients) _scroll.jumpTo(0);
  }

  void _back(ClassSignupOptions options) {
    final plan = options.plan(_planId);
    switch (_step) {
      case _Step.plan:
      case _Step.done:
        popOrGo(context, AppRoutes.arenaDetail.replaceFirst(':arenaId', widget.arenaId));
      case _Step.teacher:
        _goTo(_Step.plan);
      case _Step.days:
        _goTo(plan != null && !skipTeacherStep(options, plan) ? _Step.teacher : _Step.plan);
      case _Step.contract:
        _goTo(_Step.days);
    }
  }

  void _pickPlan(ClassSignupOptions options, ClassSignupPlan plan) {
    setState(() {
      if (_planId != plan.planId) {
        _slots = const [];
        _teacherId = null;
        _anyTeacher = false;
        _cycle = 'monthly';
        _dueDay = null;
        _paymentForm = null;
      }
      _planId = plan.planId;
    });
  }

  void _afterPlan(ClassSignupOptions options, ClassSignupPlan plan) {
    final teachers = teachersForPlan(options, plan);
    if (skipTeacherStep(options, plan)) {
      _teacherId = teachers.isEmpty ? null : teachers.first.teacherId;
      _anyTeacher = teachers.isEmpty;
      _goTo(_Step.days);
    } else {
      _goTo(_Step.teacher);
    }
  }

  Future<void> _openContract(ClassSignupPlan plan) async {
    setState(() {
      _step = _Step.contract;
      _preview = null;
      _previewError = null;
      _loadingPreview = true;
      _reachedEnd = false;
      _progress = 0;
    });
    try {
      final preview = await ref.read(classAgreementsRepositoryProvider).preview(
            arenaId: widget.arenaId,
            planId: plan.planId,
            slots: _slots,
            cycle: _cycleOf(plan),
            dueDay: _dueDayOf(plan),
            paymentForm: _formOf(plan),
          );
      if (!mounted) return;
      setState(() {
        _preview = preview;
        _loadingPreview = false;
      });
      _reading
        ..reset()
        ..start();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        if (_scroll.hasClients) _scroll.jumpTo(0);
        _measure();
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _previewError = e;
        _loadingPreview = false;
      });
    }
  }

  Future<void> _sign(ClassSignupPlan plan) async {
    final preview = _preview;
    if (preview == null || _signing) return;
    final agreed = await _showSignSheet(preview, plan);
    if (agreed != true || !mounted) return;
    setState(() => _signing = true);
    try {
      final appVersion =
          await ref.read(contractSignAppVersionProvider.future).catchError((_) => '');
      final result = await ref.read(classAgreementsRepositoryProvider).enroll(
            arenaId: widget.arenaId,
            planId: plan.planId,
            slots: _slots,
            sha256: preview.sha256,
            readSeconds: _reading.elapsed.inSeconds,
            platform: ref.read(contractSignPlatformProvider),
            appVersion: appVersion,
            cycle: _cycleOf(plan),
            dueDay: _dueDayOf(plan),
            paymentForm: _formOf(plan),
            cpf: preview.needsCpf ? _cpf : null,
          );
      if (!mounted) return;
      _reading.stop();
      ref
        ..invalidate(myClassAgreementsProvider)
        ..invalidate(classSignupOptionsProvider(widget.arenaId));
      setState(() {
        _result = result;
        _signing = false;
        _step = _Step.done;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _signing = false);
      // O contrato mudou (plano, modelo ou vaga): relê a prévia.
      if (e is ClassAgreementException && e.code == 'failed-precondition' &&
          e.message.contains('mudou')) {
        showAppSnackBar(context, e.message);
        await _openContract(plan);
        return;
      }
      showAppSnackBar(
        context,
        friendlyErrorMessage(e, action: 'Não foi possível assinar o contrato'),
        isError: true,
      );
    }
  }

  Future<bool?> _showSignSheet(ClassEnrollmentPreview preview, ClassSignupPlan plan) {
    final first = preview.charges.isEmpty ? null : preview.charges.first;
    return showScheduleSheet<bool>(
      context,
      builder: (sheetContext) => _SignSheet(
        arenaName: ref.read(classSignupOptionsProvider(widget.arenaId)).valueOrNull?.arenaName ?? 'arena',
        planLine: plan.name,
        firstCharge: first,
      ),
    );
  }

  // ── build ───────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(classSignupOptionsProvider(widget.arenaId));
    return NexaAsyncView<ClassSignupOptions>(
      value: async,
      skipLoadingOnReload: true,
      errorTitle: 'Planos de aula',
      errorMessage: 'Não foi possível abrir os planos desta arena.',
      onRetry: () => ref.invalidate(classSignupOptionsProvider(widget.arenaId)),
      data: (options) => _scaffold(options),
    );
  }

  Widget _scaffold(ClassSignupOptions options) {
    final plan = options.plan(_planId);
    // O plano saiu do app enquanto a tela estava aberta: volta para a lista.
    if (plan == null && _step != _Step.plan) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _step = _Step.plan);
      });
      return const Scaffold(body: SizedBox.shrink());
    }
    final teacher = options.teacher(_teacherId);
    final (title, subtitle) = switch (_step) {
      _Step.plan => ('Planos de aula', options.arenaName),
      _Step.teacher => ('Professor', plan?.name ?? ''),
      _Step.days => (
          'Dias e horários',
          _anyTeacher || teacher == null ? (plan?.name ?? '') : 'com ${teacher.name}',
        ),
      _Step.contract => ('Contrato', options.arenaName),
      _Step.done => ('', ''),
    };
    return PopScope(
      canPop: _step == _Step.plan || _step == _Step.done,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back(options);
      },
      child: Scaffold(
        appBar: _step == _Step.done
            ? null
            : NexaAppBar(
                leading: IconButton(
                  tooltip: 'Voltar',
                  icon: const Icon(Icons.arrow_back_rounded),
                  onPressed: () => _back(options),
                ),
                title: _AppBarTitle(title: title, subtitle: subtitle),
              ),
        body: SafeArea(
          top: _step == _Step.done,
          bottom: false,
          child: switch (_step) {
            _Step.plan => _plansStep(options),
            _Step.teacher => _teacherStep(options, plan!),
            _Step.days => _daysStep(options, plan!),
            _Step.contract => _contractStep(options, plan!),
            _Step.done => _doneStep(options, plan!),
          },
        ),
        bottomNavigationBar: _bottomBar(options, plan),
      ),
    );
  }

  Widget? _bottomBar(ClassSignupOptions options, ClassSignupPlan? plan) {
    switch (_step) {
      case _Step.plan:
        if (plan == null) return null;
        final option = cycleOptionOf(plan, _cycle);
        return NexaBottomActionBar(
          leading: _PriceLeading(
            price: formatBRL(option == null
                ? plan.priceReais
                : option.isPrepaid
                    ? option.totalReais
                    : option.monthlyPriceReais),
            caption: option == null
                ? '${planPriceSuffix(plan)} · ${plan.name}'
                : option.isPrepaid
                    ? 'à vista · ${formatBRL(option.monthlyPriceReais)}/mês'
                    : 'por mês · ${cycleLabel(option.cycle)}${option.months > 1 ? ', ${option.months} meses' : ''}',
          ),
          action: SchedulePrimaryButton(
            key: const Key('class-signup-next-plan'),
            label: skipTeacherStep(options, plan) ? 'Escolher dias' : 'Escolher professor',
            onPressed: () => _afterPlan(options, plan),
          ),
        );
      case _Step.teacher:
        return NexaBottomActionBar(
          action: SchedulePrimaryButton(
            key: const Key('class-signup-next-teacher'),
            label: 'Ver dias e horários',
            onPressed: _teacherId == null && !_anyTeacher
                ? null
                : () => _goTo(_Step.days),
          ),
        );
      case _Step.days:
        final done = slotsComplete(_slots, plan!);
        return NexaBottomActionBar(
          hint: done ? null : slotsTitle(plan),
          action: SchedulePrimaryButton(
            key: const Key('class-signup-next-days'),
            label: 'Ver contrato',
            onPressed: done ? () => _openContract(plan) : null,
          ),
        );
      case _Step.contract:
        final preview = _preview;
        if (preview == null) return null;
        final cpfOk = !preview.needsCpf || _cpf.length == 11;
        return NexaBottomActionBar(
          hint: !_reachedEnd
              ? 'Leia até o fim para assinar'
              : cpfOk
                  ? null
                  : 'Informe seu CPF para pagar pelo app',
          action: SchedulePrimaryButton(
            key: const Key('class-signup-sign'),
            label: 'Assinar contrato',
            icon: _reachedEnd ? Icons.draw_rounded : Icons.lock_outline_rounded,
            loading: _signing,
            onPressed: _reachedEnd && cpfOk ? () => _sign(plan!) : null,
          ),
        );
      case _Step.done:
        return null;
    }
  }

  // ── 01 · planos ─────────────────────────────────────────────────────────

  Widget _plansStep(ClassSignupOptions options) {
    final colors = context.themeColors;
    if (options.plans.isEmpty) {
      return _Empty(
        icon: Icons.school_outlined,
        title: 'Nenhum plano aberto agora',
        message: '${options.arenaName} ainda não abriu planos de aula para '
            'contratar pelo app. Fale com a recepção.',
      );
    }
    return ListView(
      key: const Key('class-signup-plans'),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      children: [
        const _Steps(current: 1),
        const SizedBox(height: 14),
        if (options.activePlanCount > 0) ...[
          ScheduleBanner(
            icon: Icons.check_circle_outline_rounded,
            tone: AppColors.win,
            title: options.activePlanCount == 1
                ? 'Você já tem 1 plano de aula aqui'
                : 'Você já tem ${options.activePlanCount} planos de aula aqui',
            message: 'Pode contratar outro: os planos correm juntos, cada um '
                'com o seu contrato.',
          ),
          const SizedBox(height: 14),
        ],
        const ScheduleKicker('Escolha o plano'),
        const SizedBox(height: 10),
        for (final plan in options.plans) ...[
          ScheduleCard(
            key: Key('class-plan-${plan.planId}'),
            selected: plan.planId == _planId,
            onTap: () => _pickPlan(options, plan),
            child: _PlanCardBody(plan: plan, options: options),
          ),
          if (plan.planId == _planId && plan.hasPaymentChoices) ...[
            const SizedBox(height: 10),
            _PaymentChoices(
              plan: plan,
              cycle: _cycleOf(plan),
              dueDay: _dueDayOf(plan),
              form: _formOf(plan),
              onCycle: (c) => setState(() => _cycle = c),
              onDueDay: (d) => setState(() => _dueDay = d),
              onForm: (f) => setState(() => _paymentForm = f),
            ),
          ],
          const SizedBox(height: 10),
        ],
        if (options.enrollmentFeeReais > 0)
          Text(
            'Taxa de matrícula de ${formatBRL(options.enrollmentFeeReais)} na '
            'primeira cobrança.',
            style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
          ),
      ],
    );
  }

  // ── 02 · professor ──────────────────────────────────────────────────────

  Widget _teacherStep(ClassSignupOptions options, ClassSignupPlan plan) {
    final colors = context.themeColors;
    final teachers = teachersForPlan(options, plan);
    String slotsOf(String teacherId) {
      final slots = slotOptions(options, plan, teacherId: teacherId);
      final days = <int>{for (final s in slots) s.choice.weekday}.toList()..sort();
      final times = <String>{for (final s in slots) s.klass.startTime}.toList()..sort();
      final dayText = days.map((d) => weekdayShort(d).toLowerCase()).join(', ');
      return '$dayText · ${times.join(' e ')}';
    }

    int vacanciesOf(String teacherId) => slotOptions(options, plan, teacherId: teacherId)
        .where((s) => s.selectable)
        .fold<int>(0, (sum, s) => sum + s.vacancies);

    return ListView(
      key: const Key('class-signup-teachers'),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      children: [
        const _Steps(current: 2),
        const SizedBox(height: 14),
        const ScheduleKicker('Quem dá aula neste plano'),
        const SizedBox(height: 10),
        for (final t in teachers) ...[
          ScheduleCard(
            key: Key('class-teacher-${t.teacherId}'),
            selected: !_anyTeacher && _teacherId == t.teacherId,
            onTap: () => setState(() {
              if (_teacherId != t.teacherId) _slots = const [];
              _teacherId = t.teacherId;
              _anyTeacher = false;
            }),
            child: Row(
              children: [
                ArenaClassAvatar(
                  initials: arenaClassInitials(t.name),
                  photoUrl: t.photoUrl,
                  size: 48,
                  zoomName: t.name,
                  zoomRole: 'Professor',
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(t.name, style: _titleStyle(context)),
                      const SizedBox(height: 3),
                      Text(
                        slotsOf(t.teacherId),
                        style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
                      ),
                      const SizedBox(height: 6),
                      _Tag(
                        vacanciesOf(t.teacherId) == 0
                            ? 'Turmas lotadas'
                            : vacanciesOf(t.teacherId) <= 2
                                ? 'Últimas vagas'
                                : 'Com vagas',
                        tone: vacanciesOf(t.teacherId) == 0
                            ? colors.onSurfaceMuted
                            : vacanciesOf(t.teacherId) <= 2
                                ? AppColors.pending
                                : AppColors.win,
                      ),
                    ],
                  ),
                ),
                _Radio(selected: !_anyTeacher && _teacherId == t.teacherId),
              ],
            ),
          ),
          const SizedBox(height: 10),
        ],
        ScheduleCard(
          key: const Key('class-teacher-any'),
          selected: _anyTeacher,
          onTap: () => setState(() {
            if (!_anyTeacher) _slots = const [];
            _anyTeacher = true;
            _teacherId = null;
          }),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: colors.surfaceRaised,
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.groups_2_outlined, color: colors.onSurface),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Sem preferência', style: _titleStyle(context)),
                    const SizedBox(height: 3),
                    Text(
                      'Vê os horários de todos os professores',
                      style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
                    ),
                  ],
                ),
              ),
              _Radio(selected: _anyTeacher),
            ],
          ),
        ),
      ],
    );
  }

  // ── 03 · dias ───────────────────────────────────────────────────────────

  Widget _daysStep(ClassSignupOptions options, ClassSignupPlan plan) {
    final colors = context.themeColors;
    final slots = slotOptions(options, plan, teacherId: _anyTeacher ? null : _teacherId);
    final n = requiredSlotCount(plan);
    final days = <int>{for (final s in slots) s.choice.weekday};
    final picked = <int>{for (final s in _slots) s.weekday};
    return ListView(
      key: const Key('class-signup-days'),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      children: [
        const _Steps(current: 3),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(child: ScheduleKicker(slotsTitle(plan))),
            Text(
              n == null ? '${_slots.length}' : '${_slots.length} de $n',
              key: const Key('class-signup-count'),
              style: AppTypography.mono(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: colors.brandText,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            for (var d = 1; d <= 7; d++) ...[
              if (d > 1) const SizedBox(width: 6),
              Expanded(
                child: _DayPill(
                  label: weekdayShort(d),
                  available: days.contains(d),
                  selected: picked.contains(d),
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 14),
        if (slots.isEmpty)
          const _Empty(
            icon: Icons.event_busy_outlined,
            title: 'Sem turmas com horário',
            message: 'Este professor ainda não tem turma aberta neste plano.',
          ),
        for (final o in slots) ...[
          _SlotRow(
            option: o,
            selected: _slots.contains(o.choice),
            showTeacher: _anyTeacher,
            onTap: !o.selectable
                ? null
                : () {
                    final next = toggleSlot(_slots, o.choice, plan);
                    if (identical(next, _slots)) {
                      showAppSnackBar(
                        context,
                        'Este plano tem ${n ?? 7} aula(s) por semana. Tire um horário para trocar.',
                      );
                      return;
                    }
                    setState(() => _slots = next);
                  },
          ),
          const SizedBox(height: 8),
        ],
        const SizedBox(height: 6),
        ScheduleBanner(
          icon: Icons.info_outline_rounded,
          tone: _infoBlue,
          title: 'Seu horário é fixo toda semana',
          message: plan.isMonthly && (plan.makeupsPerMonth ?? 0) > 0
              ? 'Faltou avisando pelo app? Ganha reposição para usar em outra '
                  'turma (até ${plan.makeupsPerMonth} por mês).'
              : 'Faltas avisadas pelo app seguem as regras de reposição da arena.',
        ),
      ],
    );
  }

  // ── 04 · contrato ───────────────────────────────────────────────────────

  Widget _contractStep(ClassSignupOptions options, ClassSignupPlan plan) {
    final colors = context.themeColors;
    final preview = _preview;
    if (_loadingPreview) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.brand, strokeWidth: 2),
      );
    }
    if (preview == null) {
      return _Empty(
        icon: Icons.description_outlined,
        title: 'Não deu para montar o contrato',
        message: friendlyErrorMessage(_previewError ?? 'erro', action: 'Não foi possível montar o contrato'),
        action: TextButton(
          onPressed: () => _openContract(plan),
          child: const Text('Tentar de novo'),
        ),
      );
    }
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 4),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(2),
            child: LinearProgressIndicator(
              key: const Key('class-contract-progress'),
              value: _progress,
              minHeight: 3,
              color: AppColors.brand,
              backgroundColor: colors.surfaceRaised,
            ),
          ),
        ),
        Expanded(
          child: NotificationListener<ScrollMetricsNotification>(
            onNotification: (_) {
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (mounted) _measure();
              });
              return false;
            },
            child: ListView(
              key: const Key('class-contract-scroll'),
              controller: _scroll,
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 32),
              children: [
                if (preview.essentials.isNotEmpty)
                  ContractEssentialsCard(rows: preview.essentials),
                const SizedBox(height: 12),
                _ChargesCard(preview: preview),
                if (preview.needsCpf) ...[
                  const SizedBox(height: 12),
                  _CpfField(
                    value: _cpf,
                    onChanged: (v) => setState(() => _cpf = v),
                  ),
                ],
                const SizedBox(height: 16),
                const ScheduleKicker('Texto completo'),
                const SizedBox(height: 8),
                ContractPaper(
                  title: preview.title,
                  meta: [
                    options.arenaName,
                    if (preview.templateVersion > 0) 'v${preview.templateVersion}' else 'modelo nexaGO',
                  ].join(' · '),
                  body: preview.body,
                ),
                const SizedBox(height: 10),
                Text(
                  'Fim do contrato',
                  key: const Key('class-contract-end'),
                  textAlign: TextAlign.center,
                  style: AppTypography.mono(fontSize: 9.5, color: colors.onSurfaceMuted),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  // ── 06 · matrícula feita ────────────────────────────────────────────────

  Widget _doneStep(ClassSignupOptions options, ClassSignupPlan plan) {
    final colors = context.themeColors;
    final result = _result!;
    final firstSlot = _slots.isEmpty
        ? null
        : ([..._slots]..sort((a, b) => a.weekday.compareTo(b.weekday))).first;
    final klass = firstSlot == null ? null : options.classById(firstSlot.classId);
    final teacher = klass == null ? null : options.teacher(klass.teacherId);
    final firstCharge = result.charges.isEmpty ? null : result.charges.first;
    return ListView(
      key: const Key('class-signup-done'),
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
      children: [
        Center(
          child: Container(
            width: 76,
            height: 76,
            decoration: BoxDecoration(
              color: AppColors.win,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(color: AppColors.win.withValues(alpha: 0.15), spreadRadius: 14),
              ],
            ),
            child: const Icon(Icons.check_rounded, size: 40, color: AppColors.black),
          ),
        ),
        const SizedBox(height: 26),
        Text(
          'Matrícula feita!',
          textAlign: TextAlign.center,
          style: AppTypography.soraRegular(
            fontSize: 23,
            fontWeight: FontWeight.w700,
            color: colors.onSurface,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'Contrato de ${plan.name} assinado. Uma cópia ficou em Contratos.',
          textAlign: TextAlign.center,
          style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted, height: 1.45),
        ),
        const SizedBox(height: 22),
        if (klass != null)
          ScheduleCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const ScheduleKicker('Suas aulas'),
                const SizedBox(height: 8),
                for (final s in _slots)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Text(
                      '${weekdayShort(s.weekday)} · ${options.classById(s.classId)?.startTime ?? ''} · ${options.classById(s.classId)?.name ?? ''}',
                      style: _titleStyle(context).copyWith(fontSize: 14),
                    ),
                  ),
                if (teacher != null)
                  Text(
                    'com ${teacher.name} · a arena define a quadra',
                    style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
                  ),
              ],
            ),
          ),
        const SizedBox(height: 10),
        if (firstCharge != null)
          ScheduleBanner(
            icon: result.online ? Icons.pix_rounded : Icons.storefront_outlined,
            tone: AppColors.brand,
            title: '1ª cobrança: ${formatBRL(firstCharge.amountReais)}',
            message: result.online
                ? 'Vence em ${brDateKey(firstCharge.dueDate)}. Pague por Pix ou '
                    'cartão em Cobranças.'
                : 'Pague direto na arena até ${brDateKey(firstCharge.dueDate)}.',
            action: result.online
                ? SchedulePrimaryButton(
                    key: const Key('class-signup-pay'),
                    label: 'Pagar agora',
                    onPressed: () => context.pushNamed(AppRouteNames.athleteBilling),
                  )
                : null,
          ),
        const SizedBox(height: 18),
        OutlinedButton(
          key: const Key('class-signup-contracts'),
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
          onPressed: () => context.goNamed(AppRouteNames.classAgreements),
          child: const Text('Ver meus contratos'),
        ),
        const SizedBox(height: 8),
        TextButton(
          onPressed: () => _back(options),
          child: const Text('Concluir'),
        ),
      ],
    );
  }
}

/// Azul dos avisos informativos (o mesmo tom do convite do professor).
const _infoBlue = Color(0xFF5B8DEF);

TextStyle _titleStyle(BuildContext context) => AppTypography.soraRegular(
      fontSize: 15.5,
      fontWeight: FontWeight.w700,
      color: context.themeColors.onSurface,
    );

// ── peças ────────────────────────────────────────────────────────────────

class _AppBarTitle extends StatelessWidget {
  const _AppBarTitle({required this.title, required this.subtitle});

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(title, style: _titleStyle(context).copyWith(fontSize: 16)),
        if (subtitle.isNotEmpty)
          Text(
            subtitle,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.bodyS.copyWith(fontSize: 11.5, color: colors.onSurfaceMuted),
          ),
      ],
    );
  }
}

class _Steps extends StatelessWidget {
  const _Steps({required this.current});

  final int current;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Semantics(
      label: 'Passo $current de 4',
      child: Row(
        children: [
          for (var i = 1; i <= 4; i++) ...[
            if (i > 1) const SizedBox(width: 6),
            Expanded(
              child: Container(
                height: 4,
                decoration: BoxDecoration(
                  color: i <= current ? AppColors.brand : colors.surfaceRaised,
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _PriceLeading extends StatelessWidget {
  const _PriceLeading({required this.price, required this.caption});

  final String price;
  final String caption;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          price,
          style: AppTypography.mono(fontSize: 19, fontWeight: FontWeight.w700, color: colors.brandText),
        ),
        Text(
          caption,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: AppTypography.bodyS.copyWith(fontSize: 11, color: colors.onSurfaceMuted),
        ),
      ],
    );
  }
}

class _PlanCardBody extends StatelessWidget {
  const _PlanCardBody({required this.plan, required this.options});

  final ClassSignupPlan plan;
  final ClassSignupOptions options;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final teachers = teachersForPlan(options, plan);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(plan.name, style: _titleStyle(context)),
                  const SizedBox(height: 3),
                  Text(
                    plan.description ?? planRuleLine(plan),
                    style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  formatBRL(plan.priceReais),
                  style: AppTypography.mono(fontSize: 16, fontWeight: FontWeight.w700, color: colors.brandText),
                ),
                Text(
                  planPriceSuffix(plan),
                  style: AppTypography.bodyS.copyWith(fontSize: 11, color: colors.onSurfaceMuted),
                ),
              ],
            ),
          ],
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            if (plan.mine) _Tag('Você tem este plano', tone: AppColors.win),
            _Tag(plan.isMonthly ? 'Mensal' : 'Pacote'),
            if (plan.description != null) _Tag(planRuleLine(plan)),
            if (plan.isMonthly && (plan.makeupsPerMonth ?? 0) > 0)
              _Tag('${plan.makeupsPerMonth} reposição/mês'),
          ],
        ),
        if (teachers.isNotEmpty) ...[
          const SizedBox(height: 12),
          Divider(height: 1, color: colors.onSurface.withValues(alpha: 0.06)),
          const SizedBox(height: 10),
          Row(
            children: [
              SizedBox(
                height: 30,
                width: 30.0 + (teachers.take(3).length - 1) * 22,
                child: Stack(
                  children: [
                    for (var i = 0; i < teachers.take(3).length; i++)
                      Positioned(
                        left: i * 22.0,
                        child: ArenaClassAvatar(
                          initials: arenaClassInitials(teachers[i].name),
                          photoUrl: teachers[i].photoUrl,
                          size: 30,
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  plan.anyTeacher
                      ? 'Qualquer professor da arena'
                      : teachers.length == 1
                          ? teachers.first.name
                          : '${teachers.length} professores',
                  style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

/// Como nos Planos de horário: ciclo (com desconto e fidelidade), vencimento
/// e forma de pagamento — só o que o plano oferece.
class _PaymentChoices extends StatelessWidget {
  const _PaymentChoices({
    required this.plan,
    required this.cycle,
    required this.dueDay,
    required this.form,
    required this.onCycle,
    required this.onDueDay,
    required this.onForm,
  });

  final ClassSignupPlan plan;
  final String cycle;
  final int? dueDay;
  final String form;
  final ValueChanged<String> onCycle;
  final ValueChanged<int> onDueDay;
  final ValueChanged<String> onForm;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final selected = cycleOptionOf(plan, cycle);
    // Linhas de `columns` chips da mesma altura, que crescem com o texto
    // (grade de proporção fixa cortava a 2ª linha com fonte maior).
    Widget grid(int columns, List<Widget> children, {double ratio = 0}) {
      final rows = <Widget>[];
      for (var i = 0; i < children.length; i += columns) {
        final row = children.sublist(i, (i + columns).clamp(0, children.length));
        rows.add(IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (var j = 0; j < columns; j++) ...[
                if (j > 0) const SizedBox(width: 8),
                Expanded(child: j < row.length ? row[j] : const SizedBox.shrink()),
              ],
            ],
          ),
        ));
        if (i + columns < children.length) rows.add(const SizedBox(height: 8));
      }
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: rows);
    }
    return Column(
      key: const Key('class-cycle-picker'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (plan.hasLongCycles) ...[
          const ScheduleKicker('Ciclo'),
          const SizedBox(height: 8),
          grid(2, [
            for (final c in plan.cycles)
              ScheduleChoiceChip(
                key: Key('class-cycle-${c.cycle}'),
                label: cycleDiscountPercent(plan, c) > 0
                    ? '${cycleLabel(c.cycle)} · −${cycleDiscountPercent(plan, c)}%'
                    : cycleLabel(c.cycle),
                sub: c.isPrepaid
                    ? '${formatBRL(c.totalReais)} · ${cycleSub(c)}'
                    : '${formatBRL(c.monthlyPriceReais)}/mês · ${cycleSub(c)}',
                selected: c.cycle == cycle,
                onTap: () => onCycle(c.cycle),
              ),
          ]),
          if (selected != null) ...[
            const SizedBox(height: 6),
            Text(
              selected.isPrepaid
                  ? 'Paga ${selected.prepaidMonths} meses de uma vez (o 1º proporcional às aulas que faltam).'
                  : selected.months > 1
                      ? 'Fidelidade de ${selected.months} meses, cobrado mês a mês com desconto.'
                      : 'Cobrado todo mês, sem fidelidade. O 1º mês é proporcional.',
              style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
            ),
          ],
          const SizedBox(height: 14),
        ],
        if (plan.billing.dueDayOptions.isNotEmpty) ...[
          const ScheduleKicker('Vencimento'),
          const SizedBox(height: 8),
          grid(plan.billing.dueDayOptions.length, [
            for (final d in plan.billing.dueDayOptions)
              ScheduleChoiceChip(
                key: Key('class-due-$d'),
                label: 'Dia $d',
                selected: d == dueDay,
                onTap: () => onDueDay(d),
              ),
          ], ratio: 2.4),
          const SizedBox(height: 14),
        ],
        if (plan.billing.methods.length > 1) ...[
          const ScheduleKicker('Forma de pagamento'),
          const SizedBox(height: 8),
          grid(plan.billing.methods.length, [
            for (final f in plan.billing.methods)
              ScheduleChoiceChip(
                key: Key('class-form-$f'),
                label: paymentFormLabel(f),
                sub: paymentFormSub(f),
                selected: f == form,
                onTap: () => onForm(f),
              ),
          ], ratio: 2.0),
        ],
      ],
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag(this.label, {this.tone});

  final String label;
  final Color? tone;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final t = tone;
    final ink = t == null ? colors.onSurface.withValues(alpha: 0.8) : colors.readableTone(t);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: t == null ? colors.surfaceRaised : t.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: t == null ? colors.onSurface.withValues(alpha: 0.08) : t.withValues(alpha: 0.35),
        ),
      ),
      child: Text(
        label,
        style: AppTypography.mono(fontSize: 10.5, fontWeight: FontWeight.w600, color: ink),
      ),
    );
  }
}

class _Radio extends StatelessWidget {
  const _Radio({required this.selected});

  final bool selected;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      width: 24,
      height: 24,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: selected ? AppColors.brand : Colors.transparent,
        border: selected ? null : Border.all(color: colors.onSurface.withValues(alpha: 0.25), width: 2),
      ),
      child: selected ? const Icon(Icons.check_rounded, size: 15, color: AppColors.black) : null,
    );
  }
}

class _DayPill extends StatelessWidget {
  const _DayPill({required this.label, required this.available, required this.selected});

  final String label;
  final bool available;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Opacity(
      opacity: available ? 1 : 0.35,
      child: Container(
        height: 52,
        decoration: BoxDecoration(
          color: selected ? AppColors.brand.withValues(alpha: 0.10) : colors.surfaceCard,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: selected ? AppColors.brand : colors.onSurface.withValues(alpha: 0.10)),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: selected ? colors.brandText : colors.onSurface.withValues(alpha: 0.75),
              ),
            ),
            const SizedBox(height: 4),
            Container(
              width: 5,
              height: 5,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: available ? AppColors.win : Colors.transparent,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SlotRow extends StatelessWidget {
  const _SlotRow({
    required this.option,
    required this.selected,
    required this.showTeacher,
    required this.onTap,
  });

  final ClassSlotOption option;
  final bool selected;
  final bool showTeacher;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final o = option;
    final vacancyColor = !o.selectable
        ? colors.onSurfaceMuted
        : o.vacancies <= 1
            ? colors.readableTone(AppColors.pending)
            : colors.win;
    return Opacity(
      opacity: o.selectable ? 1 : 0.5,
      child: Semantics(
        button: true,
        selected: selected,
        enabled: o.selectable,
        child: ScheduleCard(
          key: Key('class-slot-${o.choice.key}'),
          selected: selected,
          padding: const EdgeInsets.all(12),
          onTap: onTap,
          child: Row(
            children: [
              Container(
                width: 46,
                height: 50,
                decoration: BoxDecoration(
                  color: colors.surfaceRaised,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      weekdayShort(o.choice.weekday),
                      style: AppTypography.mono(fontSize: 9, fontWeight: FontWeight.w700, color: colors.brandText),
                    ),
                    Text(
                      o.klass.startTime,
                      style: AppTypography.mono(fontSize: 13.5, fontWeight: FontWeight.w600, color: colors.onSurface),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(o.klass.name, style: _titleStyle(context).copyWith(fontSize: 14)),
                    const SizedBox(height: 3),
                    Text.rich(
                      TextSpan(
                        children: [
                          if (showTeacher) TextSpan(text: '${o.teacherName} · '),
                          if (o.klass.endTime.isNotEmpty)
                            TextSpan(text: 'até ${o.klass.endTime} · '),
                          TextSpan(
                            text: vacanciesLabel(o),
                            style: TextStyle(color: vacancyColor, fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                      style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
                    ),
                  ],
                ),
              ),
              if (o.selectable) _Radio(selected: selected),
            ],
          ),
        ),
      ),
    );
  }
}

class _ChargesCard extends StatelessWidget {
  const _ChargesCard({required this.preview});

  final ClassEnrollmentPreview preview;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ScheduleCard(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ScheduleKicker(preview.online ? 'Primeira cobrança · Pix ou cartão no app' : 'Primeira cobrança · pague na arena'),
          const SizedBox(height: 8),
          for (final c in preview.charges)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      c.description,
                      style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
                    ),
                  ),
                  Text(
                    formatBRL(c.amountReais),
                    style: AppTypography.mono(fontSize: 13, fontWeight: FontWeight.w600, color: colors.onSurface),
                  ),
                ],
              ),
            ),
          if (preview.charges.isEmpty)
            Text(
              'Nada a pagar agora.',
              style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
            ),
        ],
      ),
    );
  }
}

class _CpfField extends StatelessWidget {
  const _CpfField({required this.value, required this.onChanged});

  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      key: const Key('class-contract-cpf'),
      initialValue: value,
      keyboardType: TextInputType.number,
      inputFormatters: [
        FilteringTextInputFormatter.digitsOnly,
        LengthLimitingTextInputFormatter(11),
      ],
      decoration: const InputDecoration(
        labelText: 'Seu CPF',
        helperText: 'A arena cobra pelo app: o CPF vai na fatura do Pix ou cartão.',
      ),
      onChanged: onChanged,
    );
  }
}

class _SignSheet extends StatefulWidget {
  const _SignSheet({required this.arenaName, required this.planLine, this.firstCharge});

  final String arenaName;
  final String planLine;
  final ClassCharge? firstCharge;

  @override
  State<_SignSheet> createState() => _SignSheetState();
}

class _SignSheetState extends State<_SignSheet> {
  bool _agreed = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    Widget line(IconData icon, String text) => Padding(
          padding: const EdgeInsets.only(bottom: 7),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, size: 15, color: colors.onSurfaceMuted),
              const SizedBox(width: 8),
              Expanded(
                child: Text(text, style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted)),
              ),
            ],
          ),
        );
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ScheduleSheetHeader(title: 'Assinar e matricular', subtitle: widget.planLine),
          const SizedBox(height: 14),
          Material(
            color: _agreed ? AppColors.brand.withValues(alpha: 0.07) : colors.surfaceCard,
            borderRadius: BorderRadius.circular(14),
            child: CheckboxListTile(
              key: const Key('class-sign-agree'),
              value: _agreed,
              onChanged: (v) => setState(() => _agreed = v ?? false),
              activeColor: AppColors.brand,
              checkColor: AppColors.black,
              controlAffinity: ListTileControlAffinity.leading,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
                side: BorderSide(color: _agreed ? AppColors.brand : colors.onSurface.withValues(alpha: 0.12)),
              ),
              title: Text(
                'Li o contrato inteiro e concordo com as condições da ${widget.arenaName}.',
                style: AppTypography.bodyS.copyWith(color: colors.onSurface, height: 1.4),
              ),
            ),
          ),
          const SizedBox(height: 14),
          line(Icons.person_outline_rounded, 'Você assina pela sua conta nexaGO'),
          line(Icons.verified_user_outlined, 'Guardamos data, hora, aparelho e a impressão digital do texto'),
          line(Icons.description_outlined, 'Uma cópia fica em Contratos'),
          if (widget.firstCharge != null) ...[
            const SizedBox(height: 6),
            Row(
              children: [
                Expanded(
                  child: Text(
                    '1ª cobrança',
                    style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
                  ),
                ),
                Text(
                  formatBRL(widget.firstCharge!.amountReais),
                  style: AppTypography.mono(fontSize: 14, fontWeight: FontWeight.w700, color: colors.onSurface),
                ),
              ],
            ),
          ],
          const SizedBox(height: 16),
          SchedulePrimaryButton(
            key: const Key('class-sign-confirm'),
            label: 'Assinar e matricular',
            icon: Icons.draw_rounded,
            onPressed: _agreed ? () => Navigator.of(context).pop(true) : null,
          ),
        ],
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.icon, required this.title, required this.message, this.action});

  final IconData icon;
  final String title;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 40, color: colors.onSurfaceMuted),
            const SizedBox(height: 12),
            Text(title, textAlign: TextAlign.center, style: _titleStyle(context)),
            const SizedBox(height: 6),
            Text(
              message,
              textAlign: TextAlign.center,
              style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted, height: 1.45),
            ),
            if (action != null) ...[const SizedBox(height: 12), action!],
          ],
        ),
      ),
    );
  }
}
