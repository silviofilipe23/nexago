import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../organizer/domain/match_ops/match_ops_providers.dart';
import '../../../../tournaments/domain/followed_match.dart';
import '../../../../tournaments/domain/followed_matches_providers.dart';
import '../../../../tournaments/presentation/focus/widgets/focus_match_card.dart';
import '../../../../tournaments/presentation/widgets/follow_match_button.dart';
import 'athlete_home_section_header.dart';

/// Agrupa os follows por torneio, preservando a ordem em que chegaram (mais
/// recentes primeiro, como `watch` devolve).
///
/// Agrupar importa porque os cards vêm de um provider POR TORNEIO: sem isso
/// seria um listener por partida, repetido para partidas do mesmo torneio.
/// Follow sem `tournamentId` ou sem `matchId` fica de fora — não há como
/// carregar o card, e a varredura diária o remove.
Map<String, List<FollowedMatch>> groupFollowedByTournament(
  List<FollowedMatch> followed,
) {
  final byTournament = <String, List<FollowedMatch>>{};
  for (final match in followed) {
    if (match.tournamentId.isEmpty || match.matchId.isEmpty) continue;
    byTournament.putIfAbsent(match.tournamentId, () => []).add(match);
  }
  return byTournament;
}

/// "Acompanhando": as partidas que o atleta escolheu seguir.
///
/// Reusa o `FocusMatchCard` em vez de desenhar outro card — é o mesmo objeto
/// (placar por sets, badge ao vivo, fotos) e qualquer ajuste lá reflete aqui.
///
/// Some inteira quando não há nada seguido: é a maior parte do tempo, e uma
/// seção vazia com texto explicativo só empurraria o resto da home para baixo.
///
/// Mora em `athlete_home/` e não em `tournaments/` de propósito: a home do
/// atleta já importa de `tournaments`, e o contrário inverteria a direção de
/// dependência entre as features.
class AthleteHomeFollowingMatchesSection extends ConsumerWidget {
  const AthleteHomeFollowingMatchesSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final followed = ref.watch(followedMatchesProvider).valueOrNull;
    if (followed == null || followed.isEmpty) return const SizedBox.shrink();

    final byTournament = groupFollowedByTournament(followed);
    if (byTournament.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
          child: AthleteHomeSectionHeader(title: 'Acompanhando'),
        ),
        const SizedBox(height: AppSpacing.md),
        for (final entry in byTournament.entries)
          _FollowedMatchesOfTournament(
            tournamentId: entry.key,
            followed: entry.value,
          ),
      ],
    );
  }
}

/// Os cards de um torneio. Separado para o `watch` da família ficar num widget
/// próprio: assim a chegada do placar de um torneio não reconstrói os outros.
class _FollowedMatchesOfTournament extends ConsumerWidget {
  const _FollowedMatchesOfTournament({
    required this.tournamentId,
    required this.followed,
  });

  final String tournamentId;
  final List<FollowedMatch> followed;

  void _openMatch(BuildContext context, String matchId) {
    final id = matchId.trim();
    if (id.isEmpty) return;
    context.pushNamed(
      AppRouteNames.athleteMatchDetail,
      pathParameters: {'matchId': id},
      queryParameters: {AppRoutes.matchDetailFromTournamentQuery: '1'},
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cards =
        ref.watch(organizerMatchCardsByIdProvider(tournamentId)).valueOrNull;
    if (cards == null) return const SizedBox.shrink();

    // Um follow cuja partida sumiu do torneio não vira card nem erro: a
    // varredura diária o remove sozinha.
    final visible = [
      for (final match in followed)
        if (cards[match.matchId] != null) match,
    ];
    if (visible.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final match in visible)
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenH,
              0,
              AppSpacing.screenH,
              AppSpacing.lg,
            ),
            child: FocusMatchCard(
              viewModel: cards[match.matchId]!,
              onTap: () => _openMatch(context, match.matchId),
              // Sempre "deixar de seguir", nunca o botão de seguir: tudo aqui
              // já está seguido, e `FollowMatchButton` se esconde em partida
              // encerrada — que é justamente o caso em que o atleta mais quer
              // tirar da lista.
              followAction: UnfollowMatchButton(followed: match),
            ),
          ),
      ],
    );
  }
}
