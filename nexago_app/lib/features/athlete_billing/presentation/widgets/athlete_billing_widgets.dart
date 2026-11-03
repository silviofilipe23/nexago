import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/links/open_external_url.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../athlete/domain/agenda/athlete_agenda_logic.dart'
    show parseBookingDateTime;
import '../../../athlete/presentation/booking_details_page.dart';
import '../../../athlete_training/domain/training_plans.dart'
    show trainingPlanShortDate;
import '../../../athlete_training/presentation/widgets/training_origin_widgets.dart'
    show openCenterInvoice;
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../domain/athlete_billing.dart';

/// Peças das Cobranças (protótipo `cb-app-a.jsx` / `cb-app-b.jsx`).

IconData athleteChargeKindIcon(AthleteChargeKind kind) => switch (kind) {
      AthleteChargeKind.classes => Icons.school_outlined,
      AthleteChargeKind.fixedSchedule => Icons.event_repeat_outlined,
      AthleteChargeKind.booking => Icons.grid_view_rounded,
      AthleteChargeKind.tournament => Icons.emoji_events_outlined,
    };

Color athleteChargeStateColor(AthleteChargeState s, AppThemeColors c) =>
    switch (s) {
      AthleteChargeState.overdue => AppColors.live,
      AthleteChargeState.due => AppColors.pending,
      AthleteChargeState.direct => ProfessorLinksStyle.mute(c),
    };

/// Cor de cada tipo no histórico.
Color athleteChargeKindColor(AthleteChargeKind k, AppThemeColors c) =>
    switch (k) {
      AthleteChargeKind.classes => c.onSurface,
      AthleteChargeKind.fixedSchedule => AppColors.brand,
      AthleteChargeKind.booking => AppColors.win,
      AthleteChargeKind.tournament => AppColors.pending,
    };

/// Leva à tela de pagar da origem (fatura online, F2 do centro, planos de
/// horário, detalhe da reserva, inscrição).
Future<void> openAthleteCharge(BuildContext context, AthleteCharge c) async {
  switch (c.target) {
    case ClassInvoiceTarget(:final url):
      final opened = await openExternalUrl(url);
      if (!opened && context.mounted) {
        showAppSnackBar(
          context,
          'Não foi possível abrir a fatura.',
          isError: true,
        );
      }
    case TrainingPlansTarget():
      context.pushNamed(AppRouteNames.athleteTrainingPlans);
    case CenterInvoiceTarget(:final centerId, :final invoiceId):
      openCenterInvoice(context, centerId, invoiceId);
    case SchedulePlansTarget():
      context.pushNamed(AppRouteNames.mySchedulePlans);
    case BookingTarget(:final booking):
      final start = parseBookingDateTime(booking.dateRaw, booking.startTime) ??
          DateTime.now();
      final end = parseBookingDateTime(booking.dateRaw, booking.endTime);
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => BookingDetailsPage(
            bookingId: booking.id,
            arenaId: booking.arenaId,
            arenaName: booking.arenaName,
            courtName: booking.courtName ?? 'Quadra',
            startAt: start,
            endAt: end != null && end.isAfter(start)
                ? end
                : start.add(const Duration(hours: 1)),
            status: booking.rawStatus,
            confirmedParticipants: booking.confirmedParticipants,
            amountReais: booking.amountReais,
            paymentType: booking.paymentType,
          ),
        ),
      );
    case TournamentRegistrationTarget(:final tournamentId):
      context.pushNamed(
        AppRouteNames.tournamentRegistration,
        pathParameters: {'tournamentId': tournamentId},
      );
  }
}

/// Cobranças já filtradas em Aulas (entrada pelos Treinos).
void openTrainingCharges(BuildContext context) => context.pushNamed(
      AppRouteNames.athleteBilling,
      queryParameters: {'tipo': AthleteChargeKind.classes.key},
    );

/// Abre o plano na tela da origem.
void openRecurringCharge(BuildContext context, AthleteRecurringCharge r) {
  switch (r.target) {
    case ArenaClassTarget(:final enrollmentId):
      context.pushNamed(
        AppRouteNames.athleteTrainingArenaClass,
        pathParameters: {'enrollmentId': enrollmentId},
      );
    case PrivateLinkTarget(:final professorUid):
      context.pushNamed(
        AppRouteNames.athleteTrainingPrivateLink,
        pathParameters: {'professorUid': professorUid},
      );
    case CenterPlanTarget(:final centerId):
      context.pushNamed(
        AppRouteNames.athleteTrainingCenter,
        pathParameters: {'centerId': centerId},
        queryParameters: const {'aba': 'plano'},
      );
    case SchedulePlanTarget():
      context.pushNamed(AppRouteNames.mySchedulePlans);
  }
}

/// Quadradinho do tipo (aula, horário fixo, reserva, torneio).
class AthleteChargeKindIcon extends StatelessWidget {
  const AthleteChargeKindIcon({
    super.key,
    required this.kind,
    this.color,
    this.size = 38,
  });

  final AthleteChargeKind kind;
  final Color? color;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final c = color;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: c == null ? colors.surfaceRaised : c.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(size * 0.3),
        border: Border.all(
          color: c == null
              ? ProfessorLinksStyle.line(colors)
              : c.withValues(alpha: 0.27),
        ),
      ),
      child: Icon(
        athleteChargeKindIcon(kind),
        size: size * 0.47,
        color: c == null
            ? ProfessorLinksStyle.mute(colors)
            : colors.readableTone(c),
      ),
    );
  }
}

/// Linha da cobrança em aberto: tipo, título, quem recebe, valor e o selo do
/// vencimento.
class AthleteChargeRow extends StatelessWidget {
  const AthleteChargeRow({super.key, required this.charge, this.onTap});

  final AthleteCharge charge;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final c = charge;
    final late = c.isOverdue;
    final stateTone =
        colors.readableTone(athleteChargeStateColor(c.state, colors));
    return ProfessorLinksCard(
      key: Key('athlete-charge-${c.id}'),
      onTap: onTap,
      padding: const EdgeInsets.all(13),
      backgroundColor: late ? AppColors.live.withValues(alpha: 0.06) : null,
      borderColor: late ? AppColors.live.withValues(alpha: 0.32) : null,
      child: Row(
        children: [
          AthleteChargeKindIcon(
            kind: c.kind,
            color: late ? AppColors.live : null,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  c.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: ProfessorLinksStyle.display(
                    13.5,
                    weight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  [c.payee, if (c.note != null) c.note!].join(' · '),
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
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                c.amountReais > 0 ? formatBRL(c.amountReais) : '—',
                style: ProfessorLinksStyle.mono(13.5, color: colors.onSurface),
              ),
              const SizedBox(height: 4),
              Text(
                athleteChargeDueLabel(c),
                style: ProfessorLinksStyle.mono(9.5, color: stateTone)
                    .copyWith(letterSpacing: 0.4),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Topo do "Em aberto": total, barra por situação e a legenda.
class AthleteOpenSummaryCard extends StatelessWidget {
  const AthleteOpenSummaryCard({super.key, required this.charges});

  final List<AthleteCharge> charges;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final s = AthleteChargesSummary.of(charges);
    final legend = [
      if (s.overdueCount > 0)
        (
          AppColors.live,
          s.overdueCount == 1 ? '1 vencida' : '${s.overdueCount} vencidas',
        ),
      if (s.dueCount > 0) (AppColors.pending, '${s.dueCount} a pagar'),
      if (s.directCount > 0)
        (
          ProfessorLinksStyle.mute(colors),
          s.directCount == 1
              ? '1 paga direto'
              : '${s.directCount} pagas direto',
        ),
    ];
    final weighted = charges.where((c) => c.amountReais > 0).toList();
    return ProfessorLinksCard(
      key: const Key('athlete-billing-open-summary'),
      padding: const EdgeInsets.all(16),
      borderColor: ProfessorLinksStyle.line2(colors),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const ProfessorLinksKicker('Em aberto'),
          const SizedBox(height: 6),
          Text(
            formatBRL(s.total),
            style: ProfessorLinksStyle.display(32, color: colors.onSurface),
          ),
          if (weighted.isNotEmpty) ...[
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(3),
              child: SizedBox(
                height: 6,
                child: Row(
                  children: [
                    for (final (i, c) in weighted.indexed) ...[
                      if (i > 0) const SizedBox(width: 2),
                      Expanded(
                        flex: (c.amountReais * 100).round().clamp(1, 1 << 30),
                        child: ColoredBox(
                          color: athleteChargeStateColor(c.state, colors),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
          const SizedBox(height: 12),
          Wrap(
            spacing: 14,
            runSpacing: 6,
            children: [
              for (final (color, label) in legend)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 7,
                      height: 7,
                      decoration: BoxDecoration(
                        color: color,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      label,
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 11.5,
                        color: ProfessorLinksStyle.mute(colors),
                      ),
                    ),
                  ],
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Filtro por tipo (rola na horizontal).
class AthleteChargeKindFilter extends StatelessWidget {
  const AthleteChargeKindFilter({
    super.key,
    required this.selected,
    required this.onChanged,
  });

  final AthleteChargeKind? selected;
  final ValueChanged<AthleteChargeKind?> onChanged;

  @override
  Widget build(BuildContext context) {
    final items = <(AthleteChargeKind?, String)>[
      (null, 'Todas'),
      for (final k in AthleteChargeKind.values) (k, k.label),
    ];
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      clipBehavior: Clip.none,
      child: Row(
        children: [
          for (final (i, (kind, label)) in items.indexed) ...[
            if (i > 0) const SizedBox(width: 6),
            _KindChip(
              key: Key('athlete-billing-filter-${kind?.key ?? 'todas'}'),
              label: label,
              selected: selected == kind,
              onTap: () => onChanged(kind),
            ),
          ],
        ],
      ),
    );
  }
}

class _KindChip extends StatelessWidget {
  const _KindChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: selected
            ? AppColors.brand.withValues(alpha: 0.12)
            : colors.surfaceCard,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
          side: BorderSide(
            color: selected
                ? AppColors.brand.withValues(alpha: 0.45)
                : ProfessorLinksStyle.line(colors),
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            height: 34,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            alignment: Alignment.center,
            child: Text(
              label,
              style: AppTypography.bodyS.copyWith(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: selected
                    ? colors.brandText
                    : ProfessorLinksStyle.mute(colors),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Cartão do plano recorrente: quem cobra, tipo, nome, ciclo, valor e a
/// forma de pagamento com a próxima cobrança.
class AthleteRecurringCard extends StatelessWidget {
  const AthleteRecurringCard({super.key, required this.item, this.onTap});

  final AthleteRecurringCharge item;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final r = item;
    return ProfessorLinksCard(
      key: Key('athlete-recurring-${r.id}'),
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  r.payee,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 11.5,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ),
              Text(
                r.kind.label.toUpperCase(),
                style: ProfessorLinksStyle.mono(
                  9.5,
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      r.title,
                      style: ProfessorLinksStyle.display(
                        14,
                        weight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      r.cycleLabel,
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 11.5,
                        color: ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    formatBRL(r.amountReais),
                    style:
                        ProfessorLinksStyle.mono(14, color: colors.onSurface),
                  ),
                  if (r.totalReais != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      'de ${formatBRL(r.totalReais!)}',
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 10.5,
                        color: ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ),
          const SizedBox(height: 10),
          Divider(height: 1, color: ProfessorLinksStyle.line(colors)),
          const SizedBox(height: 10),
          Row(
            children: [
              Icon(
                Icons.payments_outlined,
                size: 14,
                color: ProfessorLinksStyle.mute(colors),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  [
                    r.methodLabel,
                    if (r.nextLabel != null) 'próx. ${r.nextLabel}',
                  ].join(' · '),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 12,
                    color: ProfessorLinksStyle.mute(colors),
                  ),
                ),
              ),
              if (onTap != null) ...[
                const SizedBox(width: 8),
                Text(
                  'Gerenciar',
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: colors.brandText,
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

/// "Pago em outubro": total do mês e a divisão por tipo.
class AthletePaidMonthSummary extends StatelessWidget {
  const AthletePaidMonthSummary({super.key, required this.month});

  final PaidMonth month;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final byKind = month.byKind;
    return ProfessorLinksCard(
      key: const Key('athlete-billing-paid-summary'),
      padding: const EdgeInsets.all(15),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: ProfessorLinksKicker(
                  'Pago em ${paidMonthName(month.monthKey)}',
                ),
              ),
              Text(
                formatBRL(month.total),
                style: ProfessorLinksStyle.display(18, color: colors.onSurface),
              ),
            ],
          ),
          const SizedBox(height: 11),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: SizedBox(
              height: 8,
              child: Row(
                children: [
                  for (final (i, (k, v)) in byKind.indexed) ...[
                    if (i > 0) const SizedBox(width: 2),
                    Expanded(
                      flex: (v * 100).round().clamp(1, 1 << 30),
                      child: ColoredBox(
                        color: athleteChargeKindColor(k, colors),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 11),
          Wrap(
            spacing: 14,
            runSpacing: 6,
            children: [
              for (final (k, v) in byKind)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 7,
                      height: 7,
                      decoration: BoxDecoration(
                        color: athleteChargeKindColor(k, colors),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      '${k.label} · ${formatBRL(v)}',
                      style: AppTypography.bodyS.copyWith(
                        fontSize: 11.5,
                        color: ProfessorLinksStyle.mute(colors),
                      ),
                    ),
                  ],
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Os pagamentos de um mês, um por linha (o do professor abre o comprovante).
class AthletePaidMonthList extends StatelessWidget {
  const AthletePaidMonthList({super.key, required this.month});

  final PaidMonth month;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksCard(
      padding: const EdgeInsets.symmetric(horizontal: 13),
      child: Column(
        children: [
          for (final (i, p) in month.items.indexed) ...[
            if (i > 0)
              Divider(height: 1, color: ProfessorLinksStyle.line(colors)),
            _PaidRow(payment: p),
          ],
        ],
      ),
    );
  }
}

class _PaidRow extends StatelessWidget {
  const _PaidRow({required this.payment});

  final AthletePaidCharge payment;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final p = payment;
    final receipt = p.professorChargeId;
    final row = Padding(
      padding: const EdgeInsets.symmetric(vertical: 11),
      child: Row(
        children: [
          SizedBox(
            width: 46,
            child: Text(
              trainingPlanShortDate(p.paidOn).toUpperCase(),
              style: ProfessorLinksStyle.mono(
                9.5,
                color: ProfessorLinksStyle.dim(colors),
              ),
            ),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  p.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 12.5,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 1),
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
            style: ProfessorLinksStyle.mono(
              12,
              color: ProfessorLinksStyle.mute(colors),
            ),
          ),
          if (receipt != null) ...[
            const SizedBox(width: 8),
            Icon(
              Icons.receipt_long_outlined,
              size: 15,
              color: ProfessorLinksStyle.dim(colors),
            ),
          ],
        ],
      ),
    );
    if (receipt == null) return row;
    return InkWell(
      key: Key('athlete-paid-${p.id}'),
      onTap: () => context.pushNamed(
        AppRouteNames.lessonPaymentReceipt,
        pathParameters: {'chargeId': receipt},
      ),
      child: row,
    );
  }
}
