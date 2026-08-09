import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/ui/nexa_skeleton.dart';
import '../../../domain/compete_hub_providers.dart';
import 'compete_hub_section_header.dart';
import 'compete_hub_team_preview_row.dart';

class CompeteHubTeamsSection extends ConsumerWidget {
  const CompeteHubTeamsSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entriesAsync = ref.watch(competeHubTeamDiscoverPreviewProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        CompeteHubSectionHeader(
          title: 'Equipes',
          actionLabel: 'VER EQUIPES',
          onActionTap: () => context.pushNamed(AppRouteNames.teamDiscover),
        ),
        SizedBox(height: 10),
        entriesAsync.when(
          loading: () => const _TeamsLoading(),
          error: (_, __) => const _TeamsMessage(
            'Não foi possível carregar as equipes.',
          ),
          data: (entries) {
            if (entries.isEmpty) {
              return const _TeamsMessage(
                'Nenhuma equipe disponível para descobrir ainda.',
              );
            }
            return Container(
              padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 12),
              decoration: BoxDecoration(
                color: context.themeColors.surfaceCard,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: context.themeColors.surfaceRaised),
              ),
              child: Column(
                children: [
                  for (var i = 0; i < entries.length; i++) ...[
                    if (i > 0) SizedBox(height: 2),
                    CompeteHubTeamPreviewRow(
                      entry: entries[i],
                      onTap: () => context.pushNamed(
                        AppRouteNames.teamProfile,
                        pathParameters: {'teamId': entries[i].teamId},
                      ),
                    ),
                  ],
                ],
              ),
            );
          },
        ),
      ],
    );
  }
}

class _TeamsLoading extends StatelessWidget {
  const _TeamsLoading();

  static const _rowCount = 3;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 12),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.themeColors.surfaceRaised),
      ),
      child: Column(
        children: [
          for (var i = 0; i < _rowCount; i++) ...[
            if (i > 0) const SizedBox(height: 2),
            const _TeamRowSkeleton(),
          ],
        ],
      ),
    );
  }
}

class _TeamRowSkeleton extends StatelessWidget {
  const _TeamRowSkeleton();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      child: Row(
        children: [
          const NexaSkeleton.circle(size: 40),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                NexaSkeleton(width: 140, height: 14),
                SizedBox(height: 6),
                NexaSkeleton(width: 90, height: 10),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TeamsMessage extends StatelessWidget {
  const _TeamsMessage(this.message);

  final String message;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Text(
        message,
        style: TextStyle(color: context.themeColors.onSurfaceMuted),
      ),
    );
  }
}
