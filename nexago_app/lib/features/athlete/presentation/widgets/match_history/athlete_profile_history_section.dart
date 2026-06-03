import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../domain/match_history/athlete_match_history_providers.dart';
import '../athlete_profile_section_header.dart';
import 'match_history_match_card.dart';

class AthleteProfileHistorySection extends ConsumerWidget {
  const AthleteProfileHistorySection({
    super.key,
    required this.onViewAll,
  });

  final VoidCallback onViewAll;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bundleAsync = ref.watch(currentAthleteMatchHistoryBundleProvider);

    return bundleAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (bundle) {
        final preview = [...bundle.matches]
          ..sort((a, b) => b.playedAt.compareTo(a.playedAt));
        final items = preview.take(3).toList();
        if (items.isEmpty) return const SizedBox.shrink();

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AthleteProfileSectionHeader(
              title: 'Histórico',
              trailing: 'VER TUDO',
              onTrailingTap: onViewAll,
              trailingBrand: true,
            ),
            const SizedBox(height: 10),
            ...items.map(
              (m) => MatchHistoryMatchCard(
                match: m,
                compact: true,
                onTap: () => context.pushNamed(
                  AppRouteNames.athleteMatchDetail,
                  pathParameters: {'matchId': m.id},
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}
