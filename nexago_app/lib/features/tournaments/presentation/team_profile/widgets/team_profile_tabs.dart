import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/team_profile/team_public_profile_models.dart';

class TeamProfileTabBar extends StatelessWidget {
  const TeamProfileTabBar({
    super.key,
    required this.selected,
    required this.onChanged,
  });

  final TeamProfileTab selected;
  final ValueChanged<TeamProfileTab> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
      child: Row(
        children: [
          _TabChip(
            label: 'Visão geral',
            selected: selected == TeamProfileTab.overview,
            onTap: () => onChanged(TeamProfileTab.overview),
          ),
          const SizedBox(width: 8),
          _TabChip(
            label: 'Histórico',
            selected: selected == TeamProfileTab.history,
            onTap: () => onChanged(TeamProfileTab.history),
          ),
          const SizedBox(width: 8),
          _TabChip(
            label: 'Confrontos',
            selected: selected == TeamProfileTab.headToHead,
            onTap: () => onChanged(TeamProfileTab.headToHead),
          ),
        ],
      ),
    );
  }
}

class TeamProfileOverviewTab extends StatelessWidget {
  const TeamProfileOverviewTab({
    super.key,
    required this.campaigns,
    required this.formedLabel,
  });

  final List<TeamCampaignEntry> campaigns;
  final String formedLabel;

  @override
  Widget build(BuildContext context) {
    final preview = campaigns.take(5).toList();

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (preview.isEmpty)
            Text(
              'Nenhuma campanha registrada ainda.',
              style: AppTypography.soraRegular(
                fontSize: 13,
                color: context.themeColors.onSurfaceMuted,
              ),
            )
          else
            for (var i = 0; i < preview.length; i++) ...[
              if (i > 0) const SizedBox(height: 10),
              _CampaignCard(entry: preview[i]),
            ],
          if (formedLabel.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text(
              'Dupla formada em $formedLabel',
              style: AppTypography.soraRegular(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class TeamProfileHistoryTab extends StatelessWidget {
  const TeamProfileHistoryTab({
    super.key,
    required this.campaigns,
    required this.formedLabel,
  });

  final List<TeamCampaignEntry> campaigns;
  final String formedLabel;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (campaigns.isEmpty)
            Text(
              'Histórico vazio por enquanto.',
              style: AppTypography.soraRegular(
                fontSize: 13,
                color: context.themeColors.onSurfaceMuted,
              ),
            )
          else
            for (var i = 0; i < campaigns.length; i++) ...[
              if (i > 0) const SizedBox(height: 10),
              _CampaignCard(entry: campaigns[i]),
            ],
          if (formedLabel.isNotEmpty) ...[
            const SizedBox(height: 20),
            Center(
              child: Text(
                'Dupla formada em $formedLabel',
                style: AppTypography.soraRegular(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class TeamProfileHeadToHeadTab extends StatelessWidget {
  const TeamProfileHeadToHeadTab({super.key, required this.entries});

  final List<TeamHeadToHeadEntry> entries;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (entries.isEmpty)
            Text(
              'Ainda não há confrontos registrados.',
              style: AppTypography.soraRegular(
                fontSize: 13,
                color: context.themeColors.onSurfaceMuted,
              ),
            )
          else
            for (var i = 0; i < entries.length; i++) ...[
              if (i > 0) const SizedBox(height: 10),
              _HeadToHeadCard(entry: entries[i]),
            ],
        ],
      ),
    );
  }
}

class _TabChip extends StatelessWidget {
  const _TabChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected
          ? context.themeColors.onSurface
          : context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Text(
            label,
            style: AppTypography.soraRegular(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: selected
                  ? context.themeColors.canvas
                  : context.themeColors.onSurfaceMuted,
            ),
          ),
        ),
      ),
    );
  }
}

class _CampaignCard extends StatelessWidget {
  const _CampaignCard({required this.entry});

  final TeamCampaignEntry entry;

  @override
  Widget build(BuildContext context) {
    final dateLabel = entry.playedAt == null
        ? ''
        : DateFormat('MMM yyyy', 'pt_BR').format(entry.playedAt!);
    final metaParts = <String>[
      if (dateLabel.isNotEmpty) dateLabel,
      if (entry.locationLabel.isNotEmpty) entry.locationLabel,
    ];

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.themeColors.surfaceRaised),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.tournamentName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
                if (metaParts.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    metaParts.join(' · '),
                    style: AppTypography.mono(
                      fontSize: 11,
                      color: context.themeColors.onSurfaceMuted,
                    ),
                  ),
                ],
                const SizedBox(height: 6),
                Text(
                  entry.recordLabel,
                  style: AppTypography.mono(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: entry.resultLabel == '1º'
                  ? AppColors.win.withValues(alpha: 0.15)
                  : context.themeColors.surfaceRaised,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: entry.resultLabel == '1º'
                    ? AppColors.win.withValues(alpha: 0.35)
                    : context.themeColors.surfaceSheet,
              ),
            ),
            child: Text(
              entry.resultLabel,
              style: AppTypography.mono(
                fontSize: 13,
                fontWeight: FontWeight.w800,
                color: entry.resultLabel == '1º'
                    ? AppColors.win
                    : context.themeColors.onSurface,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _HeadToHeadCard extends StatelessWidget {
  const _HeadToHeadCard({required this.entry});

  final TeamHeadToHeadEntry entry;

  @override
  Widget build(BuildContext context) {
    final last = entry.lastPlayedAt == null
        ? ''
        : DateFormat('dd/MM/yyyy', 'pt_BR').format(entry.lastPlayedAt!);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.themeColors.surfaceRaised),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.opponentLabel,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${entry.totalMatches} confrontos${last.isNotEmpty ? ' · $last' : ''}',
                  style: AppTypography.mono(
                    fontSize: 11,
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
          Text(
            entry.recordLabel,
            style: AppTypography.mono(
              fontSize: 14,
              fontWeight: FontWeight.w800,
              color: AppColors.brand,
            ),
          ),
        ],
      ),
    );
  }
}
