import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../../core/notifications/notification_navigation.dart'
    show athleteAgendaTabLocation;
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../athlete/domain/agenda/athlete_agenda_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/athlete_training_providers.dart';
import '../../../core/links/open_external_url.dart';
import '../../../core/time/nexago_event_timezone.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../domain/training_center.dart';
import '../domain/training_plans.dart';
import 'widgets/training_origin_widgets.dart';
import 'widgets/training_widgets.dart';

/// T14/O8 · Planos e pagamentos — turma cobrada pela arena, particular
/// cobrada pelo professor e mensalidade do centro de treinamento: cada origem
/// cobra separado (`getMyTrainingPlans` + `getMyClassCharges` +
/// `getMyTrainingCenters`).
class AthleteTrainingPlansPage extends ConsumerWidget {
  const AthleteTrainingPlansPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(athleteTrainingPlansProvider);
    final plans = async.valueOrNull;
    final open = ref.watch(myClassChargesProvider).valueOrNull ?? const [];
    final centers =
        ref.watch(athleteTrainingCentersProvider).valueOrNull ?? const [];
    final todayKey =
        nexagoEventDayKey(ref.watch(professorLinksClockProvider)());
    final centerOpen = [
      for (final c in centers)
        for (final i in c.openInvoices) (c, i),
    ];
    final centerPlans = [
      for (final c in centers)
        for (final e in c.enrollments) (c, e),
    ];
    final activeCount = (plans?.activeCount ?? 0) + centerPlans.length;
    final openCount = open.length + centerOpen.length;
    final payments = plans == null
        ? const <TrainingPayment>[]
        : centerPaymentsMerged(plans.payments, centers);
    final subtitle = plans == null
        ? null
        : [
            activeCount == 1 ? '1 ATIVO' : '$activeCount ATIVOS',
            openCount == 0 ? 'NADA EM ABERTO' : '$openCount EM ABERTO',
          ].join(' · ');

    return ProfessorLinksScaffold(
      title: 'Planos e pagamentos',
      subtitle: subtitle,
      onBack: () => popOrGo(context, AppRoutes.athleteTrainings),
      body: RefreshIndicator(
        color: AppColors.brand,
        onRefresh: () async {
          ref.invalidate(myClassChargesProvider);
          ref.invalidate(athleteTrainingPlansProvider);
          ref.invalidate(athleteTrainingCentersProvider);
          await ref.read(athleteTrainingPlansProvider.future);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            if (plans == null && async.hasError)
              ProfessorRetryCard(
                message: 'Não foi possível carregar seus planos.',
                onRetry: () => ref.invalidate(athleteTrainingPlansProvider),
              )
            else if (plans == null)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Center(
                  child: CircularProgressIndicator(color: AppColors.brand),
                ),
              )
            else ...[
              if (open.isNotEmpty) ...[
                TrainingTilesBlock(
                  children: [
                    for (final c in open)
                      TrainingListTile(
                        key: Key('training-plans-open-${c.chargeId}'),
                        icon: Icons.receipt_long_outlined,
                        title: '${c.description} · ${formatBRL(c.amountReais)}',
                        subtitle: [
                          c.arenaName,
                          if (c.dueDate.isNotEmpty)
                            '${c.overdue ? 'venceu' : 'vence'} '
                                '${trainingPlanShortDate(c.dueDate)}',
                        ].join(' · '),
                        highlight: c.overdue,
                        onTap: () => context.go(athleteAgendaTabLocation),
                      ),
                  ],
                ),
                const SizedBox(height: 6),
              ],
              for (final (c, i) in centerOpen) ...[
                TrainingTilesBlock(
                  children: [
                    TrainingListTile(
                      key: Key('training-plans-center-open-${i.invoiceId}'),
                      icon: Icons.receipt_long_outlined,
                      title: '${i.reference} · ${formatBRLFromCents(i.amountCents)}',
                      subtitle: [
                        c.name,
                        if (i.dueDate.isNotEmpty)
                          '${i.isOverdue(todayKey) ? 'venceu' : 'vence'} '
                              '${trainingPlanShortDate(i.dueDate)}',
                        if (i.payUrl != null) 'toque para pagar',
                      ].join(' · '),
                      highlight: i.isOverdue(todayKey),
                      onTap: () => i.payUrl != null
                          ? openExternalUrl(i.payUrl!)
                          : context.pushNamed(
                              AppRouteNames.athleteTrainingCenter,
                              pathParameters: {'centerId': c.centerId},
                              queryParameters: const {'aba': 'plano'},
                            ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
              ],
              if (activeCount == 0)
                const ProfessorLinksCard(
                  key: Key('training-plans-empty'),
                  child: ProfessorMutedText(
                    'Nenhum plano ativo. A matrícula numa turma da arena, no '
                    'centro de treinamento e o plano com um professor '
                    'aparecem aqui.',
                  ),
                ),
              for (final p in plans.arenaPlans) ...[
                _ArenaPlanCard(plan: p),
                const SizedBox(height: 10),
              ],
              for (final p in plans.professorPlans) ...[
                _ProfessorPlanCard(plan: p),
                const SizedBox(height: 10),
              ],
              for (final (c, e) in centerPlans) ...[
                _CenterPlanCard(center: c, enrollment: e),
                const SizedBox(height: 10),
              ],
              if (payments.isNotEmpty) ...[
                const TrainingSectionTitle('Últimos pagamentos'),
                ProfessorLinksCard(
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  child: Column(
                    children: [
                      for (final (i, pay) in payments.indexed) ...[
                        if (i > 0)
                          Divider(
                            height: 1,
                            color: ProfessorLinksStyle.line(
                              context.themeColors,
                            ),
                          ),
                        _PaymentRow(payment: pay),
                      ],
                    ],
                  ),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

/// Cartão do plano: faixa com quem cobra, nome, resumo e as linhas.
class _PlanCard extends StatelessWidget {
  const _PlanCard({
    super.key,
    required this.color,
    required this.payer,
    required this.title,
    required this.subtitle,
    required this.rows,
    this.usage,
  });

  final Color color;
  final String payer;
  final String title;
  final String subtitle;

  /// (rótulo, valor, cor do valor).
  final List<(String, String, Color?)> rows;

  /// (usadas, total) — barra de aulas do pacote.
  final (int, int)? usage;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final tone = colors.readableTone(color);
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: ProfessorLinksStyle.line(colors)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  color.withValues(alpha: 0.08),
                  color.withValues(alpha: 0)
                ],
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  payer.toUpperCase(),
                  style: ProfessorLinksStyle.mono(9.5, color: tone)
                      .copyWith(letterSpacing: 0.4),
                ),
                const SizedBox(height: 7),
                Text(
                  title,
                  style: ProfessorLinksStyle.display(
                    16,
                    weight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                if (subtitle.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 12,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
                if (usage != null) ...[
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      for (var i = 0; i < usage!.$2; i++) ...[
                        if (i > 0) const SizedBox(width: 3),
                        Expanded(
                          child: Container(
                            height: 6,
                            decoration: BoxDecoration(
                              color:
                                  i < usage!.$1 ? color : colors.surfaceRaised,
                              borderRadius: BorderRadius.circular(3),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${usage!.$1} DE ${usage!.$2} USADAS',
                          style: ProfessorLinksStyle.mono(
                            10,
                            color: ProfessorLinksStyle.mute(colors),
                          ),
                        ),
                      ),
                      Text(
                        '${usage!.$2 - usage!.$1} RESTANTES',
                        style: ProfessorLinksStyle.mono(10, color: tone),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 0, 14, 6),
            child: Column(
              children: [
                for (final (label, value, valueColor) in rows)
                  Container(
                    padding: const EdgeInsets.symmetric(vertical: 9),
                    decoration: BoxDecoration(
                      border: Border(
                        top:
                            BorderSide(color: ProfessorLinksStyle.line(colors)),
                      ),
                    ),
                    child: Row(
                      children: [
                        Text(
                          label,
                          style: AppTypography.bodyS.copyWith(
                            fontSize: 12,
                            color: ProfessorLinksStyle.dim(colors),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            value,
                            textAlign: TextAlign.right,
                            style: ProfessorLinksStyle.display(
                              12.5,
                              weight: FontWeight.w600,
                              color: valueColor == null
                                  ? colors.onSurface
                                  : colors.readableTone(valueColor),
                            ),
                          ),
                        ),
                      ],
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

class _ArenaPlanCard extends StatelessWidget {
  const _ArenaPlanCard({required this.plan});

  final ArenaTrainingPlan plan;

  @override
  Widget build(BuildContext context) {
    final p = plan;
    final teacher = p.slots
        .map((s) => s.teacherName)
        .firstWhere((n) => n.isNotEmpty, orElse: () => '');
    final className = p.slots.isEmpty ? '' : p.slots.first.className;
    final credits = p.credits;
    final left = p.creditsLeft;
    return _PlanCard(
      key: Key('training-plan-arena-${p.enrollmentId}'),
      color: AppColors.brand,
      payer: 'Cobrado pela ${p.arenaName}',
      title: className.isEmpty ? p.planName : 'Turma $className',
      subtitle: [
        arenaPlanScheduleLabel(p.slots),
        if (teacher.isNotEmpty) 'Prof. $teacher',
      ].where((s) => s.isNotEmpty).join(' · '),
      usage: p.isPackage && credits != null && left != null && credits > 0
          ? ((credits - left).clamp(0, credits), credits)
          : null,
      rows: [
        (
          'Plano',
          '${p.planName} · ${formatBRL(p.priceReais)}'
              '${p.kind == 'monthly' ? '/mês' : ''}',
          null,
        ),
        (
          'Pagamento',
          arenaPaymentMethodLabel(p.paymentMethod, p.billingMode),
          null,
        ),
        if (p.isPackage && p.expiresOn != null)
          ('Validade', 'até ${trainingPlanShortDate(p.expiresOn!)}', null)
        else if (p.billedThrough != null)
          ('Pago até', trainingPlanShortDate(p.billedThrough!), null)
        else if (p.startDate.isNotEmpty)
          ('Desde', trainingPlanShortDate(p.startDate), null),
        if (!p.isPackage && p.dueDay != null)
          ('Vencimento', 'todo dia ${p.dueDay}', null),
        (
          'Reposições',
          p.makeupCredits == 0
              ? 'nenhuma disponível'
              : p.makeupCredits == 1
                  ? '1 disponível'
                  : '${p.makeupCredits} disponíveis',
          p.makeupCredits > 0 ? ProfessorLinksStyle.blue : null,
        ),
      ],
    );
  }
}

/// Matrícula no centro: cobrada PELO CENTRO (mensalidade recorrente ou
/// pacote).
class _CenterPlanCard extends StatelessWidget {
  const _CenterPlanCard({required this.center, required this.enrollment});

  final TrainingCenterLink center;
  final CenterEnrollment enrollment;

  @override
  Widget build(BuildContext context) {
    final e = enrollment;
    final credits = e.credits;
    final left = e.creditsLeft;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => context.pushNamed(
        AppRouteNames.athleteTrainingCenter,
        pathParameters: {'centerId': center.centerId},
        queryParameters: const {'aba': 'plano'},
      ),
      child: _PlanCard(
        key: Key('training-plan-center-${e.enrollmentId}'),
        color: trainingCenterColor,
        payer: 'Mensalidade ao ${center.name}',
        title: e.className,
        subtitle: centerPlanSummary(e),
        usage: e.isPack && credits != null && left != null && credits > 0
            ? ((credits - left).clamp(0, credits), credits)
            : null,
        rows: [
          (
            'Valor',
            '${formatBRLFromCents(e.priceCents)}${e.isPack ? '' : '/mês'}',
            null,
          ),
          if (e.billingStatus != null)
            ('Pagamento', centerBillingMethodLabel(e.billingMethod), null),
          if (e.nextChargeDate != null)
            ('Próxima', trainingPlanShortDate(e.nextChargeDate!), null),
          if (e.status != 'active')
            ('Situação', centerEnrollmentStatusLabel(e), AppColors.pending),
        ],
      ),
    );
  }
}

class _ProfessorPlanCard extends StatelessWidget {
  const _ProfessorPlanCard({required this.plan});

  final ProfessorTrainingPlan plan;

  @override
  Widget build(BuildContext context) {
    final p = plan;
    final kind = trainingPlanKindLabel(p.kind);
    final classes = p.classes == null
        ? null
        : p.kind == 'monthly'
            ? '${p.classes} aulas/mês'
            : '${p.classes} aulas';
    return _PlanCard(
      key: Key('training-plan-professor-${p.professorUid}'),
      color: ProfessorLinksStyle.blue,
      payer: 'Cobrado pelo Prof. ${p.professorName}',
      title: p.planName ?? 'Aulas com ${p.professorName}',
      subtitle: [
        if (p.planName != null) kind,
        if (classes != null) classes,
      ].join(' · '),
      rows: [
        if (p.recurringReais != null)
          (
            'Mensalidade',
            '${formatBRL(p.recurringReais!)} · todo dia '
                '${p.recurringDueDay ?? '-'}',
            null,
          )
        else
          ('Cobrança', 'Por aula ou pacote, quando o professor enviar', null),
        ('Pagamento', 'Pix ou cartão direto ao professor', null),
      ],
    );
  }
}

class _PaymentRow extends StatelessWidget {
  const _PaymentRow({required this.payment});

  final TrainingPayment payment;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final p = payment;
    final row = Padding(
      padding: const EdgeInsets.symmetric(vertical: 11),
      child: Row(
        children: [
          SizedBox(
            width: 46,
            child: Text(
              trainingPlanShortDate(p.paidOn).toUpperCase(),
              style: ProfessorLinksStyle.mono(
                10,
                color: ProfessorLinksStyle.dim(colors),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  p.description,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ProfessorLinksStyle.display(
                    12.5,
                    weight: FontWeight.w600,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  [p.payee, p.method].where((s) => s.isNotEmpty).join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 11,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            formatBRL(p.amountReais),
            style: ProfessorLinksStyle.mono(12, color: colors.onSurface),
          ),
        ],
      ),
    );
    // Cobrança do professor tem comprovante no app (B19).
    if (!p.fromProfessor) return row;
    return InkWell(
      key: Key('training-payment-${p.chargeId}'),
      onTap: () => context.pushNamed(
        AppRouteNames.lessonPaymentReceipt,
        pathParameters: {'chargeId': p.chargeId},
      ),
      child: row,
    );
  }
}
