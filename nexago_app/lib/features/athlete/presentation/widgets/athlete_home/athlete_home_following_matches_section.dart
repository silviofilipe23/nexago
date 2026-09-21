import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../organizer/domain/match_ops/match_ops_providers.dart';
import '../../../../tournaments/domain/followed_match.dart';
import '../../../../tournaments/domain/followed_matches_providers.dart';
import '../../../../tournaments/domain/tournament_match.dart';
import '../../../../tournaments/domain/tournament_match_card_view_model.dart';
import '../../../../tournaments/domain/tournament_match_status.dart';
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

/// Ainda cabe na home: agendada ou ao vivo.
///
/// Encerrada/cancelada some da seção — o doc em `followedMatches` pode
/// permanecer até a varredura diária, mas não ocupa a home do atleta.
bool isFollowedMatchActiveOnHome(TournamentMatch match) {
  return TournamentMatchStatus.isScheduled(match.status) ||
      TournamentMatchStatus.isInProgress(match.status);
}

/// Follows que ainda têm card carregado e partida não terminal.
List<FollowedMatch> activeFollowedMatches({
  required List<FollowedMatch> followed,
  required Map<String, TournamentMatchCardViewModel> cardsById,
}) {
  return [
    for (final match in followed)
      if (cardsById[match.matchId] != null &&
          isFollowedMatchActiveOnHome(cardsById[match.matchId]!.match))
        match,
  ];
}

/// "Acompanhando": as partidas que o atleta escolheu seguir.
///
/// Reusa o `FocusMatchCard` em vez de desenhar outro card — é o mesmo objeto
/// (placar por sets, badge ao vivo, fotos) e qualquer ajuste lá reflete aqui.
///
/// Some inteira quando não há nada seguido **ou** quando todos os jogos já
/// terminaram/cancelaram: seção vazia com header só empurraria o resto da
/// home para baixo.
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

    // Resolve cards por torneio antes de desenhar o header: senão a seção
    // ficaria "Acompanhando" vazia (ou com jogos já encerrados).
    final activeByTournament = <String, List<FollowedMatch>>{};
    for (final entry in byTournament.entries) {
      final cards =
          ref.watch(organizerMatchCardsByIdProvider(entry.key)).valueOrNull;
      if (cards == null) continue;
      final active = activeFollowedMatches(
        followed: entry.value,
        cardsById: cards,
      );
      if (active.isNotEmpty) {
        activeByTournament[entry.key] = active;
      }
    }
    if (activeByTournament.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
          child: AthleteHomeSectionHeader(title: 'Acompanhando'),
        ),
        const SizedBox(height: AppSpacing.md),
        for (final entry in activeByTournament.entries)
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

    // Reaplica o filtro: o placar pode fechar a partida depois que o pai
    // montou a lista — aí este filho some sozinho sem esperar rebuild externo.
    final visible = activeFollowedMatches(
      followed: followed,
      cardsById: cards,
    );
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
              followAction: UnfollowMatchButton(followed: match),
            ),
          ),
      ],
    );
  }
}
