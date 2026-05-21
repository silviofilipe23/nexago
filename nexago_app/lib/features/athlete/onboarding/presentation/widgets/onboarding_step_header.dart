import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';

class OnboardingStepHeader extends StatelessWidget {
  const OnboardingStepHeader({
    super.key,
    required this.stepIndex,
    required this.totalSteps,
    required this.title,
    this.titleHighlight,
    this.subtitle,
  });

  final int stepIndex;
  final int totalSteps;
  final String title;
  final String? titleHighlight;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'PASSO $stepIndex DE $totalSteps',
          style: theme.textTheme.labelSmall?.copyWith(
            color: AppColors.brand,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.1,
          ),
        ),
        const SizedBox(height: 10),
        if (titleHighlight != null && title.contains(titleHighlight!))
          Text.rich(
            TextSpan(
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: AppColors.onSurface,
                letterSpacing: -0.4,
                height: 1.15,
              ),
              children: _titleSpans(title, titleHighlight!),
            ),
          )
        else
          Text(
            title,
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: AppColors.onSurface,
              letterSpacing: -0.4,
              height: 1.15,
            ),
          ),
        if (subtitle != null) ...[
          const SizedBox(height: 8),
          Text(
            subtitle!,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: AppColors.onSurfaceMuted,
              height: 1.45,
            ),
          ),
        ],
      ],
    );
  }

  List<InlineSpan> _titleSpans(String full, String highlight) {
    final i = full.indexOf(highlight);
    if (i < 0) return [TextSpan(text: full)];
    return [
      if (i > 0) TextSpan(text: full.substring(0, i)),
      TextSpan(
        text: highlight,
        style: const TextStyle(color: AppColors.brand),
      ),
      if (i + highlight.length < full.length)
        TextSpan(text: full.substring(i + highlight.length)),
    ];
  }
}
