import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';

import '../../../data/organizer_category_ops_service.dart';
import '../../../domain/category_ops/category_ops_logic.dart';
import '../../../domain/category_ops/category_ops_models.dart';
import '../../../domain/tournament_ops/tournament_ops_providers.dart';

class OrganizerCategoryPaymentsTab extends ConsumerWidget {
  const OrganizerCategoryPaymentsTab({
    super.key,
    required this.tournamentId,
    required this.categoryId,
  });

  final String tournamentId;
  final String categoryId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final key = OrganizerCategoryKey(
      tournamentId: tournamentId,
      categoryId: categoryId,
    );
    final summary = ref.watch(organizerCategoryPaymentsProvider(key));
    final teamsAsync = ref.watch(organizerCategoryRegistrationsProvider(key));
    final service = ref.read(organizerCategoryOpsServiceProvider);

    final teams = teamsAsync.valueOrNull ?? const <OrganizerCategoryTeamRow>[];
    final pending = teams
        .where((t) => t.status == OrganizerTeamRegistrationStatus.pending)
        .toList();
    final paid = teams
        .where((t) => t.status == OrganizerTeamRegistrationStatus.confirmed)
        .toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 100),
      children: [
        _KpiCard(
          title: 'Arrecadado',
          value: formatCategoryMoneyCents(summary.collectedCents),
        ),
        const SizedBox(height: 10),
        _KpiCard(
          title: 'Repasse líquido (6%)',
          value: formatCategoryMoneyCents(summary.netTransferCents),
        ),
        const SizedBox(height: 16),
        if (pending.isNotEmpty)
          FilledButton(
            onPressed: () async {
              for (final team in pending) {
                try {
                  await service.resendRegistrationPayment(
                    registrationId: team.registrationId,
                  );
                } catch (_) {}
              }
              if (context.mounted) {
                showAppSnackBar(context, 'Cobranças reenviadas.');
              }
            },
            style: FilledButton.styleFrom(backgroundColor: AppColors.brand),
            child: Text('Cobrar todas (${pending.length})'),
          ),
        const SizedBox(height: 16),
        Text('Pendentes', style: Theme.of(context).textTheme.titleSmall),
        ...pending.map(
          (t) => ListTile(
            title: Text(t.displayName),
            trailing: TextButton(
              onPressed: () async {
                try {
                  await service.resendRegistrationPayment(
                    registrationId: t.registrationId,
                  );
                  if (context.mounted) showAppSnackBar(context, 'Cobrança enviada.');
                } catch (e) {
                  if (context.mounted) showAppSnackBar(context, '$e', isError: true);
                }
              },
              child: const Text('Cobrar'),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Text('Recebidas', style: Theme.of(context).textTheme.titleSmall),
        ...paid.map(
          (t) => ListTile(
            title: Text(t.displayName),
            trailing: Text(
              formatCategoryMoneyCents(
                t.paidAmountCents > 0
                    ? t.paidAmountCents
                    : t.expectedAmountCents,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _KpiCard extends StatelessWidget {
  const _KpiCard({required this.title, required this.value});

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
