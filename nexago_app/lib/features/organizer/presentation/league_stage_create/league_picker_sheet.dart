import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../domain/league_create/league_create_providers.dart';
import 'league_stage_create_navigation.dart';

Future<void> showLeaguePickerSheet(
  BuildContext context,
  WidgetRef ref,
) async {
  final leagues = await ref.read(managedOrganizerLeaguesProvider.future);
  final published = leagues
      .where((league) => (league['listingStatus'] as String?) == 'open')
      .toList();

  if (!context.mounted) return;

  if (published.isEmpty) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Nenhuma liga publicada encontrada. Publique um circuito primeiro.',
        ),
      ),
    );
    return;
  }

  final parentContext = context;

  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.themeColors.surfaceCard,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (context) {
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: context.themeColors.onSurfaceMuted
                        .withValues(alpha: 0.3),
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'Escolha a liga',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
              ),
              const SizedBox(height: 6),
              Text(
                'Só circuitos publicados aparecem aqui.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: context.themeColors.onSurfaceMuted,
                    ),
              ),
              const SizedBox(height: 16),
              Flexible(
                child: ListView.separated(
                  shrinkWrap: true,
                  itemCount: published.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final league = published[index];
                    final id = (league['id'] as String?) ?? '';
                    final name = (league['name'] as String?) ?? 'Liga';
                    final city = (league['city'] as String?) ?? '';
                    final stagesCount =
                        (league['plannedStagesCount'] as num?)?.toInt();

                    return Material(
                      color: context.themeColors.surfaceRaised,
                      borderRadius: BorderRadius.circular(14),
                      clipBehavior: Clip.antiAlias,
                      child: InkWell(
                        onTap: () async {
                          Navigator.of(context).pop();
                          await startLeagueStageWizard(parentContext, ref, id);
                        },
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Row(
                            children: [
                              Container(
                                width: 40,
                                height: 40,
                                decoration: BoxDecoration(
                                  color: AppColors.brand.withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Icon(
                                  Icons.emoji_events_outlined,
                                  color: AppColors.brand,
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      name,
                                      style: Theme.of(context)
                                          .textTheme
                                          .titleSmall
                                          ?.copyWith(
                                            fontWeight: FontWeight.w800,
                                          ),
                                    ),
                                    if (city.isNotEmpty || stagesCount != null)
                                      Text(
                                        [
                                          if (city.isNotEmpty) city,
                                          if (stagesCount != null)
                                            '$stagesCount etapas',
                                        ].join(' · '),
                                        style: Theme.of(context)
                                            .textTheme
                                            .bodySmall
                                            ?.copyWith(
                                              color: context
                                                  .themeColors.onSurfaceMuted,
                                            ),
                                      ),
                                  ],
                                ),
                              ),
                              Icon(
                                Icons.chevron_right_rounded,
                                color: context.themeColors.onSurfaceMuted,
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      );
    },
  );
}
