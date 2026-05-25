import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/match_history/athlete_tournament_detail_models.dart';

class TournamentDetailCampaignSection extends StatelessWidget {
  const TournamentDetailCampaignSection({
    super.key,
    required this.detail,
    required this.onMatchTap,
  });

  final AthleteTournamentDetail detail;
  final ValueChanged<AthleteTournamentCampaignMatch> onMatchTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.bolt_rounded, color: AppColors.brand, size: 18),
            const SizedBox(width: 6),
            Text(
              'SUA CAMPANHA • ${detail.campaignTag}',
              style: theme.textTheme.labelMedium?.copyWith(
                fontWeight: FontWeight.w900,
                color: AppColors.brand,
                letterSpacing: 0.4,
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        ...List.generate(detail.matches.length, (index) {
          final match = detail.matches[index];
          final isLast = index == detail.matches.length - 1;
          return _CampaignRow(
            match: match,
            isLast: isLast,
            onTap: () => onMatchTap(match),
          );
        }),
      ],
    );
  }
}

class _CampaignRow extends StatelessWidget {
  const _CampaignRow({
    required this.match,
    required this.isLast,
    required this.onTap,
  });

  final AthleteTournamentCampaignMatch match;
  final bool isLast;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = match.isWin ? AppColors.win : AppColors.live;
    final dateStr = DateFormat('dd/MM · HH:mm', 'pt_BR').format(match.playedAt);

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 28,
            child: Column(
              children: [
                _TimelineDot(
                  isFinal: match.isFinal,
                  isWin: match.isWin,
                ),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 2,
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      color: AppColors.win.withValues(alpha: 0.35),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : 12),
              child: Material(
                color: AppColors.surfaceCard,
                borderRadius: BorderRadius.circular(12),
                child: InkWell(
                  onTap: onTap,
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.surfaceRaised),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 32,
                          height: 32,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: accent.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            match.isWin ? 'V' : 'D',
                            style: theme.textTheme.labelLarge?.copyWith(
                              fontWeight: FontWeight.w900,
                              color: accent,
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                match.stageLabel,
                                style: theme.textTheme.labelSmall?.copyWith(
                                  fontWeight: FontWeight.w900,
                                  color: AppColors.brand,
                                  letterSpacing: 0.4,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                dateStr,
                                style: theme.textTheme.labelSmall?.copyWith(
                                  color: AppColors.onSurfaceMuted,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                match.opponentLabel,
                                style: theme.textTheme.titleSmall?.copyWith(
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.onSurface,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ),
                        ),
                        Text(
                          match.scoreDisplay,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w900,
                            color: AppColors.onSurface,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TimelineDot extends StatelessWidget {
  const _TimelineDot({required this.isFinal, required this.isWin});

  final bool isFinal;
  final bool isWin;

  @override
  Widget build(BuildContext context) {
    if (isFinal) {
      return Container(
        width: 22,
        height: 22,
        decoration: BoxDecoration(
          color: AppColors.pending.withValues(alpha: 0.2),
          shape: BoxShape.circle,
          border: Border.all(color: AppColors.pending),
        ),
        child: const Icon(
          Icons.emoji_events_rounded,
          size: 12,
          color: AppColors.pending,
        ),
      );
    }

    return Container(
      width: 10,
      height: 10,
      margin: const EdgeInsets.only(top: 6),
      decoration: BoxDecoration(
        color: isWin ? AppColors.win : AppColors.live,
        shape: BoxShape.circle,
      ),
    );
  }
}
