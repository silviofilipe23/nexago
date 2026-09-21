import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_type.dart';

/// Blindagem da fase 0 do King of the Court.
///
/// A coleção `matches` é compartilhada: no mesmo torneio convivem categorias de
/// duelo e categorias KOTC. Só o `matchType` separa as duas, então estes testes
/// travam a fronteira — se ela ceder, uma rodada KOTC vaza para a chave, para a
/// tabela de grupos e para a campanha do atleta.
void main() {
  group('TournamentMatchType', () {
    test('reconhece os tipos KOTC gerados pela chave', () {
      for (final type in [
        TournamentMatchType.kocRound,
        TournamentMatchType.kocSemifinal,
        TournamentMatchType.kocFinal,
      ]) {
        expect(TournamentMatchType.isKingOfCourt(type), isTrue, reason: type);
        expect(TournamentMatchType.isDuel(type), isFalse, reason: type);
      }
    });

    test('aceita caixa alta e espaço no lugar do underscore', () {
      for (final raw in ['KOC_ROUND', 'Koc Final', '  koc_semifinal  ']) {
        expect(TournamentMatchType.isKingOfCourt(raw), isTrue, reason: raw);
      }
    });

    test('blinda tipo KOTC futuro pelo prefixo', () {
      expect(TournamentMatchType.isKingOfCourt('koc_repescagem'), isTrue);
    });

    test('trata todo tipo de duelo como duelo, inclusive vazio', () {
      for (final raw in ['final', 'semifinal', 'group', 'wb', 'lb', '']) {
        expect(TournamentMatchType.isDuel(raw), isTrue, reason: '"$raw"');
      }
    });

    test('exige a fronteira do prefixo', () {
      expect(TournamentMatchType.isKingOfCourt('kocround'), isFalse);
    });
  });

  group('TournamentMatch — rodada KOTC fora das listas de duelo', () {
    TournamentMatch round({required String matchType, String poolId = 'C1'}) {
      return TournamentMatch(
        id: 'r1',
        tournamentId: 't1',
        categoryId: 'open',
        round: 1,
        matchType: matchType,
        poolId: poolId,
        // A rodada não tem lados: o elenco vive em `kocTeamIds`.
        teamAId: '',
        teamBId: '',
        status: TournamentMatchStatus.completed,
        resultA: '',
        resultB: '',
        isGroupMatch: false,
        matchNumber: 1,
        winnerId: 'team-campea',
      );
    }

    test('não entra na chave nem na tabela de grupos', () {
      final koc = round(matchType: TournamentMatchType.kocRound);
      expect(koc.isKingOfCourt, isTrue);
      expect(koc.isDuel, isFalse);
      expect(koc.isBracketMatch, isFalse);
      // O ponto crítico: `poolId` da rodada é a QUADRA da fase, não um grupo.
      // Sem a guarda, `isPoolMatch` daria true e a rodada entraria na
      // classificação de grupos da categoria.
      expect(koc.isPoolMatch, isFalse);
    });

    test('a final KOTC também fica fora, apesar do winnerId', () {
      final koc = round(matchType: TournamentMatchType.kocFinal, poolId: '');
      expect(koc.isBracketMatch, isFalse);
      expect(koc.isPoolMatch, isFalse);
    });

    test('partida de duelo segue classificada como antes', () {
      final duelo = TournamentMatch(
        id: 'm1',
        tournamentId: 't1',
        categoryId: 'open',
        round: 1,
        matchType: 'final',
        poolId: '',
        teamAId: 'team-a',
        teamBId: 'team-b',
        status: TournamentMatchStatus.completed,
        resultA: '2',
        resultB: '0',
        isGroupMatch: false,
        matchNumber: 9,
        winnerId: 'team-a',
      );
      expect(duelo.isDuel, isTrue);
      expect(duelo.isBracketMatch, isTrue);
      expect(duelo.isPoolMatch, isFalse);

      final grupo = TournamentMatch(
        id: 'm2',
        tournamentId: 't1',
        categoryId: 'open',
        round: 1,
        matchType: 'group',
        poolId: 'A',
        teamAId: 'team-a',
        teamBId: 'team-b',
        status: TournamentMatchStatus.completed,
        resultA: '2',
        resultB: '0',
        isGroupMatch: true,
        matchNumber: 1,
        winnerId: 'team-a',
      );
      expect(grupo.isPoolMatch, isTrue);
      expect(grupo.isBracketMatch, isFalse);
    });
  });
}
