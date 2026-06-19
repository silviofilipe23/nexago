import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

class ArenaComandaStepper extends StatelessWidget {
  const ArenaComandaStepper({
    super.key,
    required this.currentStep,
  });

  final int currentStep;

  static const _labels = ['Origem', 'Atletas', 'Revisão'];

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 0; i < _labels.length; i++) ...[
          if (i > 0)
            Expanded(
              child: Container(
                height: 2,
                margin: const EdgeInsets.only(bottom: 18),
                color: i <= currentStep
                    ? AppColors.brand.withValues(alpha: 0.5)
                    : context.themeColors.onSurfaceMuted.withValues(alpha: 0.15),
              ),
            ),
          _StepNode(
            index: i + 1,
            label: _labels[i],
            state: i < currentStep
                ? _StepState.done
                : i == currentStep
                    ? _StepState.active
                    : _StepState.pending,
          ),
        ],
      ],
    );
  }
}

enum _StepState { done, active, pending }

class _StepNode extends StatelessWidget {
  const _StepNode({
    required this.index,
    required this.label,
    required this.state,
  });

  final int index;
  final String label;
  final _StepState state;

  @override
  Widget build(BuildContext context) {
    final isActive = state == _StepState.active;
    final isDone = state == _StepState.done;

    return Column(
      children: [
        Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: isDone || isActive
                ? AppColors.brand
                : context.themeColors.surfaceRaised,
            border: isActive
                ? Border.all(color: AppColors.brand, width: 2)
                : null,
          ),
          child: Center(
            child: isDone
                ? const Icon(Icons.check_rounded, size: 18, color: AppColors.black)
                : Text(
                    '$index',
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 13,
                      color: isActive
                          ? AppColors.black
                          : context.themeColors.onSurfaceMuted,
                    ),
                  ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          label,
          style: AppTypography.mono(
            fontSize: 10,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.4,
            color: isActive || isDone
                ? (isActive
                    ? context.themeColors.onSurface
                    : AppColors.brand)
                : context.themeColors.onSurfaceMuted,
          ),
        ),
      ],
    );
  }
}
