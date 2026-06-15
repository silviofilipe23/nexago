import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';
import 'package:share_plus/share_plus.dart';

import '../../domain/tournament_ops/tournament_ops_logic.dart';
import '../../domain/tournament_ops/tournament_ops_models.dart';
import '../../domain/tournament_ops/tournament_ops_providers.dart';
import 'sheets/organizer_tournament_actions_sheet.dart';
import 'tabs/organizer_tournament_categories_tab.dart';
import 'tabs/organizer_tournament_financial_tab.dart';
import 'tabs/organizer_tournament_overview_tab.dart';
import 'widgets/organizer_tournament_header.dart';

class OrganizerTournamentDetailPage extends ConsumerWidget {
  const OrganizerTournamentDetailPage({
    super.key,
    required this.tournamentId,
  });

  final String tournamentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detailAsync = ref.watch(organizerTournamentDetailProvider(tournamentId));

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: AppBar(
        backgroundColor: context.themeColors.canvas,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.pop(),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.more_vert_rounded),
            onPressed: detailAsync.valueOrNull?.tournament == null
                ? null
                : () => showOrganizerTournamentActionsSheet(
                      context,
                      tournamentId: tournamentId,
                      tournament: detailAsync.value!.tournament!,
                      summary: detailAsync.value!.summary,
                    ),
          ),
        ],
      ),
      body: detailAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Erro: $e')),
        data: (state) {
          if (state.summary == null || state.tournament == null) {
            return const Center(child: Text('Torneio não encontrado'));
          }
          final summary = state.summary!;
          final tournament = state.tournament!;
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: OrganizerTournamentHeader(summary: summary),
              ),
              const SizedBox(height: 16),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: OrganizerTournamentKpiRow(summary: summary),
              ),
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => Share.share(
                          'Inscreva-se: ${organizerTournamentRegistrationShareLink(tournamentId)}',
                        ),
                        icon: const Icon(Icons.share_rounded, size: 18),
                        label: const Text('Compartilhar'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: () => showAppSnackBar(
                          context,
                          'Check-in em breve.',
                        ),
                        icon: const Icon(Icons.qr_code_scanner_rounded, size: 18),
                        label: const Text('Check-in'),
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.brand,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              Expanded(
                child: DefaultTabController(
                  length: OrganizerTournamentDetailTab.values.length,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      TabBar(
                        labelColor: AppColors.brand,
                        unselectedLabelColor: context.themeColors.onSurfaceMuted,
                        indicatorColor: AppColors.brand,
                        tabs: const [
                          Tab(text: 'Categorias'),
                          Tab(text: 'Visão geral'),
                          Tab(text: 'Financeiro'),
                        ],
                      ),
                      Expanded(
                        child: TabBarView(
                          children: [
                            OrganizerTournamentCategoriesTab(
                              categories: state.categories,
                              tournamentId: tournamentId,
                            ),
                            OrganizerTournamentOverviewTab(
                              summary: summary,
                              tournament: tournament,
                            ),
                            OrganizerTournamentFinancialTab(
                              summary: summary,
                              categories: state.categories,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: FilledButton(
            onPressed: () async {
              final link =
                  organizerTournamentRegistrationShareLink(tournamentId);
              await Share.share('Inscreva-se no torneio: $link');
            },
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              minimumSize: const Size.fromHeight(48),
            ),
            child: const Text('Compartilhar link de inscrição'),
          ),
        ),
      ),
    );
  }
}
