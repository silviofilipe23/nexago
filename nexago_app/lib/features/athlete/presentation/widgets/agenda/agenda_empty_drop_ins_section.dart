import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/agenda/athlete_agenda_logic.dart';
import '../../../domain/agenda/athlete_agenda_models.dart';

class AgendaEmptyDropInsSection extends StatelessWidget {
  const AgendaEmptyDropInsSection({
    super.key,
    required this.sectionTitle,
    required this.dropIns,
    required this.onJoinTap,
  });

  final String sectionTitle;
  final List<AgendaDropInPreview> dropIns;
  final ValueChanged<AgendaDropInPreview> onJoinTap;

  @override
  Widget build(BuildContext context) {
    if (dropIns.isEmpty) return const SizedBox.shrink();

    final needingPlayers = countDropInsNeedingPlayers(dropIns);
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                sectionTitle,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                  letterSpacing: -0.2,
                ),
              ),
            ),
            if (needingPlayers > 0)
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: AppColors.win.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: AppColors.win.withValues(alpha: 0.35),
                  ),
                ),
                child: Text(
                  '• $needingPlayers PRECISAM DE +1',
                  style: AppTypography.mono(
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    color: AppColors.win,
                    letterSpacing: 0.3,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 14),
        for (var i = 0; i < dropIns.length; i++) ...[
          if (i > 0) const SizedBox(height: 10),
          _DropInCard(
            dropIn: dropIns[i],
            onJoinTap: () => onJoinTap(dropIns[i]),
          ),
        ],
      ],
    );
  }
}

class _DropInCard extends StatelessWidget {
  const _DropInCard({
    required this.dropIn,
    required this.onJoinTap,
  });

  final AgendaDropInPreview dropIn;
  final VoidCallback onJoinTap;

  static const _avatarColors = [
    Color(0xFF6B7280),
    Color(0xFF9CA3AF),
    Color(0xFFD1D5DB),
    Color(0xFF4B5563),
    Color(0xFF374151),
  ];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onJoinTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: context.themeColors.surfaceRaised),
          ),
          child: Row(
            children: [
              SizedBox(
                width: 52,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      dropIn.timeLabel,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: AppColors.brand,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      dropIn.kmLabel,
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      dropIn.arenaLine,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: context.themeColors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        SizedBox(
                          width: dropIn.avatarCount * 14.0 + 8,
                          height: 22,
                          child: Stack(
                            children: [
                              for (var i = 0; i < dropIn.avatarCount; i++)
                                Positioned(
                                  left: i * 14.0,
                                  child: Container(
                                    width: 22,
                                    height: 22,
                                    decoration: BoxDecoration(
                                      color: _avatarColors[
                                          i % _avatarColors.length],
                                      shape: BoxShape.circle,
                                      border: Border.all(
                                        color: context.themeColors.surfaceCard,
                                        width: 2,
                                      ),
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text.rich(
                          TextSpan(
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: context.themeColors.onSurfaceMuted,
                            ),
                            children: [
                              const TextSpan(text: 'faltam '),
                              TextSpan(
                                text: '${dropIn.spotsNeeded}',
                                style: TextStyle(
                                  color: AppColors.brand,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              FilledButton(
                onPressed: onJoinTap,
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brand,
                  foregroundColor: AppColors.black,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(999),
                  ),
                  textStyle: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 12,
                  ),
                ),
                child: const Text('Entrar'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
