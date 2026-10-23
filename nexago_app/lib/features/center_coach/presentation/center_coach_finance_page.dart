import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/formatting/app_currency_format.dart';
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
import '../domain/center_coach.dart';
import '../domain/center_finance.dart';
import 'widgets/center_mode_tab_scope.dart';

/// Cor do tom das etiquetas de cobrança.
Color centerInvoiceToneColor(String tone, AppThemeColors colors) =>
    switch (tone) {
      'red' => AppColors.live,
      'green' => AppColors.win,
      'yellow' => AppColors.pending,
      _ => ProfessorLinksStyle.dim(colors),
    };

/// G15 · Cobranças do centro (quem vê o financeiro): recebido no mês, vencido
/// e a lista por aba. Toque abre a cobrança (G16).
class CenterCoachFinancePage extends ConsumerStatefulWidget {
  const CenterCoachFinancePage({super.key, required this.centerId});

  final String centerId;

  @override
  ConsumerState<CenterCoachFinancePage> createState() =>
      _CenterCoachFinancePageState();
}

class _CenterCoachFinancePageState
    extends ConsumerState<CenterCoachFinancePage> {
  CenterInvoiceTab _tab = CenterInvoiceTab.pending;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final centerId = widget.centerId;
    final member = ref.watch(centerMembershipProvider(centerId));
    final now = ref.watch(professorLinksClockProvider)();
    final today = nexagoEventDayKey(now);
    final async = ref.watch(coachInvoicesProvider(centerId));
    final all = async.valueOrNull ?? const <CenterCoachInvoice>[];
    final students =
        ref.watch(coachStudentsProvider(centerId)).valueOrNull ?? const {};
    final totals = centerFinanceTotals(
      all,
      todayKey: today,
      localDayKey: nexagoEventDayKey,
    );
    final shown = centerInvoicesFor(all, _tab, today);
    final allowed = member != null && member.has('view_finance');

    return ProfessorLinksScaffold(
      showBack: !CenterModeTabScope.of(context),
      title: 'Financeiro',
      subtitle:
          '${centerMonthLabel(today).toUpperCase()} · MENSALIDADES DOS ALUNOS',
      onBack: () => popOrGo(context, AppRoutes.centerCoachAgenda),
      body: ListView(
        padding: centerListPadding(context),
        children: [
          if (!allowed)
            const ProfessorLinksCard(
              key: Key('center-finance-denied'),
              child: ProfessorMutedText(
                'O financeiro do centro fica com quem tem essa permissão.',
              ),
            )
          else if (async.isLoading && async.valueOrNull == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(
                child: CircularProgressIndicator(color: AppColors.brand),
              ),
            )
          else ...[
            Row(
              children: [
                Expanded(
                  child: _Stat(
                    key: const Key('center-finance-received'),
                    value: formatBRLFromCents(totals.receivedCents),
                    label: 'recebido no mês',
                    color: AppColors.win,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _Stat(
                    key: const Key('center-finance-overdue'),
                    value: formatBRLFromCents(totals.overdueCents),
                    label: 'vencido',
                    color: totals.overdueCents > 0 ? AppColors.live : null,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final t in CenterInvoiceTab.values) ...[
                    AvailabilityChoiceChip(
                      key: Key('center-finance-tab-${t.name}'),
                      label: t == CenterInvoiceTab.pending
                          ? '${kCenterInvoiceTabLabels[t]} · '
                              '${all.where(centerInvoiceIsOpen).length}'
                          : kCenterInvoiceTabLabels[t]!,
                      selected: _tab == t,
                      onTap: () => setState(() => _tab = t),
                    ),
                    const SizedBox(width: 6),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 12),
            if (shown.isEmpty)
              ProfessorLinksCard(
                key: const Key('center-finance-empty'),
                child: ProfessorMutedText(switch (_tab) {
                  CenterInvoiceTab.pending => 'Nenhuma pendência. Tudo em dia.',
                  CenterInvoiceTab.received => 'Nada recebido ainda.',
                  CenterInvoiceTab.all => 'Nenhuma cobrança ainda.',
                }),
              )
            else
              ProfessorLinksCard(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    for (final (i, inv) in shown.indexed)
                      _InvoiceRow(
                        key: Key('center-finance-row-${inv.id}'),
                        invoice: inv,
                        name: inv.payerName.isNotEmpty
                            ? inv.payerName
                            : students[inv.studentId]?.name ?? 'Aluno',
                        line: centerInvoiceStatusLine(
                          inv,
                          todayKey: today,
                          now: now,
                          localDayKey: nexagoEventDayKey,
                        ),
                        today: today,
                        first: i == 0,
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
            const SizedBox(height: 12),
            Text(
              'Só conta como recebido o que o provedor aprovou ou o que foi '
              'confirmado à mão com comprovante.',
              textAlign: TextAlign.center,
              style: AppTypography.bodyS.copyWith(
                fontSize: 11.5,
                height: 1.45,
                color: ProfessorLinksStyle.dim(colors),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({
    super.key,
    required this.value,
    required this.label,
    this.color,
  });

  final String value;
  final String label;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 11, 12, 11),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ProfessorLinksStyle.line(colors)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              value,
              style: ProfessorLinksStyle.display(
                18,
                color: color == null
                    ? colors.onSurface
                    : colors.readableTone(color!),
              ),
            ),
          ),
          Text(
            label,
            style: AppTypography.bodyS.copyWith(
              fontSize: 10.5,
              color: ProfessorLinksStyle.dim(colors),
            ),
          ),
        ],
      ),
    );
  }
}

class _InvoiceRow extends StatelessWidget {
  const _InvoiceRow({
    super.key,
    required this.invoice,
    required this.name,
    required this.line,
    required this.today,
    required this.first,
    required this.onTap,
  });

  final CenterCoachInvoice invoice;
  final String name;
  final String line;
  final String today;
  final bool first;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final (label, tone) = centerInvoiceTag(invoice, today);
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
        decoration: BoxDecoration(
          border: first
              ? null
              : Border(
                  top: BorderSide(color: ProfessorLinksStyle.line(colors)),
                ),
        ),
        child: Row(
          children: [
            ArenaClassAvatar(initials: arenaClassInitials(name), size: 36),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: ProfessorLinksStyle.display(
                            13.5,
                            weight: FontWeight.w700,
                            color: colors.onSurface,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        formatBRLFromCents(invoice.amountCents),
                        style: ProfessorLinksStyle.mono(
                          12,
                          weight: FontWeight.w700,
                          color: colors.onSurface,
                        ),
                      ),
                    ],
                  ),
                  if (invoice.reference.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      invoice.reference,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 11.5,
                        color: ProfessorLinksStyle.mute(colors),
                      ),
                    ),
                  ],
                  const SizedBox(height: 5),
                  Row(
                    children: [
                      ArenaClassTag(
                        label: label,
                        color: centerInvoiceToneColor(tone, colors),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          line,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.bodyS.copyWith(
                            fontSize: 11,
                            color: ProfessorLinksStyle.dim(colors),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
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
