import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../data/arena_class_repository.dart';
import '../../domain/arena_access_providers.dart';
import '../../domain/arena_schedule_providers.dart';
import '../../domain/arena_staff_role.dart';
import '../../domain/aulas/arena_class.dart';
import '../../domain/aulas/arena_class_billing_logic.dart';
import '../../domain/aulas/arena_class_enrollment.dart';
import '../../domain/aulas/arena_class_enrollment_providers.dart';
import '../../domain/aulas/arena_class_logic.dart';
import '../../domain/aulas/arena_class_providers.dart';
import '../../domain/aulas/arena_class_session.dart';
import '../widgets/arena_async_state.dart';
import 'arena_class_enroll_page.dart';
import 'arena_class_payment_sheet.dart';
import 'widgets/arena_class_atoms.dart';
import 'widgets/arena_class_form_atoms.dart';

/// Semanas do histórico de frequência.
const int _frequencyWeeks = 8;

/// Página do aluno (A6): plano e horários fixos, créditos de reposição,
/// frequência das últimas 8 semanas, últimas aulas, mensalidades (com a
/// situação da fatura online, "Cobrar" e "Copiar link") e
/// pausar/reativar/cancelar o plano (`setArenaClassEnrollmentStatus`).
///
/// [studentId] é o id do doc em `classStudents` (uid do atleta ou id
/// gerado). [classId] (opcional) acha o aluno da fase 1, que não tem
/// matrícula para dizer em que turma ele está.
class ArenaClassStudentPage extends ConsumerStatefulWidget {
  const ArenaClassStudentPage({
    super.key,
    required this.studentId,
    this.classId,
  });

  final String studentId;
  final String? classId;

  @override
  ConsumerState<ArenaClassStudentPage> createState() =>
      _ArenaClassStudentPageState();
}

class _ArenaClassStudentPageState extends ConsumerState<ArenaClassStudentPage> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final arenaId = ref.watch(managedArenaIdProvider).valueOrNull ?? '';
    final todayKey = ref.watch(arenaClassTodayKeyProvider);
    final enrollmentsAsync =
        ref.watch(arenaClassStudentEnrollmentsProvider(widget.studentId));
    final charges = ref
            .watch(arenaClassStudentChargesProvider(widget.studentId))
            .valueOrNull ??
        const <ArenaClassCharge>[];
    final credits = ref
            .watch(arenaClassStudentCreditsProvider(widget.studentId))
            .valueOrNull ??
        const <ArenaClassCredit>[];
    final classes = ref.watch(managedArenaClassesProvider).valueOrNull ??
        const <ArenaClass>[];
    final canWrite = ref.watch(arenaCanWriteProvider(ArenaArea.agenda));
    final arenaName = ref.watch(managedArenaDetailProvider).valueOrNull?.name;

    final enrollments = enrollmentsAsync.valueOrNull;
    final enrollment = enrollments == null ? null : _pick(enrollments);

    // Turmas do aluno: as da matrícula e a de onde ele veio (fase 1).
    final classIds = <String>{
      if (enrollment != null && enrollment.isCurrent)
        for (final s in enrollment.slots) s.classId,
      if (widget.classId != null && widget.classId!.isNotEmpty) widget.classId!,
    };
    final studentDocs = <String, ArenaClassStudent>{};
    for (final classId in classIds) {
      final list = ref
              .watch(arenaClassStudentsProvider(
                  (arenaId: arenaId, classId: classId)))
              .valueOrNull ??
          const <ArenaClassStudent>[];
      for (final s in list) {
        if (s.id == widget.studentId) studentDocs[classId] = s;
      }
    }

    final anyDoc = studentDocs.values.firstOrNull;
    final name = enrollment?.name ??
        anyDoc?.name ??
        (charges.isEmpty ? 'Aluno' : charges.first.name);
    final phone = enrollment?.phone ??
        anyDoc?.phone ??
        charges.map((c) => c.phone).whereType<String>().firstOrNull;
    final photoUrl = enrollment?.photoUrl ?? anyDoc?.photoUrl;
    final classNames = {for (final c in classes) c.id: c.name};

    // Dias que contam na frequência: os da matrícula; sem ela, os do doc.
    final weekdaysByClass = <String, List<int>?>{};
    if (enrollment != null && enrollment.isCurrent) {
      for (final s in enrollment.slots) {
        (weekdaysByClass[s.classId] ??= <int>[]).add(s.weekday);
      }
    }
    for (final e in studentDocs.entries) {
      weekdaysByClass.putIfAbsent(e.key, () => e.value.weekdays);
    }
    final fromKey = _weeksAgo(todayKey, _frequencyWeeks);
    final sessions = <ArenaClassSession>[
      for (final classId in weekdaysByClass.keys)
        ...ref
                .watch(arenaClassSessionsSinceProvider(
                    (classId: classId, fromKey: fromKey)))
                .valueOrNull ??
            const <ArenaClassSession>[],
    ];
    final frequency = buildArenaClassStudentFrequency(
      studentId: widget.studentId,
      sessions: sessions,
      weekdaysByClass: weekdaysByClass,
      fromKey: _laterOf(fromKey, enrollment?.startDate),
      todayKey: todayKey,
    );
    final standing = arenaClassStudentStanding(
      enrollment: enrollment,
      charges: charges,
      todayKey: todayKey,
    );
    final validCredits = arenaClassValidCredits(credits, todayKey);

    final loading = enrollmentsAsync.isLoading && enrollments == null;
    if (enrollmentsAsync.hasError && enrollments == null) {
      return _scaffold(
        context,
        ArenaErrorState(message: '${enrollmentsAsync.error}'),
      );
    }
    if (loading) {
      return _scaffold(
        context,
        const ArenaLoadingState(label: 'Carregando aluno...'),
      );
    }

    final subtitleParts = [
      if (classIds.isNotEmpty)
        classIds.map((id) => classNames[id]).whereType<String>().join(' · '),
      if (enrollment != null && enrollment.startDate.isNotEmpty)
        'desde ${arenaClassMonthYear(enrollment.startDate)}',
    ].where((s) => s.isNotEmpty).toList();

    return _scaffold(
      context,
      ListView(
        padding: EdgeInsets.fromLTRB(
          16,
          10,
          16,
          MediaQuery.paddingOf(context).bottom + 32,
        ),
        children: [
          Row(
            children: [
              ArenaClassAvatar(
                initials: arenaClassInitials(name),
                photoUrl: photoUrl,
                size: 60,
                zoomName: name,
                zoomMeta: enrollment?.plan.name ?? anyDoc?.planName,
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      style: AppTypography.soraRegular(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: colors.onSurface,
                      ),
                    ),
                    if (subtitleParts.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        subtitleParts.join(' · '),
                        style: TextStyle(
                          fontSize: 12,
                          color: colors.onSurfaceMuted,
                        ),
                      ),
                    ],
                    const SizedBox(height: 7),
                    _StandingPill(standing: standing),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: ArenaClassGhostButton(
                  label: 'WhatsApp',
                  icon: Icons.chat_bubble_outline_rounded,
                  onPressed: phone == null
                      ? null
                      : () => openArenaClassWhatsApp(
                            context,
                            phone: phone,
                            message: 'Olá, ${arenaClassFirstName(name)}!',
                          ),
                ),
              ),
              if (canWrite &&
                  (enrollment == null || !enrollment.isCurrent)) ...[
                const SizedBox(width: 8),
                Expanded(
                  child: SizedBox(
                    height: 42,
                    child: FilledButton(
                      onPressed: () => context.pushNamed(
                        AppRouteNames.arenaClassEnroll,
                        extra: ArenaClassEnrollSeed(
                          athleteId: anyDoc?.athleteId ?? enrollment?.athleteId,
                          studentId: widget.studentId,
                          name: name,
                          phone: phone,
                          photoUrl: photoUrl,
                        ),
                      ),
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.brand,
                        foregroundColor: AppColors.black,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      child: Text(
                        'Matricular',
                        style: AppTypography.soraRegular(fontSize: 13),
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 12),
          _PlanCard(
            enrollment: enrollment,
            charges: charges,
            validCredits: validCredits,
            todayKey: todayKey,
            classNames: classNames,
          ),
          const SizedBox(height: 12),
          _FrequencyCard(frequency: frequency),
          if (frequency.lessons.isNotEmpty) ...[
            const SizedBox(height: 16),
            const ArenaClassKicker('Últimas aulas'),
            const SizedBox(height: 6),
            for (final l in frequency.recent(5))
              _LessonRow(lesson: l, className: l.session.className),
          ],
          if (charges.isNotEmpty) ...[
            const SizedBox(height: 16),
            const ArenaClassKicker('Mensalidades'),
            const SizedBox(height: 4),
            for (final c in _chargesForList(charges))
              _ChargeRow(
                charge: c,
                todayKey: todayKey,
                onRegister:
                    canWrite && c.isOpen ? () => _register(context, c) : null,
                onRemind: c.isOpen && (c.phone ?? phone) != null
                    ? () => openArenaClassWhatsApp(
                          context,
                          phone: c.phone ?? phone,
                          message: arenaClassChargeReminderMessage(
                            c,
                            todayKey: todayKey,
                            arenaName: arenaName,
                          ),
                        )
                    : null,
                onCopyLink: switch (arenaClassChargeInvoiceUrl(c)) {
                  final url? => () => copyArenaClassInvoiceLink(context, url),
                  null => null,
                },
              ),
          ],
          if (canWrite && enrollment != null && enrollment.isCurrent) ...[
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: ArenaClassGhostButton(
                    label:
                        enrollment.isPaused ? 'Reativar plano' : 'Pausar plano',
                    busy: _busy,
                    onPressed: () => _setStatus(
                      enrollment,
                      enrollment.isPaused ? 'active' : 'paused',
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: ArenaClassGhostButton(
                    label: 'Cancelar plano',
                    color: AppColors.live,
                    busy: _busy,
                    onPressed: () => _setStatus(enrollment, 'canceled'),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _scaffold(BuildContext context, Widget body) {
    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ArenaClassHeader(
              eyebrow: 'AULAS',
              title: 'Aluno',
              onBack: () => context.pop(),
            ),
            Expanded(child: body),
          ],
        ),
      ),
    );
  }

  /// Matrícula que a página mostra: a atual (ativa/pausada) mais recente;
  /// sem nenhuma atual, a última encerrada.
  static ArenaClassEnrollment? _pick(List<ArenaClassEnrollment> list) {
    if (list.isEmpty) return null;
    int byStart(ArenaClassEnrollment a, ArenaClassEnrollment b) =>
        b.startDate.compareTo(a.startDate);
    final current = list.where((e) => e.isCurrent).toList()..sort(byStart);
    if (current.isNotEmpty) return current.first;
    return ([...list]..sort(byStart)).first;
  }

  static String _weeksAgo(String todayKey, int weeks) {
    final d = DateTime.tryParse(todayKey);
    if (d == null) return todayKey;
    final from = DateTime(d.year, d.month, d.day - weeks * 7 + 1);
    return '${from.year}-${from.month.toString().padLeft(2, '0')}-'
        '${from.day.toString().padLeft(2, '0')}';
  }

  static String _laterOf(String a, String? b) =>
      b == null || b.isEmpty || a.compareTo(b) >= 0 ? a : b;

  /// Em aberto primeiro (vence antes), depois as últimas pagas — até 5.
  static List<ArenaClassCharge> _chargesForList(List<ArenaClassCharge> all) {
    final open = all.where((c) => c.isOpen).toList()
      ..sort((a, b) => a.dueDate.compareTo(b.dueDate));
    final paid = all.where((c) => c.isPaid).toList()
      ..sort((a, b) => (b.paidOn ?? '').compareTo(a.paidOn ?? ''));
    return [...open, ...paid].take(5).toList();
  }

  Future<void> _register(BuildContext context, ArenaClassCharge c) async {
    final result = await showArenaClassPaymentSheet(context, charge: c);
    if (result == null || !context.mounted) return;
    showAppSnackBar(
      context,
      result == ArenaClassChargeSheetResult.canceled
          ? 'Mensalidade cancelada.'
          : 'Pagamento registrado.',
    );
  }

  Future<void> _setStatus(ArenaClassEnrollment e, String status) async {
    final first = arenaClassFirstName(e.name);
    final (title, body, action) = switch (status) {
      'paused' => (
          'Pausar o plano?',
          '$first sai da chamada e não gera novas mensalidades até reativar. '
              'A vaga fica livre nesse meio-tempo.',
          'Pausar plano',
        ),
      'active' => (
          'Reativar o plano?',
          '$first volta para a chamada nos mesmos horários — se a turma '
              'lotou nesse dia, não dá para reativar.',
          'Reativar',
        ),
      _ => (
          'Cancelar o plano?',
          '$first sai das turmas e as mensalidades que ainda não venceram são '
              'canceladas. As vencidas continuam em aberto.',
          'Cancelar plano',
        ),
    };
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: ctx.themeColors.surfaceSheet,
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Voltar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: status == 'canceled'
                ? FilledButton.styleFrom(backgroundColor: AppColors.live)
                : null,
            child: Text(action),
          ),
        ],
      ),
    );
    if (go != true || !mounted) return;
    setState(() => _busy = true);
    try {
      final canceled = await ref
          .read(arenaClassEnrollmentRepositoryProvider)
          .setEnrollmentStatus(enrollmentId: e.id, status: status);
      if (!mounted) return;
      showAppSnackBar(
        context,
        switch (status) {
          'paused' => 'Plano pausado.',
          'active' => 'Plano reativado.',
          _ => canceled > 0
              ? 'Plano cancelado · $canceled mensalidade'
                  '${canceled == 1 ? '' : 's'} futura${canceled == 1 ? '' : 's'} '
                  'cancelada${canceled == 1 ? '' : 's'}.'
              : 'Plano cancelado.',
        },
      );
    } on ArenaClassException catch (err) {
      if (!mounted) return;
      showAppSnackBar(context, err.message, isError: true);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível alterar o plano. Tente novamente.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _StandingPill extends StatelessWidget {
  const _StandingPill({required this.standing});

  final ArenaClassStudentStanding standing;

  @override
  Widget build(BuildContext context) {
    final color = switch (standing) {
      ArenaClassStudentStanding.upToDate => AppColors.win,
      ArenaClassStudentStanding.dueToday => AppColors.pending,
      ArenaClassStudentStanding.overdue => AppColors.live,
      ArenaClassStudentStanding.paused ||
      ArenaClassStudentStanding.noPlan =>
        context.themeColors.onSurfaceMuted,
    };
    return Align(
      alignment: Alignment.centerLeft,
      child: ArenaClassTag(label: standing.label, color: color),
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({
    required this.enrollment,
    required this.charges,
    required this.validCredits,
    required this.todayKey,
    required this.classNames,
  });

  final ArenaClassEnrollment? enrollment;
  final List<ArenaClassCharge> charges;
  final List<ArenaClassCredit> validCredits;
  final String todayKey;
  final Map<String, String> classNames;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final e = enrollment;
    final creditsLabel = validCredits.isEmpty
        ? 'Nenhum'
        : '${validCredits.length} · expira '
            '${arenaClassShortDate(validCredits.first.expiresOn)}';
    if (e == null || !e.isCurrent) {
      return ArenaClassPanel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const ArenaClassKicker('Plano'),
            const SizedBox(height: 8),
            Text(
              e == null ? 'Sem plano' : 'Plano encerrado',
              style: AppTypography.soraRegular(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: colors.onSurface,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              e == null
                  ? 'Aluno da turma sem matrícula — não gera mensalidade nem '
                      'crédito por plano.'
                  : '${e.plan.name} · ${e.status == 'ended' ? 'terminou' : 'cancelado'}. '
                      'Faça uma nova matrícula para voltar às aulas.',
              style: TextStyle(
                fontSize: 12.5,
                height: 1.4,
                color: colors.onSurfaceMuted,
              ),
            ),
            ArenaClassInfoRow(
              label: 'Créditos de reposição',
              value: creditsLabel,
              valueColor: validCredits.isEmpty ? null : AppColors.win,
            ),
          ],
        ),
      );
    }

    final slots = [
      for (final s in e.slots)
        ArenaClassEnrollmentSlot(
          classId: s.classId,
          weekday: s.weekday,
          className: classNames[s.classId] ?? s.className,
          startTime: s.startTime,
        ),
    ];
    final open = charges.where((c) => c.isOpen).toList()
      ..sort((a, b) => a.dueDate.compareTo(b.dueDate));
    final overdue =
        open.where((c) => arenaClassChargeIsOverdue(c, todayKey)).toList();
    final next =
        open.where((c) => !arenaClassChargeIsOverdue(c, todayKey)).firstOrNull;
    final isPackage = e.plan.kind == ArenaClassPlanKind.package;
    final online = e.billingMode == ArenaClassBillingMode.asaas;

    return ArenaClassPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Expanded(child: ArenaClassKicker('Plano')),
              if (e.isPaused)
                ArenaClassTag(
                  label: 'Pausado',
                  color: colors.onSurfaceMuted,
                ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Expanded(
                child: Text(
                  e.plan.name,
                  style: AppTypography.soraRegular(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
              ),
              Text(
                arenaClassPlanPrice(e.plan),
                style: AppTypography.soraRegular(
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                  color: AppColors.brand,
                ),
              ),
            ],
          ),
          ArenaClassInfoRow(
            label: 'Horários fixos',
            value: arenaClassSlotsLabel(slots),
          ),
          if (isPackage) ...[
            ArenaClassInfoRow(
              label: 'Aulas restantes',
              value: '${e.creditsLeft ?? 0} de ${e.plan.credits ?? 0}',
            ),
            if (e.expiresOn != null)
              ArenaClassInfoRow(
                label: 'Validade',
                value: 'até ${arenaClassShortDate(e.expiresOn!)}',
              ),
          ] else
            ArenaClassInfoRow(
              label: 'Vencimento',
              // Online: a forma é escolhida pelo aluno na fatura.
              value: online
                  ? 'dia ${e.dueDay}'
                  : 'dia ${e.dueDay} · ${e.paymentMethod.label}',
            ),
          if (online) ...[
            const ArenaClassInfoRow(
              label: 'Cobrança',
              value: 'Online (PIX ou cartão)',
            ),
            if (e.cpfMasked != null)
              ArenaClassInfoRow(label: 'CPF do pagador', value: e.cpfMasked!),
          ],
          if (overdue.isNotEmpty)
            ArenaClassInfoRow(
              label: 'Em atraso',
              value:
                  '${formatBRL(overdue.fold<double>(0, (t, c) => t + c.amountReais))} · '
                  'desde ${arenaClassShortDate(overdue.first.dueDate)}',
              valueColor: AppColors.live,
            ),
          if (next != null)
            ArenaClassInfoRow(
              label: 'Próx. cobrança',
              value: '${arenaClassShortDate(next.dueDate)} · '
                  '${formatBRL(next.amountReais)}',
            ),
          ArenaClassInfoRow(
            label: 'Créditos de reposição',
            value: creditsLabel,
            valueColor: validCredits.isEmpty ? null : AppColors.win,
          ),
        ],
      ),
    );
  }
}

Color _markColor(BuildContext context, AttendanceMark? mark) => switch (mark) {
      AttendanceMark.present => AppColors.win,
      AttendanceMark.absent => AppColors.live,
      AttendanceMark.excused => AppColors.pending,
      null => context.themeColors.surfaceRaised,
    };

class _FrequencyCard extends StatelessWidget {
  const _FrequencyCard({required this.frequency});

  final ArenaClassStudentFrequency frequency;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final percent = frequency.percent;
    return ArenaClassPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              const Expanded(
                child:
                    ArenaClassKicker('Frequência · $_frequencyWeeks semanas'),
              ),
              Text(
                percent == null ? '—' : '$percent%',
                style: AppTypography.soraRegular(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: colors.onSurface,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (frequency.lessons.isEmpty)
            Text(
              'Nenhuma aula nas últimas $_frequencyWeeks semanas.',
              style: TextStyle(fontSize: 12.5, color: colors.onSurfaceMuted),
            )
          else
            LayoutBuilder(
              builder: (context, constraints) {
                const gap = 5.0;
                final cell = (constraints.maxWidth - gap * 7) / 8;
                return Wrap(
                  spacing: gap,
                  runSpacing: gap,
                  children: [
                    for (final l in frequency.lessons)
                      Tooltip(
                        message: '${arenaClassWeekdayDate(l.session.date)} · '
                            '${arenaClassLessonLabel(l.mark)}',
                        child: Container(
                          width: cell,
                          height: 18,
                          decoration: BoxDecoration(
                            color: _markColor(context, l.mark),
                            borderRadius: BorderRadius.circular(5),
                          ),
                        ),
                      ),
                  ],
                );
              },
            ),
        ],
      ),
    );
  }
}

class _LessonRow extends StatelessWidget {
  const _LessonRow({required this.lesson, required this.className});

  final ArenaClassStudentLesson lesson;
  final String className;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final mark = lesson.mark;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: mark == null
                  ? colors.onSurfaceMuted.withValues(alpha: 0.4)
                  : _markColor(context, mark),
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 12),
          SizedBox(
            width: 84,
            child: Text(
              arenaClassWeekdayDate(lesson.session.date),
              style: AppTypography.soraRegular(
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                color: colors.onSurface,
              ),
            ),
          ),
          Expanded(
            child: Text(
              '${arenaClassLessonLabel(mark)} · $className',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12, color: colors.onSurfaceMuted),
            ),
          ),
        ],
      ),
    );
  }
}

class _ChargeRow extends StatelessWidget {
  const _ChargeRow({
    required this.charge,
    required this.todayKey,
    required this.onRegister,
    required this.onRemind,
    required this.onCopyLink,
  });

  final ArenaClassCharge charge;
  final String todayKey;
  final VoidCallback? onRegister;

  /// "Cobrar": WhatsApp com a mensagem (e o link, se a fatura estiver aberta).
  final VoidCallback? onRemind;

  /// "Copiar link": só com a fatura online aberta.
  final VoidCallback? onCopyLink;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final c = charge;
    final color = c.isPaid
        ? AppColors.win
        : arenaClassChargeIsOverdue(c, todayKey)
            ? AppColors.live
            : colors.onSurfaceMuted;
    final online = arenaClassOnlineChargeStatus(c);
    Widget action(String label, IconData icon, VoidCallback onTap) =>
        TextButton.icon(
          onPressed: onTap,
          icon: Icon(icon, size: 15),
          label: Text(label),
          style: TextButton.styleFrom(
            visualDensity: VisualDensity.compact,
            // Sem a família, o estilo trocaria a Sora do tema pela do sistema.
            textStyle: AppTypography.soraRegular(
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
            ),
          ),
        );
    final actions = [
      if (onRemind != null)
        action('Cobrar', Icons.chat_bubble_outline_rounded, onRemind!),
      if (onCopyLink != null)
        action('Copiar link', Icons.link_rounded, onCopyLink!),
      if (onRegister != null)
        action('Registrar', Icons.payments_outlined, onRegister!),
    ];
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 9),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: colors.onSurface.withValues(alpha: 0.05)),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            c.description,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.soraRegular(
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              color: colors.onSurface,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            '${formatBRL(c.amountReais)} · '
            '${arenaClassChargeStatusLabel(c, todayKey)}',
            style: AppTypography.mono(fontSize: 10.5, color: color),
          ),
          if (online != null) ...[
            const SizedBox(height: 2),
            Text(
              online.label,
              style: AppTypography.mono(
                fontSize: 10.5,
                fontWeight: FontWeight.w700,
                color: arenaClassOnlineToneColor(context, online.tone),
              ),
            ),
          ],
          if (actions.isNotEmpty)
            Wrap(
              alignment: WrapAlignment.end,
              spacing: 2,
              children: actions,
            ),
        ],
      ),
    );
  }
}
