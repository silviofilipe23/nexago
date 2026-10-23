import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/time/nexago_event_timezone.dart';
import '../../arena/domain/aulas/arena_class_logic.dart';
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/availability/availability_widgets.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/center_coach_providers.dart';
import '../application/center_management_providers.dart';
import '../domain/center_coach.dart';
import '../domain/center_coach_repository.dart';
import '../domain/center_management.dart';
import '../infrastructure/firebase_center_management_repository.dart';
import 'widgets/center_coach_widgets.dart' show coachClassScheduleLabel;
import 'widgets/center_management_widgets.dart';

/// G11–G13 · Matricular pelo app (recepção, gestão ou quem matricula): turma
/// (lotada → lista de espera ou outra turma do mesmo nível), plano e
/// condições (contrato congelado, 1ª cobrança proporcional) e o resultado.
/// A gravação é a transação do portal: vaga lida fresca, matrícula + vaga +
/// cobrança + auditoria juntas.
class CenterCoachEnrollPage extends ConsumerStatefulWidget {
  const CenterCoachEnrollPage({
    super.key,
    required this.centerId,
    this.studentId,
  });

  final String centerId;

  /// Aluno já escolhido (vindo do perfil).
  final String? studentId;

  @override
  ConsumerState<CenterCoachEnrollPage> createState() =>
      _CenterCoachEnrollPageState();
}

class _CenterCoachEnrollPageState extends ConsumerState<CenterCoachEnrollPage> {
  String? _studentId;
  String _query = '';

  /// 0 turma · 1 plano · 2 confirmar · 3 resultado.
  int _step = 0;
  String? _program;
  String? _classId;

  /// Turma lotada: entrar na fila dela em vez de matricular.
  bool _waitlist = false;
  String _planType = 'monthly';
  String? _planId;
  String? _start;
  bool _busy = false;
  CenterEnrollResult? _result;

  @override
  void initState() {
    super.initState();
    _studentId = widget.studentId;
  }

  void _back() {
    if (_step == 3) return popOrGo(context, AppRoutes.centerCoachAgenda);
    if (_step > 0) return setState(() => _step--);
    if (_studentId != null && widget.studentId == null) {
      return setState(() => _studentId = null);
    }
    popOrGo(context, AppRoutes.centerCoachAgenda);
  }

  @override
  Widget build(BuildContext context) {
    final centerId = widget.centerId;
    final member = ref.watch(centerMembershipProvider(centerId));
    final students =
        ref.watch(coachStudentsProvider(centerId)).valueOrNull ?? const {};
    // Mantém as matrículas vivas em todos os passos: a posição na fila do
    // resultado é contada delas (autoDispose zeraria fora do passo da turma).
    ref.watch(coachEnrollmentsProvider(centerId));
    final student = _studentId == null ? null : students[_studentId];
    final cls = _classId == null
        ? null
        : (ref.watch(coachClassesProvider(centerId)).valueOrNull ?? const [])
              .where((c) => c.id == _classId)
              .firstOrNull;
    final subtitle = [
      student?.name.toUpperCase() ?? 'ESCOLHA O ALUNO',
      if (cls != null && _step > 0) cls.name.toUpperCase(),
    ].join(' · ');

    final Widget body;
    if (member == null || !member.has('enroll_students')) {
      body = const _Padded(
        child: ProfessorLinksCard(
          child: ProfessorMutedText(
            'Sem permissão para matricular neste centro.',
          ),
        ),
      );
    } else if (_step == 3 && _result != null && student != null) {
      body = _ResultStep(
        centerId: centerId,
        member: member,
        student: student,
        cls: cls,
        plan: _plan(),
        result: _result!,
      );
    } else if (student == null) {
      body = _StudentStep(
        students: students.values.toList(),
        loading: ref.watch(coachStudentsProvider(centerId)).isLoading,
        query: _query,
        onQuery: (q) => setState(() => _query = q),
        onPick: (s) => setState(() => _studentId = s.id),
        onNew: () => context.pushNamed(
          AppRouteNames.centerCoachNewStudent,
          pathParameters: {'centerId': centerId},
          queryParameters: {'matricular': '1'},
        ),
      );
    } else {
      body = switch (_step) {
        0 => _classStep(student),
        1 => _planStep(student, cls),
        _ => _confirmStep(student, cls),
      };
    }

    return ProfessorLinksScaffold(
      title: _step == 3 ? 'Matrícula' : 'Matricular',
      subtitle: subtitle,
      onBack: _back,
      body: body,
    );
  }

  CenterPlan? _plan() =>
      (ref.read(centerPlansProvider(widget.centerId)).valueOrNull ?? const [])
          .where((p) => p.id == _planId)
          .firstOrNull;

  Map<String, Object?> _rawPolicies() =>
      ref.read(coachCenterProvider(widget.centerId)).valueOrNull?.rawPolicies ??
      const {};

  // ── G11 · Turma ────────────────────────────────────────────────────────

  Widget _classStep(CenterCoachStudent student) {
    final centerId = widget.centerId;
    final colors = context.themeColors;
    final programs =
        ref.watch(centerProgramsProvider(centerId)).valueOrNull ?? const [];
    final all = [
      for (final c
          in ref.watch(coachClassesProvider(centerId)).valueOrNull ??
              const <CenterCoachClass>[])
        if (c.status == 'active') c,
    ]..sort((a, b) => a.name.compareTo(b.name));
    final enrollments =
        ref.watch(coachEnrollmentsProvider(centerId)).valueOrNull ?? const [];
    final taken = {
      for (final e in enrollments)
        if (e.studentId == student.id &&
            ['active', 'pending', 'paused', 'waitlisted'].contains(e.status))
          e.classId,
    };
    final usedPrograms = {for (final c in all) c.programId};
    final shownPrograms = [
      for (final p in programs)
        if (usedPrograms.contains(p.id)) p,
    ];
    final program = _program ??
        (shownPrograms.isEmpty ? null : shownPrograms.first.id);
    final classes = [
      for (final c in all)
        if (program == null || c.programId == program) c,
    ];

    return _StepList(
      step: 0,
      footer: ProfessorLinksPrimaryButton(
        key: const Key('center-enroll-next-class'),
        label: 'Continuar',
        onPressed: _classId == null ? null : () => setState(() => _step = 1),
      ),
      children: [
        if (shownPrograms.length > 1)
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final p in shownPrograms) ...[
                  AvailabilityChoiceChip(
                    key: Key('center-enroll-program-${p.id}'),
                    label: p.name,
                    selected: p.id == program,
                    onTap: () => setState(() => _program = p.id),
                  ),
                  const SizedBox(width: 6),
                ],
              ],
            ),
          ),
        if (classes.isEmpty)
          const ProfessorLinksCard(
            child: ProfessorMutedText('Nenhuma turma ativa nesta modalidade.'),
          ),
        for (final c in classes)
          _ClassCard(
            key: Key('center-enroll-class-${c.id}'),
            cls: c,
            selected: c.id == _classId,
            already: taken.contains(c.id),
            queue: enrollments
                .where((e) => e.classId == c.id && e.status == 'waitlisted')
                .length,
            onTap: taken.contains(c.id)
                ? null
                : () => centerClassIsFull(c)
                      ? _full(student, c, all, enrollments)
                      : setState(() {
                          _classId = c.id;
                          _waitlist = false;
                          _planId = null;
                        }),
          ),
        Text(
          'A vaga é conferida de novo na hora de gravar: se alguém pegar a '
          'última antes, o app avisa e nada é cobrado.',
          style: AppTypography.bodyS.copyWith(
            fontSize: 11.5,
            color: ProfessorLinksStyle.dim(colors),
          ),
        ),
      ],
    );
  }

  /// Turma lotada: lista de espera ou outra turma do mesmo nível com vaga.
  Future<void> _full(
    CenterCoachStudent student,
    CenterCoachClass cls,
    List<CenterCoachClass> all,
    List<CenterCoachEnrollment> enrollments,
  ) async {
    final waitlistOn =
        centerPoliciesSnapshot(_rawPolicies())['waitlistEnabled'] == true;
    final queue = enrollments
        .where((e) => e.classId == cls.id && e.status == 'waitlisted')
        .length;
    final alternatives = centerAlternativeClasses(all, cls);
    final picked = await showProfessorLinksSheet<String>(
      context,
      builder: (_) => _FullSheet(
        cls: cls,
        student: student,
        waitlistOn: waitlistOn,
        position: queue + 1,
        alternatives: alternatives,
      ),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _planId = null;
      if (picked == 'waitlist') {
        _classId = cls.id;
        _waitlist = true;
      } else {
        _classId = picked;
        _waitlist = false;
      }
      _step = 1;
    });
  }

  // ── G12 · Plano e condições ────────────────────────────────────────────

  Widget _planStep(CenterCoachStudent student, CenterCoachClass? cls) {
    final centerId = widget.centerId;
    final colors = context.themeColors;
    final today = nexagoEventDayKey(ref.watch(professorLinksClockProvider)());
    final start = _start ?? today;
    final center = ref.watch(coachCenterProvider(centerId)).valueOrNull;
    final plansAsync = ref.watch(centerPlansProvider(centerId));
    final plans = cls == null
        ? const <CenterPlan>[]
        : centerPlansForClass(plansAsync.valueOrNull ?? const [], cls);
    final types = {for (final p in plans) p.type};
    final type = types.contains(_planType)
        ? _planType
        : (types.isEmpty ? _planType : types.first);
    final shown = [
      for (final p in plans)
        if (p.type == type) p,
    ];
    final plan = shown.where((p) => p.id == _planId).firstOrNull;
    final billing = CenterBillingConfig.fromMap(center?.rawBilling ?? const {});
    final contract = plan == null
        ? null
        : centerBuildContract(plan, center?.rawPolicies ?? const {}, today);
    final invoice = contract == null
        ? null
        : centerEnrollInvoice(
            contract: contract,
            billing: billing,
            startDate: start,
            today: today,
          );
    final nextCharge = plan != null && plan.isMonthly
        ? centerFirstInvoice(
            contract!['priceCents'] as int,
            billing,
            start.compareTo(today) > 0 ? start : today,
          ).nextCharge
        : null;

    return _StepList(
      step: 1,
      footer: ProfessorLinksPrimaryButton(
        key: const Key('center-enroll-next-plan'),
        label: _waitlist ? 'Revisar lista de espera' : 'Revisar matrícula',
        onPressed: plan == null ? null : () => setState(() => _step = 2),
      ),
      children: [
        if (_waitlist)
          const ProfessorLinksNote(
            'Turma lotada: o aluno entra na lista de espera. O contrato e a '
            'cobrança só saem quando a vaga for oferecida.',
            tone: ProfessorLinksNoteTone.yellow,
          ),
        if (types.length > 1)
          CenterSegmented<String>(
            options: const [('monthly', 'Mensal'), ('class_pack', 'Pacote')],
            value: type,
            onChanged: (t) => setState(() {
              _planType = t;
              _planId = null;
            }),
          ),
        if (plansAsync.isLoading && plansAsync.valueOrNull == null)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 30),
            child: Center(
              child: CircularProgressIndicator(color: AppColors.brand),
            ),
          )
        else if (shown.isEmpty)
          const ProfessorLinksCard(
            child: ProfessorMutedText(
              'Nenhum plano ativo para esta turma. Crie os planos no painel '
              'web do centro.',
            ),
          ),
        for (final p in shown)
          _PlanCard(
            key: Key('center-enroll-plan-${p.id}'),
            plan: p,
            priceCents: centerPlanPriceOn(p, today),
            selected: p.id == _planId,
            onTap: () => setState(() => _planId = p.id),
          ),
        if (plan != null && !_waitlist) ...[
          const CenterKicker('Condições'),
          const SizedBox(height: 8),
          Row(
            children: [
              for (final (k, l, d) in [
                ('today', 'Hoje', today),
                ('tomorrow', 'Amanhã', coachShiftDay(today, 1)),
              ]) ...[
                AvailabilityChoiceChip(
                  key: Key('center-enroll-start-$k'),
                  label: l,
                  selected: start == d,
                  onTap: () => setState(() => _start = d),
                ),
                const SizedBox(width: 6),
              ],
              AvailabilityChoiceChip(
                key: const Key('center-enroll-start-pick'),
                label: start != today && start != coachShiftDay(today, 1)
                    ? centerDayLabel(start)
                    : 'Outra data',
                selected: start != today && start != coachShiftDay(today, 1),
                onTap: () => _pickStart(today, start),
              ),
            ],
          ),
          const SizedBox(height: 10),
          CenterInfoRows(
            rows: [
              ('Início', centerDayLabel(start)),
              if (invoice != null)
                (
                  '1ª cobrança',
                  '${invoice.reference.contains('proporcional') ? 'Proporcional · ' : ''}'
                      '${centerBrl(invoice.amountCents)}',
                ),
              if (nextCharge != null)
                ('Renovação', 'Todo dia ${nextCharge.substring(8)}'),
              if (plan.type == 'class_pack' && plan.validityDays != null)
                ('Validade', '${plan.validityDays} dias'),
            ],
          ),
          Text(
            'O contrato guarda este preço e as regras de hoje. Mudanças '
            'futuras no plano não afetam ${student.name.split(' ').first}.',
            style: AppTypography.bodyS.copyWith(
              fontSize: 11.5,
              color: ProfessorLinksStyle.dim(colors),
            ),
          ),
        ],
      ],
    );
  }

  Future<void> _pickStart(String today, String current) async {
    final t = DateTime.parse(today);
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.parse(current),
      firstDate: t,
      lastDate: t.add(const Duration(days: 120)),
    );
    if (picked == null || !mounted) return;
    setState(
      () => _start =
          '${picked.year.toString().padLeft(4, '0')}-'
          '${picked.month.toString().padLeft(2, '0')}-'
          '${picked.day.toString().padLeft(2, '0')}',
    );
  }

  // ── Confirmar ──────────────────────────────────────────────────────────

  Widget _confirmStep(CenterCoachStudent student, CenterCoachClass? cls) {
    final centerId = widget.centerId;
    final today = nexagoEventDayKey(ref.watch(professorLinksClockProvider)());
    final start = _start ?? today;
    final center = ref.watch(coachCenterProvider(centerId)).valueOrNull;
    final plan = (ref.watch(centerPlansProvider(centerId)).valueOrNull ??
            const <CenterPlan>[])
        .where((p) => p.id == _planId)
        .firstOrNull;
    if (cls == null || plan == null || center == null) {
      return const _Padded(
        child: Center(child: CircularProgressIndicator(color: AppColors.brand)),
      );
    }
    final contract = centerBuildContract(plan, center.rawPolicies, today);
    final invoice = centerEnrollInvoice(
      contract: contract,
      billing: CenterBillingConfig.fromMap(center.rawBilling),
      startDate: start,
      today: today,
    );
    final status = centerEnrollStatus(center.rawPolicies);
    final hold = centerPoliciesSnapshot(center.rawPolicies)['pendingHoldHours'];

    return _StepList(
      step: 2,
      footer: ProfessorLinksPrimaryButton(
        key: const Key('center-enroll-submit'),
        label: _waitlist
            ? 'Entrar na lista de espera'
            : 'Matricular e cobrar ${centerBrl(invoice.amountCents)}',
        loading: _busy,
        onPressed: () => _submit(center, student, cls, plan, start, today),
      ),
      children: [
        CenterInfoRows(
          rows: [
            ('Aluno', student.name),
            if (student.isMinor && student.guardianName.isNotEmpty)
              ('Pagador', '${centerPayerName(student)} (responsável)'),
            ('Turma', cls.name),
            ('Horário', coachClassScheduleLabel(cls)),
            ('Plano', plan.name),
            if (!_waitlist) ...[
              ('Preço do contrato', centerBrl(contract['priceCents'] as int)),
              ('1ª cobrança', '${centerBrl(invoice.amountCents)} · Pix'),
              ('Início', centerDayLabel(start)),
            ],
          ],
        ),
        if (center.isSuspended)
          const ProfessorLinksNote(
            'Centro suspenso: matrículas voltam quando a assinatura for '
            'regularizada.',
            tone: ProfessorLinksNoteTone.red,
          )
        else if (!_waitlist)
          ProfessorLinksNote(
            status == 'active'
                ? 'O centro ativa a matrícula na confirmação; a cobrança segue '
                      'para o aluno pagar pelo app.'
                : 'A matrícula fica pendente e a vaga reservada por ${hold}h, '
                      'até o pagamento ser confirmado.',
            tone: ProfessorLinksNoteTone.blue,
          ),
      ],
    );
  }

  Future<void> _submit(
    CenterCoachCenter center,
    CenterCoachStudent student,
    CenterCoachClass cls,
    CenterPlan plan,
    String start,
    String today,
  ) async {
    final repo = ref.read(centerManagementRepositoryProvider);
    final actor = ref.read(centerActorProvider(widget.centerId));
    setState(() => _busy = true);
    try {
      if (_waitlist) {
        final id = await repo.joinWaitlist(
          centerId: widget.centerId,
          student: student,
          cls: cls,
          plan: plan,
          startDate: start,
          actor: actor,
        );
        final queue =
            (ref.read(coachEnrollmentsProvider(widget.centerId)).valueOrNull ??
                    const [])
                .where(
                  (e) =>
                      e.classId == cls.id &&
                      e.status == 'waitlisted' &&
                      e.id != id,
                )
                .length;
        if (!mounted) return;
        setState(() {
          _result = CenterWaitlisted(enrollmentId: id, position: queue + 1);
          _step = 3;
        });
        return;
      }
      final r = await repo.enroll(
        centerId: widget.centerId,
        center: center,
        student: student,
        cls: cls,
        plan: plan,
        startDate: start,
        today: today,
        canBill: true,
        actor: actor,
      );
      if (!mounted) return;
      if (r is CenterEnrollFull) {
        setState(() {
          _step = 0;
          _classId = null;
        });
        showCenterError(
          context,
          '${cls.name} lotou agora (${r.seatsTaken}/${r.capacity}). Escolha '
          'outra turma ou a lista de espera.',
        );
        return;
      }
      setState(() {
        _result = r;
        _step = 3;
      });
    } on CenterCoachException catch (e) {
      if (mounted) showCenterError(context, e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _Padded extends StatelessWidget {
  const _Padded({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
    children: [child],
  );
}

bool _isSpacer(Widget w) => w is SizedBox && w.child == null && w.width == null;

/// Passos com a barra Turma · Plano · Confirmar e o botão fixo no pé.
class _StepList extends StatelessWidget {
  const _StepList({
    required this.step,
    required this.children,
    required this.footer,
  });

  final int step;
  final List<Widget> children;
  final Widget footer;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
            children: [
              CenterEnrollSteps(at: step),
              for (var i = 0; i < children.length; i++) ...[
                // Espaçador explícito (`SizedBox` só com altura) vale sozinho.
                if (!_isSpacer(children[i]) &&
                    (i == 0 || !_isSpacer(children[i - 1])))
                  const SizedBox(height: 12),
                children[i],
              ],
            ],
          ),
        ),
        Container(
          padding: EdgeInsets.fromLTRB(
            20,
            12,
            20,
            12 + MediaQuery.paddingOf(context).bottom,
          ),
          decoration: BoxDecoration(
            color: colors.canvas,
            border: Border(
              top: BorderSide(color: ProfessorLinksStyle.line(colors)),
            ),
          ),
          child: footer,
        ),
      ],
    );
  }
}

/// Barra de passos da matrícula (canvas `CtgSteps`).
class CenterEnrollSteps extends StatelessWidget {
  const CenterEnrollSteps({super.key, required this.at});

  final int at;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    const labels = ['Turma', 'Plano', 'Confirmar'];
    return Row(
      children: [
        for (var i = 0; i < labels.length; i++) ...[
          if (i > 0) const SizedBox(width: 6),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  height: 4,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(2),
                    color: i < at
                        ? AppColors.win
                        : i == at
                        ? AppColors.brand
                        : ProfessorLinksStyle.line2(colors),
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  labels[i].toUpperCase(),
                  style: ProfessorLinksStyle.mono(
                    9,
                    color: i == at
                        ? colors.brandText
                        : ProfessorLinksStyle.dim(colors),
                  ).copyWith(letterSpacing: 1),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _StudentStep extends StatelessWidget {
  const _StudentStep({
    required this.students,
    required this.loading,
    required this.query,
    required this.onQuery,
    required this.onPick,
    required this.onNew,
  });

  final List<CenterCoachStudent> students;
  final bool loading;
  final String query;
  final ValueChanged<String> onQuery;
  final ValueChanged<CenterCoachStudent> onPick;
  final VoidCallback onNew;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final q = query.trim().toLowerCase();
    final shown = [
      for (final s in students)
        if (s.status == 'active' && (q.isEmpty || s.name.toLowerCase().contains(q)))
          s,
    ]..sort((a, b) => a.name.compareTo(b.name));
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
      children: [
        TextField(
          key: const Key('center-enroll-search'),
          onChanged: onQuery,
          style: AppTypography.bodyS.copyWith(color: colors.onSurface),
          decoration: InputDecoration(
            hintText: 'Buscar aluno pelo nome',
            prefixIcon: Icon(
              Icons.search_rounded,
              size: 18,
              color: ProfessorLinksStyle.dim(colors),
            ),
            filled: true,
            fillColor: ProfessorLinksStyle.soft(colors),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(color: ProfessorLinksStyle.line(colors)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(color: ProfessorLinksStyle.line(colors)),
            ),
          ),
        ),
        const SizedBox(height: 10),
        ProfessorLinksGhostButton(
          key: const Key('center-enroll-new-student'),
          label: '+ Novo aluno',
          height: 44,
          onPressed: onNew,
        ),
        const SizedBox(height: 12),
        if (loading && students.isEmpty)
          const Center(child: CircularProgressIndicator(color: AppColors.brand))
        else if (shown.isEmpty)
          const ProfessorLinksCard(
            child: ProfessorMutedText(
              'Nenhum aluno encontrado. Quem ainda não é aluno do centro, '
              'cadastre em "Novo aluno".',
            ),
          )
        else
          ProfessorLinksCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                for (final (i, s) in shown.take(40).indexed)
                  InkWell(
                    key: Key('center-enroll-student-${s.id}'),
                    onTap: () => onPick(s),
                    child: Container(
                      padding: const EdgeInsets.fromLTRB(14, 11, 12, 11),
                      decoration: BoxDecoration(
                        border: i == 0
                            ? null
                            : Border(
                                top: BorderSide(
                                  color: ProfessorLinksStyle.line(colors),
                                ),
                              ),
                      ),
                      child: Row(
                        children: [
                          ArenaClassAvatar(
                            initials: arenaClassInitials(s.name),
                            size: 34,
                          ),
                          const SizedBox(width: 11),
                          Expanded(
                            child: Text(
                              s.name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: ProfessorLinksStyle.display(
                                13.5,
                                weight: FontWeight.w700,
                                color: colors.onSurface,
                              ),
                            ),
                          ),
                          if (s.isMinor)
                            const ArenaClassTag(
                              label: 'Menor',
                              color: Color(0xFF5B9BFF),
                            ),
                          Icon(
                            Icons.chevron_right_rounded,
                            size: 16,
                            color: ProfessorLinksStyle.dim(colors),
                          ),
                        ],
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

class _ClassCard extends StatelessWidget {
  const _ClassCard({
    super.key,
    required this.cls,
    required this.selected,
    required this.already,
    required this.queue,
    required this.onTap,
  });

  final CenterCoachClass cls;
  final bool selected;
  final bool already;
  final int queue;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final c = cls;
    final full = centerClassIsFull(c);
    final pct = c.capacity <= 0
        ? 0.0
        : (c.seatsTaken / c.capacity).clamp(0.0, 1.0);
    return Opacity(
      opacity: already ? 0.5 : 1,
      child: ProfessorLinksCard(
        onTap: onTap,
        padding: const EdgeInsets.all(13),
        borderColor: selected ? AppColors.brand : null,
        backgroundColor: selected
            ? AppColors.brand.withValues(alpha: 0.06)
            : null,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (c.level.isNotEmpty)
                  Text(
                    c.level.toUpperCase(),
                    style: ProfessorLinksStyle.mono(
                      9,
                      color: ProfessorLinksStyle.mute(colors),
                    ).copyWith(letterSpacing: 1),
                  ),
                const Spacer(),
                if (already)
                  ArenaClassTag(
                    label: 'Já matriculado',
                    color: ProfessorLinksStyle.dim(colors),
                  )
                else if (full)
                  ArenaClassTag(
                    label: queue > 0 ? 'Lotada · $queue na espera' : 'Lotada',
                    color: AppColors.pending,
                  )
                else
                  Text(
                    '${c.capacity - c.seatsTaken} '
                    '${c.capacity - c.seatsTaken == 1 ? 'vaga' : 'vagas'}',
                    style: ProfessorLinksStyle.mono(
                      10.5,
                      color: context.themeColors.readableTone(AppColors.win),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              c.name,
              style: ProfessorLinksStyle.display(
                15,
                weight: FontWeight.w700,
                color: colors.onSurface,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              [
                coachClassScheduleLabel(c),
                if (c.coachName.isNotEmpty) c.coachName.split(' ').first,
              ].where((x) => x.isNotEmpty).join(' · '),
              style: AppTypography.bodyS.copyWith(
                fontSize: 11.5,
                color: ProfessorLinksStyle.dim(colors),
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(3),
                    child: LinearProgressIndicator(
                      value: pct,
                      minHeight: 5,
                      backgroundColor: ProfessorLinksStyle.line2(colors),
                      color: full ? AppColors.pending : AppColors.brand,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Text(
                  '${c.seatsTaken}/${c.capacity}',
                  style: ProfessorLinksStyle.mono(
                    10.5,
                    color: colors.onSurface,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _FullSheet extends StatefulWidget {
  const _FullSheet({
    required this.cls,
    required this.student,
    required this.waitlistOn,
    required this.position,
    required this.alternatives,
  });

  final CenterCoachClass cls;
  final CenterCoachStudent student;
  final bool waitlistOn;
  final int position;
  final List<CenterCoachClass> alternatives;

  @override
  State<_FullSheet> createState() => _FullSheetState();
}

class _FullSheetState extends State<_FullSheet> {
  String? _pick;

  @override
  void initState() {
    super.initState();
    _pick = widget.waitlistOn
        ? 'waitlist'
        : widget.alternatives.firstOrNull?.id;
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.cls;
    final first = widget.student.name.split(' ').first;
    return ProfessorLinksSheetBody(
      key: const Key('center-enroll-full-sheet'),
      title: '${c.name} está lotada',
      subtitle: '${c.seatsTaken}/${c.capacity} vagas ocupadas',
      children: [
        if (widget.waitlistOn)
          CenterRadioTile(
            key: const Key('center-enroll-full-waitlist'),
            title: 'Entrar na lista de espera',
            subtitle:
                '$first será o ${widget.position}º · aviso quando abrir vaga',
            selected: _pick == 'waitlist',
            onTap: () => setState(() => _pick = 'waitlist'),
          ),
        for (final a in widget.alternatives)
          CenterRadioTile(
            key: Key('center-enroll-full-alt-${a.id}'),
            title: a.name,
            subtitle: [
              coachClassScheduleLabel(a),
              if (a.coachName.isNotEmpty) a.coachName.split(' ').first,
              '${a.capacity - a.seatsTaken} '
                  '${a.capacity - a.seatsTaken == 1 ? 'vaga' : 'vagas'}',
            ].where((x) => x.isNotEmpty).join(' · '),
            selected: _pick == a.id,
            onTap: () => setState(() => _pick = a.id),
          ),
        if (!widget.waitlistOn && widget.alternatives.isEmpty)
          const ProfessorMutedText(
            'A lista de espera está desligada nas políticas do centro e não há '
            'outra turma do mesmo nível com vaga.',
          ),
        ProfessorLinksPrimaryButton(
          key: const Key('center-enroll-full-continue'),
          label: 'Continuar',
          onPressed: _pick == null
              ? null
              : () => Navigator.of(context).pop(_pick),
        ),
      ],
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({
    super.key,
    required this.plan,
    required this.priceCents,
    required this.selected,
    required this.onTap,
  });

  final CenterPlan plan;
  final int priceCents;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksCard(
      onTap: onTap,
      padding: const EdgeInsets.all(14),
      borderColor: selected ? AppColors.brand : null,
      backgroundColor: selected ? AppColors.brand.withValues(alpha: 0.06) : null,
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  plan.name,
                  style: ProfessorLinksStyle.display(
                    14.5,
                    weight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                if (plan.ruleLabel.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    plan.ruleLabel,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11.5,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                centerBrl(priceCents),
                style: ProfessorLinksStyle.display(
                  16,
                  color: colors.onSurface,
                ),
              ),
              Text(
                plan.isMonthly ? '/mês' : 'pacote',
                style: ProfessorLinksStyle.mono(
                  9.5,
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// G13 · Resultado: pendente (vaga reservada, cobrança enviada), ativa ou na
/// lista de espera.
class _ResultStep extends ConsumerWidget {
  const _ResultStep({
    required this.centerId,
    required this.member,
    required this.student,
    required this.cls,
    required this.plan,
    required this.result,
  });

  final String centerId;
  final CenterMembership member;
  final CenterCoachStudent student;
  final CenterCoachClass? cls;
  final CenterPlan? plan;
  final CenterEnrollResult result;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final r = result;
    final first = student.name.split(' ').first;
    final (icon, tone, title, text) = switch (r) {
      CenterWaitlisted(:final position) => (
        Icons.hourglass_top_rounded,
        AppColors.brand,
        'Na lista de espera',
        '$first é o $positionº da fila. Quando abrir vaga, o centro oferece '
            'e a cobrança sai nessa hora.',
      ),
      CenterEnrolled(status: 'active') => (
        Icons.check_rounded,
        AppColors.win,
        'Matrícula ativa',
        'A vaga é de $first a partir de agora. A cobrança segue para pagar '
            'pelo app.',
      ),
      _ => (
        Icons.schedule_rounded,
        AppColors.pending,
        'Matrícula pendente',
        'A vaga fica reservada e a matrícula ativa quando o pagamento for '
            'confirmado.',
      ),
    };
    final enrolled = r is CenterEnrolled ? r : null;
    final hold = enrolled?.holdUntil;
    String two(int n) => n.toString().padLeft(2, '0');
    final holdLocal = hold == null ? null : toNexagoEventLocal(hold);

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
      children: [
        const CenterEnrollSteps(at: 3),
        const SizedBox(height: 20),
        Center(
          child: Container(
            width: 60,
            height: 60,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              color: tone.withValues(alpha: 0.12),
              border: Border.all(color: tone.withValues(alpha: 0.4)),
            ),
            child: Icon(icon, size: 26, color: colors.readableTone(tone)),
          ),
        ),
        const SizedBox(height: 14),
        Text(
          title,
          key: const Key('center-enroll-result-title'),
          textAlign: TextAlign.center,
          style: ProfessorLinksStyle.display(20, color: colors.onSurface),
        ),
        const SizedBox(height: 6),
        Text(
          text,
          textAlign: TextAlign.center,
          style: AppTypography.bodyS.copyWith(
            fontSize: 13,
            height: 1.5,
            color: ProfessorLinksStyle.mute(colors),
          ),
        ),
        const SizedBox(height: 16),
        CenterInfoRows(
          rows: [
            if (cls != null) ('Turma', cls!.name),
            if (plan != null) ('Plano', plan!.name),
            if (enrolled?.amountCents != null)
              ('1ª cobrança', '${centerBrl(enrolled!.amountCents!)} · Pix'),
            if (holdLocal != null)
              (
                'Reserva até',
                '${centerDayLabel('${holdLocal.year}-${two(holdLocal.month)}-${two(holdLocal.day)}')}'
                    ' · ${two(holdLocal.hour)}:${two(holdLocal.minute)}',
              ),
          ],
        ),
        if (enrolled?.invoiceId != null) ...[
          const SizedBox(height: 12),
          ProfessorLinksNote(
            'Cobrança enviada: $first recebe o aviso e paga pelo app NexaGO '
            '(Pix ou cartão).',
            tone: ProfessorLinksNoteTone.blue,
          ),
        ],
        const SizedBox(height: 18),
        if (enrolled?.invoiceId != null && member.has('view_finance')) ...[
          ProfessorLinksGhostButton(
            key: const Key('center-enroll-open-invoice'),
            label: 'Ver cobrança',
            onPressed: () => context.pushReplacementNamed(
              AppRouteNames.centerCoachInvoice,
              pathParameters: {
                'centerId': centerId,
                'invoiceId': enrolled!.invoiceId!,
              },
            ),
          ),
          const SizedBox(height: 8),
        ],
        ProfessorLinksPrimaryButton(
          key: const Key('center-enroll-done'),
          label: 'Concluir',
          onPressed: () => popOrGo(context, AppRoutes.centerCoachAgenda),
        ),
      ],
    );
  }
}
