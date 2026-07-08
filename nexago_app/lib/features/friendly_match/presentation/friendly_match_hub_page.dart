import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:nexago_app/core/ui/app_status_views.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/router/routes.dart';
import '../domain/friendly_match_models.dart';
import '../domain/friendly_match_providers.dart';
import 'widgets/friendly_match_card.dart';

/// Hub do Bora Jogar: Recebidos / Enviados / Jogos / Histórico.
class FriendlyMatchHubPage extends ConsumerWidget {
  const FriendlyMatchHubPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final uid = ref.watch(authProvider).value?.uid ?? '';

    return DefaultTabController(
      length: 4,
      child: Scaffold(
        backgroundColor: Theme.of(context).colorScheme.surfaceContainerLowest,
        appBar: NexaAppBar(
          title: const Text('Bora Jogar'),
          bottom: const TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            tabs: [
              Tab(text: 'Recebidos'),
              Tab(text: 'Enviados'),
              Tab(text: 'Jogos'),
              Tab(text: 'Histórico'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            _MatchListTab(
              uid: uid,
              matchesAsync: ref.watch(friendlyMatchInboxProvider),
              emptyIcon: Icons.sports_volleyball_outlined,
              emptyTitle: 'Nenhum convite por aqui',
              emptySubtitle:
                  'Quando alguém te chamar para jogar, o convite aparece aqui.',
              emptyActionLabel: 'Encontrar atletas',
              onEmptyAction: () => context.push(AppRoutes.athleteDiscover),
            ),
            _MatchListTab(
              uid: uid,
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
              matchesAsync: ref.watch(friendlyMatchHistoryProvider),
              emptyIcon: Icons.history_rounded,
              emptyTitle: 'Sem histórico ainda',
              emptySubtitle: 'Seus jogos concluídos ficam registrados aqui.',
            ),
          ],
        ),
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
    this.emptyActionLabel,
    this.onEmptyAction,
  });

  final String uid;
  final AsyncValue<List<FriendlyMatch>> matchesAsync;
  final IconData emptyIcon;
  final String emptyTitle;
  final String emptySubtitle;
  final String? emptyActionLabel;
  final VoidCallback? onEmptyAction;

  @override
  Widget build(BuildContext context) {
    return matchesAsync.when(
      loading: () => const AppLoadingView(),
      error: (error, _) => const AppInlineErrorView(
        message: 'Não foi possível carregar os jogos.',
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
        return ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: matches.length,
          separatorBuilder: (_, __) => const SizedBox(height: 10),
          itemBuilder: (context, index) {
            final match = matches[index];
            return FriendlyMatchCard(
              match: match,
              currentUid: uid,
              onTap: () => context.push(
                AppRoutes.friendlyMatchDetail
                    .replaceFirst(':matchId', match.id),
              ),
            );
          },
        );
      },
    );
  }
}
