import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/app_snackbar.dart';
import 'package:nexago_app/core/ui/app_status_views.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/observability/analytics_service.dart';
import '../../../core/router/routes.dart';
import '../domain/friendly_match_models.dart';
import '../domain/friendly_match_providers.dart';
import 'widgets/friendly_match_card.dart';
import 'widgets/friendly_match_hub_tabs.dart';

/// Hub de convites: Recebidos / Enviados / Jogos / Histórico.
class FriendlyMatchHubPage extends ConsumerStatefulWidget {
  const FriendlyMatchHubPage({super.key});

  @override
  ConsumerState<FriendlyMatchHubPage> createState() =>
      _FriendlyMatchHubPageState();
}

class _FriendlyMatchHubPageState extends ConsumerState<FriendlyMatchHubPage>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  String? _busyMatchId;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _tabController.addListener(_onTabChanged);
  }

  void _onTabChanged() {
    if (!_tabController.indexIsChanging) {
      setState(() {});
    }
  }

  @override
  void dispose() {
    _tabController.removeListener(_onTabChanged);
    _tabController.dispose();
    super.dispose();
  }

  FriendlyMatchHubTab get _selectedTab =>
      FriendlyMatchHubTab.values[_tabController.index];

  Future<void> _runMatchAction(
    FriendlyMatch match,
    Future<void> Function() action, {
    String? success,
  }) async {
    setState(() => _busyMatchId = match.id);
    try {
      await action();
      if (mounted && success != null) showAppSnackBar(context, success);
    } on FriendlyMatchActionException catch (e) {
      if (mounted) showAppSnackBar(context, e.message, isError: true);
    } catch (_) {
      if (mounted) {
        showAppSnackBar(
          context,
          'Não foi possível concluir a ação.',
          isError: true,
        );
      }
    } finally {
      if (mounted) setState(() => _busyMatchId = null);
    }
  }

  Future<void> _acceptInvite(FriendlyMatch match) =>
      _runMatchAction(match, () async {
        await ref.read(friendlyMatchServiceProvider).acceptInvite(match.id);
        await ref
            .read(analyticsServiceProvider)
            .logFriendlyMatchInviteAccepted(
              wasCounter: match.status == FriendlyMatchStatus.countered,
            );
      }, success: 'Deu match! Jogo confirmado 🎉');

  Future<void> _declineInvite(FriendlyMatch match) => _runMatchAction(
    match,
    () => ref.read(friendlyMatchServiceProvider).declineInvite(match.id),
    success: 'Convite recusado.',
  );

  @override
  Widget build(BuildContext context) {
    final uid = ref.watch(authProvider).value?.uid ?? '';
    final theme = Theme.of(context);
    final receivedCount =
        ref.watch(friendlyMatchInboxProvider).valueOrNull?.length ?? 0;
    final sentCount =
        ref.watch(friendlyMatchOutboxProvider).valueOrNull?.length ?? 0;
    final gamesCount =
        ref.watch(friendlyMatchActiveProvider).valueOrNull?.length ?? 0;

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: NexaAppBar(
        backgroundColor: context.themeColors.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        leading: Padding(
          padding: const EdgeInsets.only(left: 12),
          child: Center(
            child: Material(
              color: context.themeColors.surfaceRaised,
              borderRadius: BorderRadius.circular(12),
              child: InkWell(
                onTap: () => context.pop(),
                borderRadius: BorderRadius.circular(12),
                child: SizedBox(
                  width: 40,
                  height: 40,
                  child: Icon(
                    Icons.chevron_left_rounded,
                    color: context.themeColors.onSurface,
                  ),
                ),
              ),
            ),
          ),
        ),
        centerTitle: false,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'CONVITES PARA JOGAR',
              style: AppTypography.mono(
                fontSize: 10,
                fontWeight: FontWeight.w500,
                color: context.themeColors.brand,
                letterSpacing: 1,
              ),
            ),
            Text(
              'Convites',
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
                letterSpacing: -0.3,
              ),
            ),
          ],
        ),
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          FriendlyMatchHubTabs(
            controller: _tabController,
            selected: _selectedTab,
            receivedCount: receivedCount,
            sentCount: sentCount,
            gamesCount: gamesCount,
            onSelected: (tab) =>
                setState(() => _tabController.index = tab.index),
          ),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _MatchListTab(
                  uid: uid,
                  sectionTitle: 'NOVO CONVITE',
                  matchesAsync: ref.watch(friendlyMatchInboxProvider),
                  emptyIcon: Icons.inbox_rounded,
                  emptyTitle: 'Nenhum convite por aqui',
                  emptySubtitle:
                      'Quando alguém te chamar para jogar, o convite aparece aqui.',
                  emptyActionLabel: 'Encontrar atletas',
                  onEmptyAction: () => context.push(AppRoutes.athleteDiscover),
                  highlightPending: true,
                  showInviteActions: true,
                  busyMatchId: _busyMatchId,
                  onAccept: _acceptInvite,
                  onDecline: _declineInvite,
                ),
                _MatchListTab(
                  uid: uid,
                  sectionTitle: 'AGUARDANDO RESPOSTA',
                  matchesAsync: ref.watch(friendlyMatchOutboxProvider),
                  emptyIcon: Icons.send_outlined,
                  emptyTitle: 'Nenhum convite enviado',
                  emptySubtitle:
                      'Encontre um atleta do seu nível e chame para jogar.',
                  emptyActionLabel: 'Encontrar atletas',
                  onEmptyAction: () => context.push(AppRoutes.athleteDiscover),
                ),
                _MatchListTab(
                  uid: uid,
                  sectionTitle: 'JOGOS MARCADOS',
                  matchesAsync: ref.watch(friendlyMatchActiveProvider),
                  emptyIcon: Icons.event_available_outlined,
                  emptyTitle: 'Nenhum jogo marcado',
                  emptySubtitle:
                      'Convites aceitos viram jogos e aparecem aqui e na sua agenda.',
                  emptyActionLabel: 'Encontrar atletas',
                  onEmptyAction: () => context.push(AppRoutes.athleteDiscover),
                ),
                _MatchListTab(
                  uid: uid,
                  sectionTitle: 'HISTÓRICO',
                  matchesAsync: ref.watch(friendlyMatchHistoryProvider),
                  emptyIcon: Icons.history_rounded,
                  emptyTitle: 'Sem histórico ainda',
                  emptySubtitle:
                      'Seus jogos concluídos ficam registrados aqui.',
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MatchListTab extends StatelessWidget {
  const _MatchListTab({
    required this.uid,
    required this.matchesAsync,
    required this.emptyIcon,
    required this.emptyTitle,
    required this.emptySubtitle,
    this.sectionTitle,
    this.emptyActionLabel,
    this.onEmptyAction,
    this.highlightPending = false,
    this.showInviteActions = false,
    this.busyMatchId,
    this.onAccept,
    this.onDecline,
  });

  final String uid;
  final String? sectionTitle;
  final AsyncValue<List<FriendlyMatch>> matchesAsync;
  final IconData emptyIcon;
  final String emptyTitle;
  final String emptySubtitle;
  final String? emptyActionLabel;
  final VoidCallback? onEmptyAction;
  final bool highlightPending;
  final bool showInviteActions;
  final String? busyMatchId;
  final Future<void> Function(FriendlyMatch match)? onAccept;
  final Future<void> Function(FriendlyMatch match)? onDecline;

  @override
  Widget build(BuildContext context) {
    return matchesAsync.when(
      loading: () => const AppLoadingView(),
      error: (error, _) => const AppInlineErrorView(
        message: 'Não foi possível carregar os convites.',
      ),
      data: (matches) {
        if (matches.isEmpty) {
          return AppEmptyView(
            icon: emptyIcon,
            title: emptyTitle,
            subtitle: emptySubtitle,
            actionLabel: emptyActionLabel,
            onAction: onEmptyAction,
          );
        }

        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          children: [
            if (sectionTitle != null) ...[
              Text(
                sectionTitle!,
                style: AppTypography.mono(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.1,
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
              const SizedBox(height: 12),
            ],
            for (var i = 0; i < matches.length; i++) ...[
              if (i > 0) const SizedBox(height: 10),
              FriendlyMatchCard(
                match: matches[i],
                currentUid: uid,
                highlightPending: highlightPending,
                busy: busyMatchId == matches[i].id,
                onTap: () => context.push(
                  AppRoutes.friendlyMatchDetail.replaceFirst(
                    ':matchId',
                    matches[i].id,
                  ),
                ),
                onAccept: showInviteActions && onAccept != null
                    ? () => onAccept!(matches[i])
                    : null,
                onDecline: showInviteActions && onDecline != null
                    ? () => onDecline!(matches[i])
                    : null,
              ),
            ],
          ],
        );
      },
    );
  }
}
