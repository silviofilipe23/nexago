import 'package:cached_network_image/cached_network_image.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:nexago_app/core/layout/nexa_bottom_nav_bar.dart';
import 'package:nexago_app/core/layout/shell_tab_bar_collapse.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';
import 'package:nexago_app/core/ui/fade_slide_in.dart';
import '../../../core/formatting/app_currency_format.dart';

import '../../../core/auth/active_role_providers.dart';
import '../../auth/presentation/role_selection_page.dart';
import '../domain/tournament_create/tournament_create_draft.dart';
import '../domain/tournament_create/tournament_create_logic.dart';
import '../domain/tournament_create/tournament_create_providers.dart';
import '../domain/league_create/league_create_draft.dart';
import '../domain/league_create/league_create_providers.dart';
import '../domain/league_stage_create/league_stage_create_draft.dart';
import '../domain/league_stage_create/league_stage_create_providers.dart';
import 'league_create/league_create_navigation.dart';
import 'league_create/sheets/organizer_league_actions_sheet.dart';
import 'league_stage_create/league_stage_create_navigation.dart';
import 'tournament_create/tournament_create_navigation.dart';
import 'sheets/organizer_settings_sheet.dart';
import 'staff/my_staff_tournaments_section.dart';
import '../../tournaments/domain/tournament_listing_status.dart';

enum _OrganizerEventFilter { all, leagues, tournaments }

bool _isFirestoreDraft(Map<String, dynamic> data) => isFirestoreDraftData(data);

String _eventListingStatus(Map<String, dynamic> data) {
  for (final field in ['listingStatus', 'status']) {
    final raw = (data[field] as String?)?.trim();
    if (raw != null && raw.isNotEmpty) {
      return normalizeListingStatusRaw(raw);
    }
  }
  return 'draft';
}

class OrganizerHomePage extends ConsumerStatefulWidget {
  const OrganizerHomePage({super.key});

  @override
  ConsumerState<OrganizerHomePage> createState() => _OrganizerHomePageState();
}

class _OrganizerHomePageState extends ConsumerState<OrganizerHomePage> {
  _OrganizerEventFilter _filter = _OrganizerEventFilter.all;
  int _bottomNavIndex = 0;
  final _tabBarCollapse = ShellTabBarCollapseController();

  @override
  void dispose() {
    _tabBarCollapse.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(tournamentCreateWizardProvider.notifier).tryRestoreFromLocal();
      ref.read(leagueCreateWizardProvider.notifier).tryRestoreFromLocal();
      ref
          .read(leagueStageCreateWizardProvider.notifier)
          .tryRestoreAnyFromLocal();
    });
  }

  Future<void> _startCreate() async {
    final hasLocal = ref.read(hasMeaningfulLocalWizardSessionProvider);
    if (hasLocal) {
      final startFresh = await confirmStartFreshWizard(context);
      if (!mounted || startFresh == null) return;
      if (startFresh) {
        await ref
            .read(tournamentCreateWizardProvider.notifier)
            .discardSession();
      } else {
        final step = ref.read(tournamentCreateCurrentStepProvider);
        context.pushNamed(routeNameForCreateStep(step));
        return;
      }
    }
    context.pushNamed(AppRouteNames.organizerCreate);
  }

  Future<void> _continueFirestoreDraft(String tournamentId) async {
    try {
      await ref
          .read(tournamentCreateWizardProvider.notifier)
          .loadFirestoreDraft(tournamentId);
      if (!mounted) return;
      final step = ref.read(tournamentCreateCurrentStepProvider);
      context.goNamed(routeNameForCreateStep(step));
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, 'Erro ao abrir rascunho: $e', isError: true);
      }
    }
  }

  Future<void> _continueLeagueFirestoreDraft(String leagueId) async {
    try {
      await ref
          .read(leagueCreateWizardProvider.notifier)
          .loadFirestoreDraft(leagueId);
      if (!mounted) return;
      final step = ref.read(leagueCreateCurrentStepProvider);
      context.goNamed(routeNameForLeagueCreateStep(step));
    } catch (e) {
      if (mounted) {
        showAppSnackBar(context, 'Erro ao abrir rascunho: $e', isError: true);
      }
    }
  }

  List<Map<String, dynamic>> _mergeEvents(
    List<Map<String, dynamic>> tournaments,
    List<Map<String, dynamic>> leagues,
  ) {
    final merged = <Map<String, dynamic>>[
      ...tournaments.map((t) => {...t, '_kind': 'tournament'}),
      ...leagues.map((l) => {...l, '_kind': 'league'}),
    ];
    merged.sort((a, b) {
      final aTs = a['updatedAt'];
      final bTs = b['updatedAt'];
      if (aTs is Timestamp && bTs is Timestamp) {
        return bTs.compareTo(aTs);
      }
      return 0;
    });
    return merged;
  }

  List<Map<String, dynamic>> _filteredEvents(List<Map<String, dynamic>> all) {
    return switch (_filter) {
      _OrganizerEventFilter.all => all,
      _OrganizerEventFilter.leagues =>
        all.where((e) => e['_kind'] == 'league').toList(),
      _OrganizerEventFilter.tournaments =>
        all
            .where(
              (e) =>
                  e['_kind'] == 'tournament' &&
                  (e['leagueId'] as String?) == null,
            )
            .toList(),
    };
  }

  int _totalEnrolled(List<Map<String, dynamic>> tournaments) {
    return tournaments.fold<int>(
      0,
      (sum, t) => sum + ((t['enrolledCount'] as num?)?.toInt() ?? 0),
    );
  }

  int _activeCount(List<Map<String, dynamic>> tournaments) {
    return tournaments.where((t) {
      final status = (t['listingStatus'] as String?) ?? '';
      return status == 'open' || status == 'draft';
    }).length;
  }

  String _formatRevenue(int cents) {
    if (cents <= 0) return 'R\$ 0';
    final value = cents / 100;
    if (value >= 1000) {
      return 'R\$ ${NumberFormat.compact(locale: 'pt_BR').format(value)}';
    }
    return formatBRL(value);
  }

  int _tournamentCollectedCents(Map<String, dynamic> event) {
    if (event['_kind'] != 'tournament') return 0;
    return (event['collectedCents'] as num?)?.toInt() ?? 0;
  }

  int _totalCollectedCents(List<Map<String, dynamic>> tournaments) {
    return tournaments.fold<int>(
      0,
      (sum, tournament) => sum + _tournamentCollectedCents(tournament),
    );
  }

  Future<void> _discardTournamentDraft({String? remoteDraftId}) async {
    try {
      await ref
          .read(tournamentCreateWizardProvider.notifier)
          .discardSession(remoteDraftId: remoteDraftId);
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, 'Erro ao descartar rascunho: $e', isError: true);
    }
  }

  Future<void> _discardLeagueDraft({String? remoteDraftId}) async {
    try {
      await ref
          .read(leagueCreateWizardProvider.notifier)
          .discardSession(remoteDraftId: remoteDraftId);
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, 'Erro ao descartar rascunho: $e', isError: true);
    }
  }

  Future<void> _discardStageDraft() async {
    try {
      await ref.read(leagueStageCreateWizardProvider.notifier).clearSession();
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, 'Erro ao descartar rascunho: $e', isError: true);
    }
  }

  Future<void> _confirmDiscardFirestoreEvent({
    required String kind,
    required String eventId,
  }) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Descartar rascunho?'),
        content: const Text(
          'O rascunho será removido permanentemente do banco de dados.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Descartar'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    try {
      if (kind == 'league') {
        await ref
            .read(leagueCreateWizardProvider.notifier)
            .discardSession(remoteDraftId: eventId);
      } else {
        await ref
            .read(tournamentCreateWizardProvider.notifier)
            .discardSession(remoteDraftId: eventId);
      }
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, 'Erro ao descartar rascunho: $e', isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // Folga inferior da lista = barra flutuante + inset da home indicator, para
    // o último card não ficar cortado atrás da bottom nav (que sobrepõe o
    // conteúdo via extendBody).
    final bottomNavClearance =
        nexaBottomNavBarHeight() + MediaQuery.viewPaddingOf(context).bottom + 8;
    final canSwitch = ref.watch(hasMultipleMobileRolesProvider);
    final tournamentsAsync = ref.watch(managedOrganizerTournamentsProvider);
    final leaguesAsync = ref.watch(managedOrganizerLeaguesProvider);
    final hasLocalTournamentDraft = ref.watch(
      hasMeaningfulLocalWizardSessionProvider,
    );
    final hasLocalLeagueDraft = ref.watch(
      hasMeaningfulLocalLeagueWizardSessionProvider,
    );
    final localTournamentDraft = ref.watch(tournamentCreateDraftProvider);
    final localTournamentStep = ref.watch(tournamentCreateCurrentStepProvider);
    final localLeagueDraft = ref.watch(leagueCreateDraftProvider);
    final localLeagueStep = ref.watch(leagueCreateCurrentStepProvider);
    final hasLocalStageDraft = ref.watch(
      hasMeaningfulLocalStageWizardSessionProvider,
    );
    final localStageDraft = ref.watch(leagueStageCreateDraftProvider);
    final localStageStep = ref.watch(leagueStageCreateCurrentStepProvider);

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      extendBody: true,
      body: ShellTabBarCollapseListener(
        controller: _tabBarCollapse,
        child: SafeArea(
          bottom: false,
          child: FadeSlideIn(
            child: tournamentsAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('Erro: $e')),
              data: (tournaments) => leaguesAsync.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(child: Text('Erro: $e')),
                data: (leagues) {
                  final allEvents = _mergeEvents(tournaments, leagues);
                  final filtered = _filteredEvents(allEvents);
                  final activeCount = _activeCount(allEvents);
                  final totalEnrolled = _totalEnrolled(tournaments);
                  final totalRevenue = _totalCollectedCents(tournaments);

                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(
                        child: ListView(
                          padding: EdgeInsets.fromLTRB(
                            20,
                            12,
                            20,
                            bottomNavClearance,
                          ),
                          children: [
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        'MODO ORGANIZADOR',
                                        style: AppTypography.mono(
                                          color: AppColors.brand,
                                          fontWeight: FontWeight.w700,
                                          letterSpacing: 0.8,
                                          fontSize: 11,
                                        ),
                                      ),
                                      const SizedBox(height: 8),
                                      Text(
                                        'Seus eventos',
                                        style: theme.textTheme.headlineMedium
                                            ?.copyWith(
                                              fontWeight: FontWeight.w800,
                                              letterSpacing: -0.5,
                                            ),
                                      ),
                                    ],
                                  ),
                                ),
                                Material(
                                  color: context.themeColors.surfaceRaised,
                                  borderRadius: BorderRadius.circular(12),
                                  clipBehavior: Clip.antiAlias,
                                  child: InkWell(
                                    onTap: () => showOrganizerSettingsSheet(
                                      context,
                                      ref,
                                    ),
                                    child: const SizedBox(
                                      width: 44,
                                      height: 44,
                                      child: Icon(
                                        Icons.settings_outlined,
                                        size: 22,
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            // if (canSwitch) ...[
                            //   const SizedBox(height: 20),
                            //   _RoleSwitchBanner(
                            //     onTap: () =>
                            //         navigateToRoleSelection(context, ref),
                            //   ),
                            // ],
                            const SizedBox(height: 24),
                            if (hasLocalTournamentDraft) ...[
                              _LocalDraftBanner(
                                label: 'Torneio em andamento',
                                name: localTournamentDraft.name.trim(),
                                stepLabel:
                                    'passo ${localTournamentStep.number}/${TournamentCreateStepX.total}',
                                onContinue: () => context.pushNamed(
                                  routeNameForCreateStep(localTournamentStep),
                                ),
                                onDiscard: () => _discardTournamentDraft(
                                  remoteDraftId:
                                      localTournamentDraft.tournamentId,
                                ),
                              ),
                              const SizedBox(height: 20),
                            ],
                            if (hasLocalLeagueDraft) ...[
                              _LocalDraftBanner(
                                label: 'Liga em andamento',
                                name: localLeagueDraft.name.trim(),
                                stepLabel:
                                    'passo ${localLeagueStep.number}/${LeagueCreateStepX.total}',
                                onContinue: () => context.pushNamed(
                                  routeNameForLeagueCreateStep(localLeagueStep),
                                ),
                                onDiscard: () => _discardLeagueDraft(
                                  remoteDraftId: localLeagueDraft.leagueId,
                                ),
                              ),
                              const SizedBox(height: 20),
                            ],
                            if (hasLocalStageDraft &&
                                localStageDraft.leagueId.isNotEmpty) ...[
                              _LocalDraftBanner(
                                label: 'Etapa em andamento',
                                name:
                                    localStageDraft.stage.name.trim().isNotEmpty
                                    ? '${localStageDraft.leagueName} · ${localStageDraft.stage.name}'
                                    : localStageDraft.leagueName,
                                stepLabel:
                                    'passo ${localStageStep.number}/${LeagueStageCreateStepX.total}',
                                onContinue: () => context.pushNamed(
                                  routeNameForLeagueStageCreateStep(
                                    localStageStep,
                                  ),
                                  pathParameters: {
                                    'leagueId': localStageDraft.leagueId,
                                  },
                                ),
                                onDiscard: _discardStageDraft,
                              ),
                              const SizedBox(height: 20),
                            ],
                            Row(
                              children: [
                                Expanded(
                                  child: _KpiCard(
                                    icon: Icons.emoji_events_outlined,
                                    value: '$activeCount',
                                    label: 'Eventos ativos',
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: _KpiCard(
                                    icon: Icons.person_add_alt_1_outlined,
                                    value: '$totalEnrolled',
                                    label: 'Inscritos no total',
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: _KpiCard(
                                    icon: Icons.account_balance_wallet_outlined,
                                    value: _formatRevenue(totalRevenue),
                                    label: 'Arrecadado',
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 24),
                            _FilterTabs(
                              selected: _filter,
                              onChanged: (value) =>
                                  setState(() => _filter = value),
                            ),
                            const SizedBox(height: 20),
                            if (filtered.isEmpty)
                              Container(
                                padding: const EdgeInsets.all(24),
                                decoration: BoxDecoration(
                                  color: context.themeColors.surfaceCard,
                                  borderRadius: BorderRadius.circular(16),
                                  border: Border.all(
                                    color: context.themeColors.onSurfaceMuted
                                        .withValues(alpha: 0.12),
                                  ),
                                ),
                                child: Text(
                                  _filter == _OrganizerEventFilter.leagues
                                      ? 'Nenhuma liga ainda. Crie um circuito para começar.'
                                      : 'Nenhum evento ainda. Toque em criar evento para começar.',
                                  textAlign: TextAlign.center,
                                  style: theme.textTheme.bodyMedium?.copyWith(
                                    color: context.themeColors.onSurfaceMuted,
                                    height: 1.45,
                                  ),
                                ),
                              )
                            else
                              for (final event in filtered) ...[
                                _OrganizerEventCard(
                                  data: event,
                                  revenueLabel: _formatRevenue(
                                    _tournamentCollectedCents(event),
                                  ),
                                  onAddStage:
                                      event['_kind'] == 'league' &&
                                          (event['listingStatus'] as String?) ==
                                              'open'
                                      ? () {
                                          final id = (event['id'] as String?)
                                              ?.trim();
                                          if (id == null || id.isEmpty) return;
                                          startLeagueStageWizard(
                                            context,
                                            ref,
                                            id,
                                          );
                                        }
                                      : null,
                                  onOpen: () {
                                    final id = (event['id'] as String?)?.trim();
                                    if (id == null || id.isEmpty) return;
                                    final isLeagueDoc =
                                        event['_kind'] == 'league';
                                    if (_isFirestoreDraft(event)) {
                                      if (isLeagueDoc) {
                                        _continueLeagueFirestoreDraft(id);
                                      } else {
                                        _continueFirestoreDraft(id);
                                      }
                                      return;
                                    }
                                    if (isLeagueDoc) {
                                      context.pushNamed(
                                        AppRouteNames.leagueDetail,
                                        pathParameters: {'leagueId': id},
                                      );
                                      return;
                                    }
                                    context.pushNamed(
                                      AppRouteNames.organizerTournamentDetail,
                                      pathParameters: {'tournamentId': id},
                                    );
                                  },
                                  onDiscardDraft: _isFirestoreDraft(event)
                                      ? () {
                                          final id = (event['id'] as String?)
                                              ?.trim();
                                          if (id == null || id.isEmpty) return;
                                          _confirmDiscardFirestoreEvent(
                                            kind:
                                                (event['_kind'] as String?) ??
                                                'tournament',
                                            eventId: id,
                                          );
                                        }
                                      : null,
                                  onOpenDetail: () {
                                    final id = (event['id'] as String?)?.trim();
                                    if (id == null || id.isEmpty) return;
                                    if (event['_kind'] == 'league') {
                                      showOrganizerLeagueActionsSheet(
                                        context,
                                        leagueId: id,
                                        league: event,
                                      );
                                      return;
                                    }
                                    context.pushNamed(
                                      AppRouteNames.organizerTournamentDetail,
                                      pathParameters: {'tournamentId': id},
                                    );
                                  },
                                ),
                                const SizedBox(height: 14),
                              ],
                            const MyStaffTournamentsSection(
                              horizontalPadding: 0,
                            ),
                          ],
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),
          ),
        ),
      ),
      bottomNavigationBar: ListenableBuilder(
        listenable: _tabBarCollapse,
        builder: (context, _) => NexaBottomNavBar(
          collapseProgress: _tabBarCollapse.progress,
          currentIndex: _bottomNavIndex,
          onTap: (index) {
            if (index == 1) {
              showOrganizerSettingsSheet(context, ref);
              return;
            }
            setState(() => _bottomNavIndex = index);
          },
          centerAction: NexaBottomNavAction(
            label: 'Criar',
            icon: Icons.add_rounded,
            sfSymbol: 'plus',
            onPressed: _startCreate,
          ),
          items: const [
            NexaBottomNavItem(
              label: 'Eventos',
              icon: Icons.emoji_events_outlined,
              selectedIcon: Icons.emoji_events,
              sfSymbol: 'trophy',
              selectedSfSymbol: 'trophy.fill',
            ),
            NexaBottomNavItem(
              label: 'Ajustes',
              icon: Icons.settings_outlined,
              selectedIcon: Icons.settings_rounded,
              sfSymbol: 'gearshape',
              selectedSfSymbol: 'gearshape.fill',
            ),
          ],
        ),
      ),
    );
  }
}

class _RoleSwitchBanner extends StatelessWidget {
  const _RoleSwitchBanner({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: AppColors.brand.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.swap_horiz_rounded,
                  color: AppColors.brand,
                  size: 22,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Trocar papel',
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Entrar como atleta ou gestor de arena',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
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
  }
}

class _LocalDraftBanner extends StatelessWidget {
  const _LocalDraftBanner({
    required this.label,
    required this.name,
    required this.stepLabel,
    required this.onContinue,
    required this.onDiscard,
  });

  final String label;
  final String name;
  final String stepLabel;
  final VoidCallback onContinue;
  final VoidCallback onDiscard;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            label,
            style: AppTypography.mono(
              color: AppColors.brand,
              fontWeight: FontWeight.w800,
              fontSize: 10,
              letterSpacing: 0.6,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            '$name · $stepLabel',
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: FilledButton(
                  onPressed: onContinue,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: AppColors.black,
                  ),
                  child: const Text(
                    'Continuar',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              TextButton(onPressed: onDiscard, child: const Text('Descartar')),
            ],
          ),
        ],
      ),
    );
  }
}

class _KpiCard extends StatelessWidget {
  const _KpiCard({
    required this.icon,
    required this.value,
    required this.label,
  });

  final IconData icon;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: context.themeColors.onSurfaceMuted),
          const SizedBox(height: 10),
          Text(
            value,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: -0.3,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: context.themeColors.onSurfaceMuted,
              fontWeight: FontWeight.w600,
              height: 1.2,
            ),
          ),
        ],
      ),
    );
  }
}

class _FilterTabs extends StatelessWidget {
  const _FilterTabs({required this.selected, required this.onChanged});

  final _OrganizerEventFilter selected;
  final ValueChanged<_OrganizerEventFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          _FilterTab(
            label: 'Tudo',
            selected: selected == _OrganizerEventFilter.all,
            onTap: () => onChanged(_OrganizerEventFilter.all),
          ),
          _FilterTab(
            label: 'Ligas',
            selected: selected == _OrganizerEventFilter.leagues,
            onTap: () => onChanged(_OrganizerEventFilter.leagues),
          ),
          _FilterTab(
            label: 'Torneios',
            selected: selected == _OrganizerEventFilter.tournaments,
            onTap: () => onChanged(_OrganizerEventFilter.tournaments),
          ),
        ],
      ),
    );
  }
}

class _FilterTab extends StatelessWidget {
  const _FilterTab({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Material(
        color: selected ? AppColors.brand : Colors.transparent,
        borderRadius: BorderRadius.circular(10),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Text(
              label,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                fontWeight: FontWeight.w800,
                color: selected
                    ? AppColors.black
                    : context.themeColors.onSurfaceMuted,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _OrganizerEventCard extends StatelessWidget {
  const _OrganizerEventCard({
    required this.data,
    required this.revenueLabel,
    required this.onOpen,
    required this.onOpenDetail,
    this.onAddStage,
    this.onDiscardDraft,
  });

  final Map<String, dynamic> data;
  final String revenueLabel;
  final VoidCallback onOpen;
  final VoidCallback onOpenDetail;
  final VoidCallback? onAddStage;
  final VoidCallback? onDiscardDraft;

  static const _heroHeight = 132.0;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final name = (data['name'] as String?) ?? 'Evento';
    final locationName =
        (data['locationName'] as String?) ??
        (data['location'] as String?) ??
        '';
    final status = _eventListingStatus(data);
    final isDraft = _isFirestoreDraft(data);
    final enrolled = (data['enrolledCount'] as num?)?.toInt() ?? 0;
    final capacity = _capacity(data);
    final isLeagueDoc = data['_kind'] == 'league';
    final isLeague = isLeagueDoc || data['leagueId'] != null;
    final dateLabel =
        (data['dateLabel'] as String?) ??
        (data['seasonLabel'] as String?) ??
        '';
    final plannedStages = isLeagueDoc
        ? ((data['plannedStagesCount'] as num?)?.toInt() ??
              ((data['stages'] is List)
                  ? (data['stages'] as List).length
                  : null))
        : (data['leagueStageOrder'] as num?)?.toInt();
    final imageUrl = _imageUrl(data);
    final isLive =
        status == 'open' && _isEventSoon(data['startAt'], data['endAt']);
    final fillRatio = capacity > 0 ? enrolled / capacity : 0.0;

    return Container(
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            height: _heroHeight,
            child: Stack(
              fit: StackFit.expand,
              children: [
                _EventCoverImage(imageUrl: imageUrl, isLeague: isLeague),
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: 64,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.transparent,
                          AppColors.black.withValues(alpha: 0.72),
                        ],
                      ),
                    ),
                  ),
                ),
                Positioned(
                  top: 12,
                  left: 12,
                  child: _HeroBadge(label: isLeague ? 'LIGA' : 'TORNEIO'),
                ),
                Positioned(
                  top: 12,
                  right: 12,
                  child: _statusBadge(isLive: isLive, status: status),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  name,
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.3,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  _subtitle(
                    isLeague: isLeague,
                    isLeagueDoc: isLeagueDoc,
                    locationName: isLeagueDoc
                        ? ((data['city'] as String?) ?? '')
                        : locationName,
                    dateLabel: dateLabel,
                    stageOrder: plannedStages,
                  ),
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 14),
                Divider(
                  height: 1,
                  color: context.themeColors.onSurfaceMuted.withValues(
                    alpha: 0.12,
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    // _Metric(
                    //   label: capacity > 0 ? '$enrolled/$capacity' : '$enrolled',
                    //   caption: 'Inscritos',
                    // // ),
                    // const Spacer(),
                    _Metric(
                      label: revenueLabel,
                      caption: 'Arrecadado',
                      valueColor: AppColors.win,
                    ),
                  ],
                ),
                // if (capacity > 0 && !isDraft) ...[
                //   const SizedBox(height: 12),
                //   ClipRRect(
                //     borderRadius: BorderRadius.circular(4),
                //     child: LinearProgressIndicator(
                //       value: fillRatio.clamp(0.0, 1.0),
                //       minHeight: 6,
                //       backgroundColor: context.themeColors.onSurfaceMuted
                //           .withValues(alpha: 0.15),
                //       color: AppColors.brand,
                //     ),
                //   ),
                // ],
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: isDraft
                          ? FilledButton(
                              onPressed: onOpen,
                              style: FilledButton.styleFrom(
                                backgroundColor: AppColors.brand,
                                foregroundColor: AppColors.black,
                                padding: const EdgeInsets.symmetric(
                                  vertical: 14,
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                              ),
                              child: const Text(
                                'Continuar rascunho',
                                style: TextStyle(fontWeight: FontWeight.w800),
                              ),
                            )
                          : OutlinedButton(
                              onPressed: onOpen,
                              style: OutlinedButton.styleFrom(
                                foregroundColor: context.themeColors.onSurface,
                                side: BorderSide(
                                  color: context.themeColors.onSurfaceMuted
                                      .withValues(alpha: 0.25),
                                ),
                                padding: const EdgeInsets.symmetric(
                                  vertical: 14,
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                              ),
                              child: Text(
                                isLeagueDoc
                                    ? 'Ver circuito'
                                    : 'Gerenciar inscrições',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ),
                    ),
                    const SizedBox(width: 10),
                    Material(
                      color: context.themeColors.surfaceRaised,
                      borderRadius: BorderRadius.circular(12),
                      clipBehavior: Clip.antiAlias,
                      child: InkWell(
                        onTap: onOpenDetail,
                        child: const SizedBox(
                          width: 48,
                          height: 48,
                          child: Icon(Icons.more_horiz_rounded),
                        ),
                      ),
                    ),
                  ],
                ),
                if (isDraft && onDiscardDraft != null) ...[
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: TextButton(
                      onPressed: onDiscardDraft,
                      child: const Text('Descartar rascunho'),
                    ),
                  ),
                ],
                if (onAddStage != null) ...[
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: TextButton.icon(
                      onPressed: onAddStage,
                      icon: const Icon(Icons.add_circle_outline, size: 18),
                      label: const Text(
                        'Adicionar etapa',
                        style: TextStyle(fontWeight: FontWeight.w800),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  String? _imageUrl(Map<String, dynamic> data) {
    final cover = (data['coverUrl'] as String?)?.trim();
    if (cover != null && cover.isNotEmpty) return cover;
    final image = (data['imageUrl'] as String?)?.trim();
    if (image != null && image.isNotEmpty) return image;
    return null;
  }

  int _capacity(Map<String, dynamic> data) {
    final capacity = (data['capacity'] as num?)?.toInt();
    if (capacity != null && capacity > 0) return capacity;

    final categories = data['categories'];
    if (categories is List && categories.isNotEmpty) {
      return categories.fold<int>(0, (sum, item) {
        if (item is! Map) return sum;
        final spots =
            (item['maxTeams'] as num?)?.toInt() ??
            (item['spotsTotal'] as num?)?.toInt() ??
            0;
        return sum + spots;
      });
    }
    return 0;
  }

  String _subtitle({
    required bool isLeague,
    required bool isLeagueDoc,
    required String locationName,
    required String dateLabel,
    int? stageOrder,
  }) {
    final typeLabel = isLeagueDoc || isLeague ? 'Liga' : 'Torneio';
    final stageLabel = stageOrder != null && stageOrder > 0
        ? '$stageOrder etapa${stageOrder == 1 ? '' : 's'}'
        : '1 etapa';
    final parts = <String>[
      typeLabel,
      stageLabel,
      if (locationName.isNotEmpty) locationName,
      if (dateLabel.isNotEmpty) dateLabel,
    ];
    return parts.join(' · ');
  }

  Widget _statusBadge({required bool isLive, required String status}) {
    if (isLive) return const _LiveBadge(label: 'Inscrições abertas');
    if (status == 'draft' || status == 'rascunho')
      return const _HeroBadge(label: 'Rascunho', muted: true);
    if (status == 'open') return const _LiveBadge(label: 'Publicado');
    if (status == 'closed') {
      return const _HeroBadge(label: 'Encerrada', muted: true);
    }
    if (status == 'cancelled') {
      return const _HeroBadge(label: 'Cancelada', muted: true);
    }
    return const SizedBox.shrink();
  }

  bool _isEventSoon(dynamic startAt, dynamic endAt) {
    final start = _toDate(startAt);
    if (start == null) return false;
    final now = DateTime.now();
    final end = _toDate(endAt) ?? start;
    return !end.isBefore(now) && start.difference(now).inDays <= 14;
  }

  DateTime? _toDate(dynamic value) {
    if (value is Timestamp) return value.toDate();
    if (value is DateTime) return value;
    return null;
  }
}

class _EventCoverImage extends StatelessWidget {
  const _EventCoverImage({required this.imageUrl, required this.isLeague});

  final String? imageUrl;
  final bool isLeague;

  @override
  Widget build(BuildContext context) {
    if (imageUrl != null) {
      return CachedNetworkImage(
        imageUrl: imageUrl!,
        fit: BoxFit.cover,
        fadeInDuration: const Duration(milliseconds: 220),
        placeholder: (_, __) => _EventCoverPlaceholder(isLeague: isLeague),
        errorWidget: (_, __, ___) => _EventCoverPlaceholder(isLeague: isLeague),
      );
    }
    return _EventCoverPlaceholder(isLeague: isLeague);
  }
}

class _EventCoverPlaceholder extends StatelessWidget {
  const _EventCoverPlaceholder({required this.isLeague});

  final bool isLeague;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: isLeague
              ? [
                  const Color(0xFF9333EA).withValues(alpha: 0.35),
                  context.themeColors.surfaceCard,
                ]
              : [
                  AppColors.brand.withValues(alpha: 0.28),
                  context.themeColors.surfaceRaised,
                ],
        ),
      ),
      child: Center(
        child: Icon(
          Icons.sports_volleyball_rounded,
          size: 44,
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.35),
        ),
      ),
    );
  }
}

class _HeroBadge extends StatelessWidget {
  const _HeroBadge({required this.label, this.muted = false});

  final String label;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: muted
            ? AppColors.black.withValues(alpha: 0.55)
            : AppColors.black.withValues(alpha: 0.72),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: muted
              ? context.themeColors.onSurfaceMuted.withValues(alpha: 0.35)
              : context.themeColors.onSurface.withValues(alpha: 0.12),
        ),
      ),
      child: Text(
        label,
        style: AppTypography.mono(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.6,
          color: muted
              ? context.themeColors.onSurfaceMuted
              : context.themeColors.onSurface,
        ),
      ),
    );
  }
}

class _LiveBadge extends StatelessWidget {
  const _LiveBadge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: AppColors.black.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.live.withValues(alpha: 0.45)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: const BoxDecoration(
              color: AppColors.live,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: AppColors.live,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.caption, this.valueColor});

  final String label;
  final String caption;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w800,
            color: valueColor,
          ),
        ),
        Text(
          caption,
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}
