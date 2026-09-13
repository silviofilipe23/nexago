import 'package:flutter/material.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';

import '../../ranking/domain/ranking_display_helpers.dart';
import 'tournament_match_card_view_model.dart';
import 'tournament_team.dart';

/// Cor do avatar quando não há nem id nem nome para semear.
const _fallbackAvatarColor = Color(0xFF5B8DEF);

/// Os atletas de uma equipe, com nome, iniciais e foto.
///
/// Caminho preferencial: a equipe existe no Firestore e os perfis foram
/// carregados, então dá para nomear cada atleta individualmente — é o que a
/// tela de pódio desenha sob cada avatar.
List<TournamentMatchCardPlayerViewModel> playersFromTeam(
  TournamentTeam team,
  Map<String, AppUserProfile> profiles,
) {
  final players = <TournamentMatchCardPlayerViewModel>[];
  for (final playerId in [team.player1Id, team.player2Id]) {
    if (playerId.isEmpty) continue;
    final profile = profiles[playerId];
    players.add(
      TournamentMatchCardPlayerViewModel(
        initials: profile != null
            ? appUserInitials(profile)
            : rankingInitials(null, playerId),
        avatarColor: rankingAvatarColor(playerId),
        avatarUrl: profile?.profilePhotoUrl,
        name: playerDisplayNameFor(profile, playerId),
      ),
    );
  }
  return players;
}

/// Os atletas deduzidos do rótulo da dupla ("Bruno / Lucas"), quando a partida
/// não resolveu a equipe.
///
/// Um rótulo sem "/" é um nome só — pode ser o nome próprio da equipe ("Os
/// Invencíveis") ou uma reserva solo. Nos dois casos devolver UMA entrada é o
/// certo: inventar um segundo atleta seria pior que mostrar um.
List<TournamentMatchCardPlayerViewModel> playersFromDisplayName(
  String displayName,
) {
  final parts = displayName
      .split('/')
      .map((part) => part.trim())
      .where((part) => part.isNotEmpty)
      .toList();

  if (parts.isEmpty) {
    return const [
      TournamentMatchCardPlayerViewModel(
        initials: '?',
        avatarColor: _fallbackAvatarColor,
      ),
    ];
  }

  return parts
      .map(
        (name) => TournamentMatchCardPlayerViewModel(
          initials: initialsFromDisplayName(name),
          avatarColor: rankingAvatarColor(name),
          name: name,
        ),
      )
      .toList();
}

/// Nome de exibição de um atleta, nunca vazio quando há id.
String playerDisplayNameFor(AppUserProfile? profile, String playerId) {
  final resolved = resolveAppUserDisplayName(profile);
  if (resolved.isNotEmpty) return resolved;
  final id = playerId.trim();
  if (id.isEmpty) return '';
  return rankingDisplayName(profile, id);
}
