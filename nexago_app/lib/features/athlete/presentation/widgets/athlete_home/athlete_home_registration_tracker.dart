import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_radii.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/ui/nexa_card.dart';
import '../../../../tournaments/domain/registration_progress_logic.dart';

/// Card de acompanhamento de inscrição em andamento (porte do tracker do
/// painel web): trilha Categoria → [Uniforme] → Dupla/Equipe → Pagamento →
/// Confirmada, com CTA pro próximo passo e cancelamento quando não há
/// pagamento.
class AthleteHomeRegistrationTracker extends StatelessWidget {
  const AthleteHomeRegistrationTracker({
    super.key,
    required this.items,
    required this.onContinue,
    required this.onCancel,
  });

  final List<RegistrationProgress> items;
  final void Function(RegistrationProgress item) onContinue;
  final void Function(RegistrationProgress item) onCancel;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();
    final colors = context.themeColors;

    return NexaCard(
      side: BorderSide(color: AppColors.brand.withValues(alpha: 0.35)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            items.length == 1
                ? 'Continue sua inscrição'
                : 'Continue suas inscrições',
            style: AppTypography.titleM.copyWith(color: colors.onSurface),
          ),
          for (final item in items) ...[
            const SizedBox(height: AppSpacing.lg),
            _TrackerBlock(
              item: item,
              onContinue: () => onContinue(item),
              onCancel: item.canCancel ? () => onCancel(item) : null,
            ),
          ],
        ],
      ),
    );
  }
}

class _TrackerBlock extends StatelessWidget {
  const _TrackerBlock({
    required this.item,
    required this.onContinue,
    this.onCancel,
  });

  final RegistrationProgress item;
  final VoidCallback onContinue;
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: colors.surfaceRaised.withValues(alpha: 0.55),
        borderRadius: AppRadii.mdAll,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${item.tournamentName} · ${item.categoryName}',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.monoMeta
                          .copyWith(color: colors.onSurfaceMuted),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      item.pendingLabel,
                      style:
                          AppTypography.titleS.copyWith(color: colors.onSurface),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.sm,
                  vertical: AppSpacing.xs,
                ),
                decoration: BoxDecoration(
                  color: AppColors.brand.withValues(alpha: 0.14),
                  borderRadius: AppRadii.pillAll,
                ),
                child: Text(
                  'PASSO ${item.currentStep}/${item.totalSteps}',
                  style: AppTypography.eyebrow.copyWith(color: AppColors.brand),
                ),
              ),
            ],
          ),
          if (item.waitlist) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              'Lista de espera',
              style: AppTypography.labelS.copyWith(color: AppColors.pending),
            ),
          ],
          const SizedBox(height: AppSpacing.md),
          for (var i = 0; i < item.steps.length; i++)
            _TrackerStepRow(
              step: item.steps[i],
              index: i,
              isLast: i == item.steps.length - 1,
            ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              Expanded(
                child: FilledButton(
                  onPressed: onContinue,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: AppColors.black,
                    minimumSize: const Size(0, 44),
                    textStyle: AppTypography.labelL,
                  ),
                  child: const Text('Continuar inscrição'),
                ),
              ),
              if (onCancel != null) ...[
                const SizedBox(width: AppSpacing.sm),
                TextButton(
                  onPressed: onCancel,
                  style: TextButton.styleFrom(
                    foregroundColor: colors.onSurfaceMuted,
                    minimumSize: const Size(0, 44),
                    textStyle: AppTypography.labelL,
                  ),
                  child: const Text('Cancelar'),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _TrackerStepRow extends StatelessWidget {
  const _TrackerStepRow({
    required this.step,
    required this.index,
    required this.isLast,
  });

  final RegistrationProgressStep step;
  final int index;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final isDone = step.state == RegistrationStepState.done;
    final isCurrent = step.state == RegistrationStepState.current;

    final bulletColor = isDone
        ? AppColors.win
        : isCurrent
            ? AppColors.brand
            : colors.surfaceRaised;
    final bulletFg = isDone || isCurrent ? AppColors.black : colors.onSurfaceMuted;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Column(
            children: [
              Container(
                width: 22,
                height: 22,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: bulletColor,
                  shape: BoxShape.circle,
                ),
                child: isDone
                    ? Icon(Icons.check_rounded, size: 14, color: bulletFg)
                    : Text(
                        '${index + 1}',
                        style: AppTypography.mono(
                          fontSize: 11,
                          color: bulletFg,
                          height: 1,
                        ),
                      ),
              ),
              if (!isLast)
                Expanded(
                  child: Container(
                    width: 2,
                    margin: const EdgeInsets.symmetric(vertical: 2),
                    color: isDone
                        ? AppColors.win.withValues(alpha: 0.45)
                        : colors.surfaceRaised,
                  ),
                ),
            ],
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : AppSpacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    step.label,
                    style: AppTypography.labelL.copyWith(
                      color:
                          isCurrent ? colors.onSurface : colors.onSurfaceMuted,
                    ),
                  ),
                  Text(
                    step.caption,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyS
                        .copyWith(color: colors.onSurfaceMuted),
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
