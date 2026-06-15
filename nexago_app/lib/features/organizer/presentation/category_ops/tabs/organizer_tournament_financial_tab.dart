import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../domain/tournament_ops/tournament_ops_logic.dart';
import '../../../domain/tournament_ops/tournament_ops_models.dart';

class OrganizerTournamentFinancialTab extends StatelessWidget {
  const OrganizerTournamentFinancialTab({
    super.key,
    required this.summary,
    required this.categories,
  });

  final OrganizerTournamentSummary summary;
  final List<OrganizerTournamentCategorySummary> categories;

  @override
  Widget build(BuildContext context) {
    final net = netTransferCents(summary.collectedCents);
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        _MoneyCard(
          title: 'Arrecadado total',
          value: formatOrganizerMoneyCents(summary.collectedCents),
        ),
        const SizedBox(height: 12),
        _MoneyCard(
          title: 'Repasse líquido (6%)',
          value: formatOrganizerMoneyCents(net),
        ),
        const SizedBox(height: 20),
        Text(
          'Por categoria',
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
        ),
        const SizedBox(height: 8),
        ...categories.map(
          (c) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              tileColor: context.themeColors.surfaceCard,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              title: Text(c.name),
              subtitle: Text(
                '${c.paidCount} pagas · ${c.pendingCount} pend.',
              ),
              trailing: Text(
                formatOrganizerMoneyCents(c.collectedCents),
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _MoneyCard extends StatelessWidget {
  const _MoneyCard({required this.title, required this.value});

  final String title;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.labelSmall),
          const SizedBox(height: 4),
          Text(
            value,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
          ),
        ],
      ),
    );
  }
}
