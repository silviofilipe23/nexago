import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_card_view_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/focus_rosters.dart';

TournamentMatchCardViewModel _card({
  required String id,
  required String teamAId,
  required String teamBId,
  required String nameA,
  required String nameB,
  List<TournamentMatchCardPlayerViewModel> playersA = const [],
  List<TournamentMatchCardPlayerViewModel> playersB = const [],
}) {
  return TournamentMatchCardViewModel(
    match: TournamentMatch(
      id: id,
      tournamentId: 't1',
      categoryId: 'c1',
      round: 1,
      matchType: 'knockout',
      poolId: '',
      teamAId: teamAId,
      teamBId: teamBId,
      status: TournamentMatchStatus.scheduled,
      resultA: '',
      resultB: '',
      isGroupMatch: false,
      matchNumber: 1,
    ),
    teamA: TournamentMatchCardTeamViewModel(
      displayName: nameA,
      players: playersA,
    ),
    teamB: TournamentMatchCardTeamViewModel(
      displayName: nameB,
      players: playersB,
    ),
  );
}

const _dois = [
  TournamentMatchCardPlayerViewModel(initials: 'MA', avatarColor: Colors.orange),
  TournamentMatchCardPlayerViewModel(initials: 'EN', avatarColor: Colors.green),
];

void main() {
  group('FocusRosters', () {
    test('indexa nome e elenco por ID DE TIME', () {
      final rosters = FocusRosters.fromCards([
        _card(
          id: 'm1',
          teamAId: 'meu',
          teamBId: 'rival',
          nameA: 'Marcelo / Enzo',
          nameB: 'Sá / Toledo',
          playersA: _dois,
        ),
      ]);

      expect(rosters.nameOf('meu'), 'Marcelo / Enzo');
      expect(rosters.playersOf('meu'), _dois);
    });

    test('elenco vazio NÃO apaga um elenco real já conhecido', () {
      // Partida em que o time ainda era só descrição ("1º do Grupo A") chega
      // com lista vazia. Se ela sobrescrevesse, a dupla perderia os rostos que
      // outra partida já resolveu.
      final rosters = FocusRosters.fromCards([
        _card(
          id: 'm1',
          teamAId: 'meu',
          teamBId: 'x',
          nameA: 'Marcelo / Enzo',
          nameB: 'Outros',
          playersA: _dois,
        ),
        _card(
          id: 'm2',
          teamAId: 'meu',
          teamBId: 'y',
          nameA: 'Marcelo / Enzo',
          nameB: 'Mais outros',
        ),
      ]);

      expect(rosters.playersOf('meu'), _dois);
    });

    test('time desconhecido cai no fallback, nunca em nulo', () {
      final rosters = FocusRosters.fromCards(const []);

      expect(rosters.nameOf('ninguem'), 'A definir');
      expect(rosters.nameOf('ninguem', 'Dupla'), 'Dupla');
      expect(rosters.playersOf('ninguem'), isEmpty);
    });

    test('ignora slot vazio da chave', () {
      final rosters = FocusRosters.fromCards([
        _card(id: 'm1', teamAId: '', teamBId: '', nameA: 'A', nameB: 'B'),
      ]);

      expect(rosters.nameOf(''), 'A definir');
    });
  });
}
