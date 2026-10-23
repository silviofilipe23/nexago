import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/time/nexago_event_timezone.dart';
import '../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../application/center_coach_providers.dart';
import '../application/center_management_providers.dart';
import '../domain/center_coach.dart';
import '../domain/center_coach_repository.dart';
import '../domain/center_finance.dart';
import '../domain/center_management.dart';
import '../domain/center_students.dart' show centerInvoiceDisplayStatus;
import '../infrastructure/firebase_center_management_repository.dart';
import 'center_coach_finance_page.dart' show centerInvoiceToneColor;
import 'widgets/center_management_widgets.dart';

Color _subTone(CenterSubscription s, AppThemeColors colors) =>
    centerInvoiceToneColor(s.statusTone, colors);

String _invoiceTone(String status) => switch (status) {
  'late' || 'failed' || 'disputed' => 'red',
  'pending' => 'yellow',
  'approved' => 'green',
  _ => 'dim',
};

/// Card "Assinatura" do perfil do aluno: uma linha por assinatura.
class CenterSubscriptionsCard extends StatelessWidget {
  const CenterSubscriptionsCard({
    super.key,
    required this.subscriptions,
    required this.onOpen,
  });

  final List<CenterSubscription> subscriptions;
  final ValueChanged<String> onOpen;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(14, 12, 14, 4),
            child: CenterKicker('Mensalidade recorrente'),
          ),
          for (final s in subscriptions)
            InkWell(
              key: Key('center-student-subscription-${s.id}'),
              onTap: () => onOpen(s.id),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 8, 12, 12),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            s.planName.isEmpty ? 'Assinatura' : s.planName,
                            style: ProfessorLinksStyle.display(
                              13.5,
                              weight: FontWeight.w700,
                              color: colors.onSurface,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            [
                              centerBrl(s.priceCents),
                              if (s.nextChargeDate.length == 10)
                                'próximo ${centerDayLabel(s.nextChargeDate)}',
                              s.methodLabel,
                            ].join(' · '),
                            style: AppTypography.bodyS.copyWith(
                              fontSize: 11.5,
                              color: ProfessorLinksStyle.dim(colors),
                            ),
                          ),
                        ],
                      ),
                    ),
                    ArenaClassTag(
                      label: s.statusLabel,
                      color: _subTone(s, colors),
                    ),
                    const SizedBox(width: 4),
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
    );
  }
}

/// R6 · Assinatura da mensalidade (gestão): situação, próximo ciclo, forma
/// de pagamento, os ciclos já cobrados e as ações que o servidor permite —
/// cobrar agora e cancelar no fim do ciclo (ou desfazer).
class CenterCoachSubscriptionPage extends ConsumerStatefulWidget {
  const CenterCoachSubscriptionPage({
    super.key,
    required this.centerId,
    required this.studentId,
    required this.subscriptionId,
  });

  final String centerId;
  final String studentId;
  final String subscriptionId;

  @override
  ConsumerState<CenterCoachSubscriptionPage> createState() =>
      _CenterCoachSubscriptionPageState();
}

class _CenterCoachSubscriptionPageState
    extends ConsumerState<CenterCoachSubscriptionPage> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
    } on CenterCoachException catch (e) {
      if (mounted) showCenterError(context, e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final centerId = widget.centerId;
    final colors = context.themeColors;
    final member = ref.watch(centerMembershipProvider(centerId));
    final now = ref.watch(professorLinksClockProvider)();
    final today = nexagoEventDayKey(now);
    final subsAsync = ref.watch(
      centerStudentSubscriptionsProvider((
        centerId: centerId,
        studentId: widget.studentId,
      )),
    );
    final sub = (subsAsync.valueOrNull ?? const <CenterSubscription>[])
        .where((s) => s.id == widget.subscriptionId)
        .firstOrNull;
    final invoices = sub == null
        ? null
        : ref
              .watch(coachInvoicesProvider(centerId))
              .valueOrNull
              ?.where((i) => i.enrollmentId == sub.enrollmentId)
              .toList()
          ?..sort((a, b) => b.dueDate.compareTo(a.dueDate));
    final open = invoices
        ?.where((i) => centerInvoiceIsOpen(i))
        .firstOrNull;
    final manager = member?.isManager ?? false;
    final repo = ref.read(centerManagementRepositoryProvider);
    final actor = ref.read(centerActorProvider(centerId));

    final list = ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
      children: [
        if (sub == null)
          subsAsync.isLoading
              ? const Padding(
                  padding: EdgeInsets.symmetric(vertical: 40),
                  child: Center(
                    child: CircularProgressIndicator(color: AppColors.brand),
                  ),
                )
              : const ProfessorLinksCard(
                  child: ProfessorMutedText('Assinatura não encontrada.'),
                )
        else ...[
          _Hero(sub: sub, open: open, today: today),
          const SizedBox(height: 12),
          CenterInfoRows(
            rows: [
              if (sub.className.isNotEmpty) ('Turma', sub.className),
              if (sub.nextChargeDate.length == 10 && sub.status != 'cancelled')
                (
                  'Próximo ciclo',
                  '${centerDayLabel(sub.nextChargeDate)} · ${centerBrl(sub.priceCents)}',
                ),
              ('Forma de pagamento', sub.methodLabel),
              ('Vencimento', 'Todo dia ${sub.billingDay.toString().padLeft(2, '0')}'),
              if (sub.cancelAt != null && sub.cancelAt!.length == 10)
                ('Encerra em', centerDayLabel(sub.cancelAt!)),
              if (sub.pausedUntil != null && sub.pausedUntil!.length == 10)
                ('Pausada até', centerDayLabel(sub.pausedUntil!)),
              if (sub.startDate.length == 10)
                ('Contrato desde', centerDayLabel(sub.startDate)),
            ],
          ),
          if (invoices != null) ...[
            const SizedBox(height: 16),
            const CenterKicker('Ciclos'),
            const SizedBox(height: 8),
            if (invoices.isEmpty)
              const ProfessorLinksCard(
                child: ProfessorMutedText('Nenhuma cobrança gerada ainda.'),
              )
            else
              ProfessorLinksCard(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    for (final (i, inv) in invoices.indexed)
                      _CycleRow(
                        key: Key('center-subscription-cycle-${inv.id}'),
                        first: i == 0,
                        title: inv.dueDate.length >= 7
                            ? centerCycleTitle(inv.dueDate.substring(0, 7))
                            : inv.reference,
                        subtitle: centerInvoiceStatusLine(
                          inv,
                          todayKey: today,
                          now: now,
                          localDayKey: nexagoEventDayKey,
                        ),
                        amount: centerBrl(inv.amountCents),
                        tone: centerInvoiceToneColor(
                          _invoiceTone(centerInvoiceDisplayStatus(inv, today)),
                          colors,
                        ),
                        onTap: () => context.pushNamed(
                          AppRouteNames.centerCoachInvoice,
                          pathParameters: {
                            'centerId': centerId,
                            'invoiceId': inv.id,
                          },
                        ),
                      ),
                  ],
                ),
              ),
          ],
          const SizedBox(height: 12),
          Text(
            sub.method == 'pix_manual'
                ? 'O aluno recebe o Pix 3 dias antes de cada vencimento. '
                      'Cartão recorrente e Pix Automático ainda não estão '
                      'disponíveis.'
                : 'Cobrança automática no vencimento; o aviso sai 3 dias antes.',
            textAlign: TextAlign.center,
            style: AppTypography.bodyS.copyWith(
              fontSize: 11.5,
              color: ProfessorLinksStyle.dim(colors),
            ),
          ),
        ],
      ],
    );

    final actions = sub == null || !manager
        ? const <Widget>[]
        : [
            if (sub.canChargeNow)
              ProfessorLinksPrimaryButton(
                key: const Key('center-subscription-charge'),
                label: 'Cobrar agora',
                height: 48,
                loading: _busy,
                onPressed: () => _run(() async {
                  final r = await repo.chargeNow(
                    centerId: centerId,
                    subscription: sub,
                  );
                  if (!mounted) return;
                  if (r.invoiceUrl.isNotEmpty) {
                    await Clipboard.setData(ClipboardData(text: r.invoiceUrl));
                  }
                  if (!mounted) return;
                  showCenterError(
                    context,
                    r.invoiceUrl.isNotEmpty
                        ? 'Cobrança pronta · link copiado para enviar ao aluno.'
                        : r.generated
                        ? 'Cobrança gerada · o link sai em instantes.'
                        : 'Já existe uma cobrança aberta neste ciclo.',
                  );
                }),
              ),
            if (sub.canScheduleCancel)
              ProfessorLinksGhostButton(
                key: const Key('center-subscription-cancel'),
                label: 'Cancelar no fim do ciclo',
                color: AppColors.live,
                loading: _busy,
                onPressed: () => _confirmCancel(sub),
              ),
            if (sub.canUndoCancel)
              ProfessorLinksGhostButton(
                key: const Key('center-subscription-undo'),
                label: 'Desfazer cancelamento',
                loading: _busy,
                onPressed: () => _run(
                  () => repo.undoSubscriptionCancel(
                    centerId: centerId,
                    subscription: sub,
                    actor: actor,
                  ),
                ),
              ),
          ];

    return ProfessorLinksScaffold(
      title: 'Assinatura',
      subtitle: sub == null
          ? null
          : [
              sub.studentName.toUpperCase(),
              if (sub.planName.isNotEmpty) sub.planName.toUpperCase(),
            ].join(' · '),
      onBack: () => popOrGo(context, AppRoutes.centerCoachAgenda),
      body: actions.isEmpty
          ? list
          : Column(
              children: [
                Expanded(child: list),
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
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      for (final (i, a) in actions.indexed) ...[
                        if (i > 0) const SizedBox(height: 8),
                        a,
                      ],
                    ],
                  ),
                ),
              ],
            ),
    );
  }

  Future<void> _confirmCancel(CenterSubscription sub) async {
    final ok = await showProfessorLinksSheet<bool>(
      context,
      builder: (sheet) => ProfessorLinksSheetBody(
        key: const Key('center-subscription-cancel-sheet'),
        title: 'Cancelar no fim do ciclo',
        subtitle: sub.nextChargeDate.length == 10
            ? 'Encerra em ${centerDayLabel(sub.nextChargeDate)}'
            : null,
        children: [
          const ProfessorLinksNote(
            'O próximo ciclo não é gerado e a matrícula encerra no '
            'vencimento. Até lá o aluno segue treinando; dá para desfazer.',
            tone: ProfessorLinksNoteTone.yellow,
          ),
          ProfessorLinksGhostButton(
            key: const Key('center-subscription-cancel-confirm'),
            label: 'Agendar cancelamento',
            color: AppColors.live,
            onPressed: () => Navigator.of(sheet).pop(true),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    await _run(
      () => ref
          .read(centerManagementRepositoryProvider)
          .scheduleSubscriptionCancel(
            centerId: widget.centerId,
            subscription: sub,
            actor: ref.read(centerActorProvider(widget.centerId)),
          ),
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero({required this.sub, required this.open, required this.today});

  final CenterSubscription sub;
  final CenterCoachInvoice? open;
  final String today;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final tone = _subTone(sub, colors);
    final inv = open;
    final late = inv != null && centerInvoiceDisplayStatus(inv, today) == 'late';
    final text = switch (sub.status) {
      'past_due' when inv != null =>
        'Cobrança de ${centerDayLabel(inv.dueDate)} em aberto'
            '${late ? ' · venceu há ${centerDaysBetween(inv.dueDate, today)} dias' : ''}.',
      'past_due' => 'Há cobrança vencida sem pagamento.',
      'canceling' =>
        'Encerra no próximo vencimento; o ciclo seguinte não é gerado.',
      'paused' => 'Sem cobrança enquanto a matrícula estiver pausada.',
      'suspended' => 'Suspensa por atraso: o check-in mostra a pendência.',
      'cancelled' => 'Assinatura encerrada.',
      _ when inv != null =>
        'Cobrança de ${centerDayLabel(inv.dueDate)} aguardando pagamento.',
      _ => 'Em dia. A próxima cobrança nasce 3 dias antes do vencimento.',
    };
    return ProfessorLinksCard(
      key: const Key('center-subscription-hero'),
      borderColor: tone.withValues(alpha: 0.3),
      backgroundColor: tone.withValues(alpha: 0.07),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  sub.statusLabel.toUpperCase(),
                  style: AppTypography.eyebrow.copyWith(
                    color: colors.readableTone(tone),
                  ),
                ),
              ),
              Text(
                sub.methodLabel.toUpperCase(),
                style: ProfessorLinksStyle.mono(
                  10,
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            '${centerBrl(inv?.amountCents ?? sub.priceCents)}'
            '${inv == null ? '/mês' : ''}',
            style: ProfessorLinksStyle.display(24, color: colors.onSurface),
          ),
          const SizedBox(height: 6),
          Text(
            text,
            style: AppTypography.bodyS.copyWith(
              fontSize: 12.5,
              height: 1.45,
              color: ProfessorLinksStyle.mute(colors),
            ),
          ),
        ],
      ),
    );
  }
}

class _CycleRow extends StatelessWidget {
  const _CycleRow({
    super.key,
    required this.first,
    required this.title,
    required this.subtitle,
    required this.amount,
    required this.tone,
    required this.onTap,
  });

  final bool first;
  final String title;
  final String subtitle;
  final String amount;
  final Color tone;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
        decoration: BoxDecoration(
          border: first
              ? null
              : Border(top: BorderSide(color: ProfessorLinksStyle.line(colors))),
        ),
        child: Row(
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(shape: BoxShape.circle, color: tone),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: ProfessorLinksStyle.display(
                      13.5,
                      weight: FontWeight.w600,
                      color: colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11.5,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
              ),
            ),
            Text(
              amount,
              style: ProfessorLinksStyle.mono(11.5, color: colors.onSurface),
            ),
            const SizedBox(width: 4),
            Icon(
              Icons.chevron_right_rounded,
              size: 16,
              color: ProfessorLinksStyle.dim(colors),
            ),
          ],
        ),
      ),
    );
  }
}
