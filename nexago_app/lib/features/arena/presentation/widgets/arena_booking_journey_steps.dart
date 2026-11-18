import 'package:flutter/material.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/arena_booking_journey.dart';
import 'arena_dashboard_tokens.dart';

const double _dotSize = 26;

/// Etapas da reserva — Reservada → Chegada → Pago → Encerrada — cada uma
/// com o seu estado e, quando há o que fazer, o seu botão.
///
/// Os callbacks nulos escondem o botão (papel que só lê). O check-in
/// bloqueado por regra continua visível, desligado e com o motivo embaixo.
class ArenaBookingJourneySteps extends StatelessWidget {
  const ArenaBookingJourneySteps({
    super.key,
    required this.journey,
    this.onCheckIn,
    this.checkInBusy = false,
    this.onReceive,
  });

  final ArenaBookingJourney journey;
  final VoidCallback? onCheckIn;
  final bool checkInBusy;
  final VoidCallback? onReceive;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final steps = journey.steps;
    return DecoratedBox(
      decoration: ArenaDashboardTokens.cardDecoration(context),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Etapas',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: colors.onSurface,
                    ),
                  ),
                ),
                Text(
                  '${journey.doneCount} de ${steps.length}',
                  key: const Key('arena-booking-steps-count'),
                  style: AppTypography.mono(
                    fontSize: 12,
                    color: colors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            for (var i = 0; i < steps.length; i++)
              _StepRow(
                step: steps[i],
                isLast: i == steps.length - 1,
                action: _actionFor(context, steps[i]),
              ),
          ],
        ),
      ),
    );
  }

  Widget? _actionFor(BuildContext context, ArenaJourneyStep step) {
    switch (step.kind) {
      case ArenaJourneyStepKind.arrival:
        if (!journey.showsCheckIn || onCheckIn == null) return null;
        return _CheckInAction(
          enabled: journey.canCheckIn && !checkInBusy,
          busy: checkInBusy,
          blockReason: journey.checkInBlockReason,
          onPressed: onCheckIn!,
        );
      case ArenaJourneyStepKind.payment:
        if (!journey.canReceive || onReceive == null) return null;
        return _StepButton(
          key: const Key('arena-booking-step-receive'),
          label: 'Receber ${formatBRL(journey.bill.dueReais)}',
          icon: Icons.point_of_sale_rounded,
          onPressed: onReceive,
          primary: !journey.canCheckIn,
        );
      case ArenaJourneyStepKind.booked:
      case ArenaJourneyStepKind.closed:
        // Reservada e Encerrada acontecem sozinhas (criação e fim do
        // horário): não há o que o balcão faça nelas.
        return null;
    }
  }
}

class _StepRow extends StatelessWidget {
  const _StepRow({
    required this.step,
    required this.isLast,
    required this.action,
  });

  final ArenaJourneyStep step;
  final bool isLast;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final muted = step.status == ArenaJourneyStepStatus.upcoming;
    final subtitleColor = switch (step.status) {
      ArenaJourneyStepStatus.current => colors.pending,
      ArenaJourneyStepStatus.problem => colors.live,
      ArenaJourneyStepStatus.done ||
      ArenaJourneyStepStatus.upcoming =>
        colors.onSurfaceMuted,
    };
    return IntrinsicHeight(
      child: Row(
        key: Key('arena-booking-step-${step.kind.name}'),
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: _dotSize,
            child: Column(
              children: [
                _StepDot(status: step.status),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 2,
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      color: step.status == ArenaJourneyStepStatus.done
                          ? colors.win.withValues(alpha: 0.5)
                          : colors.surfaceRaised,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 10 : 16, top: 3),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    step.title,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: muted ? colors.onSurfaceMuted : colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    step.subtitle,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: subtitleColor,
                    ),
                  ),
                  if (action != null) ...[
                    const SizedBox(height: 10),
                    action!,
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StepDot extends StatelessWidget {
  const _StepDot({required this.status});

  final ArenaJourneyStepStatus status;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final (fill, border, icon, iconColor) = switch (status) {
      ArenaJourneyStepStatus.done => (
          AppColors.win.withValues(alpha: 0.16),
          colors.win,
          Icons.check_rounded,
          colors.win,
        ),
      ArenaJourneyStepStatus.current => (
          AppColors.pending.withValues(alpha: 0.16),
          colors.pending,
          Icons.more_horiz_rounded,
          colors.pending,
        ),
      ArenaJourneyStepStatus.problem => (
          AppColors.live.withValues(alpha: 0.14),
          colors.live,
          Icons.priority_high_rounded,
          colors.live,
        ),
      ArenaJourneyStepStatus.upcoming => (
          Colors.transparent,
          colors.onSurfaceMuted.withValues(alpha: 0.4),
          null,
          colors.onSurfaceMuted,
        ),
    };
    return Container(
      width: _dotSize,
      height: _dotSize,
      decoration: BoxDecoration(
        color: fill,
        shape: BoxShape.circle,
        border: Border.all(color: border, width: 1.6),
      ),
      child: icon == null ? null : Icon(icon, size: 15, color: iconColor),
    );
  }
}

/// Botão de check-in da etapa Chegada. Bloqueado por regra (reserva sem
/// atleta, fora da janela), fica desligado e diz o porquê logo abaixo.
class _CheckInAction extends StatelessWidget {
  const _CheckInAction({
    required this.enabled,
    required this.busy,
    required this.blockReason,
    required this.onPressed,
  });

  final bool enabled;
  final bool busy;
  final String? blockReason;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final reason = blockReason;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _StepButton(
          key: const Key('arena-booking-step-checkin'),
          label: 'Fazer check-in',
          icon: Icons.how_to_reg_rounded,
          busy: busy,
          primary: true,
          onPressed: enabled ? onPressed : null,
        ),
        if (reason != null) ...[
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 1),
                child: Icon(
                  Icons.info_outline_rounded,
                  size: 15,
                  color: colors.onSurfaceMuted,
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  reason,
                  key: const Key('arena-booking-checkin-block-reason'),
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    height: 1.35,
                    color: colors.onSurfaceMuted,
                  ),
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

class _StepButton extends StatelessWidget {
  const _StepButton({
    super.key,
    required this.label,
    required this.icon,
    required this.onPressed,
    this.primary = false,
    this.busy = false,
  });

  final String label;
  final IconData icon;
  final VoidCallback? onPressed;
  final bool primary;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return FilledButton.icon(
      onPressed: onPressed,
      icon: busy
          ? const SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : Icon(icon, size: 18),
      label: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
      style: FilledButton.styleFrom(
        backgroundColor: primary ? AppColors.brand : colors.surfaceRaised,
        foregroundColor: primary ? AppColors.black : colors.onSurface,
        minimumSize: const Size(0, 44),
        padding: const EdgeInsets.symmetric(horizontal: 14),
        // textStyle sem família perde a Sora (cai na fonte do sistema).
        textStyle: const TextStyle(
          fontFamily: AppTypography.fontFamily,
          fontSize: 13,
          fontWeight: FontWeight.w700,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }
}
