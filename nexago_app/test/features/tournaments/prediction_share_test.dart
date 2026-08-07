import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/ranking/domain/ranking_list_models.dart';
import 'package:nexago_app/features/tournaments/domain/predictions/prediction_share_text.dart';
import 'package:nexago_app/features/tournaments/domain/predictions/tournament_predictions_logic.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/predictions/prediction_share_card_painter.dart';

PredictionLeaderboardRow _row(
  int rank,
  String name, {
  int score = 0,
  bool isMe = false,
  int? delta,
}) {
  return PredictionLeaderboardRow(
    hits: 0,
    delta: delta,
    entry: RankingListEntry(
      rank: rank,
      points: score,
      tournamentsCount: 0,
      displayName: name,
      subtitle: '',
      isCurrentUser: isMe,
      entityId: 'u$rank',
    ),
  );
}

void main() {
  group('shortDisplayName', () {
    test('mantém o primeiro nome e reduz o resto à inicial', () {
      expect(shortDisplayName('Marcelo Antunes'), 'Marcelo A.');
      expect(shortDisplayName('Ana Paula da Silva'), 'Ana S.');
    });

    test('aguenta nome único, espaços sobrando e ausência de nome', () {
      expect(shortDisplayName('Rafaela'), 'Rafaela');
      expect(shortDisplayName('  Diego   Torres  '), 'Diego T.');
      expect(shortDisplayName(null), 'Atleta');
      expect(shortDisplayName('   '), 'Atleta');
    });
  });

  group('predictionShareUrl', () {
    test('aponta para a aba de palpites do portal do atleta', () {
      expect(
        predictionShareUrl('t1'),
        'https://atleta.nexago.com.br/torneios/t1/palpites',
      );
    });

    test('não duplica a barra final da base', () {
      expect(
        predictionShareUrl('t1', base: 'https://x.com/'),
        'https://x.com/torneios/t1/palpites',
      );
    });
  });

  group('buildPredictionShareData', () {
    const url = 'https://atleta.nexago.com.br/torneios/t1/palpites';

    test('leva o pódio e a linha de quem está fora dele', () {
      final data = buildPredictionShareData(
        tournamentName: 'Open Goiânia Beach 2026',
        leaderboard: [
          _row(1, 'Rafaela Nunes', score: 12),
          _row(2, 'Diego Torres', score: 9),
          _row(3, 'Carla Menezes', score: 7),
          _row(4, 'Bruno Ramos', score: 6),
          _row(5, 'Marcelo Antunes', score: 4, isMe: true),
        ],
        url: url,
      );

      expect(data.top.map((r) => r.name), ['Rafaela N.', 'Diego T.', 'Carla M.']);
      expect(data.me?.rank, 5);
      expect(data.me?.name, 'Marcelo A.');
      expect(data.totalPlayers, 5);
      expect(data.urlLabel, 'atleta.nexago.com.br/torneios/t1/palpites');
    });

    // Dentro do pódio a linha destacada já é a dele: repetir embaixo mostraria a
    // mesma pessoa duas vezes no mesmo card.
    test('não repete a linha de quem já está no pódio', () {
      final data = buildPredictionShareData(
        tournamentName: null,
        leaderboard: [
          _row(1, 'Marcelo Antunes', score: 12, isMe: true),
          _row(2, 'Diego Torres', score: 9),
        ],
        url: url,
      );
      expect(data.me, isNull);
      expect(data.top.first.isMe, isTrue);
    });

    test('aguenta ranking com menos de três participantes', () {
      final data = buildPredictionShareData(
        tournamentName: null,
        leaderboard: [_row(1, 'Rafaela Nunes', score: 2)],
        url: url,
      );
      expect(data.top.length, 1);
      expect(data.me, isNull);
    });
  });

  group('predictionShareText', () {
    const url = 'https://atleta.nexago.com.br/torneios/t1/palpites';

    test('provoca com a própria posição quando o atleta está fora do pódio', () {
      final data = buildPredictionShareData(
        tournamentName: 'Open Goiânia Beach 2026',
        leaderboard: [
          _row(1, 'Rafaela Nunes', score: 9),
          _row(5, 'Marcelo Antunes', score: 4, isMe: true),
        ],
        url: url,
      );
      expect(
        predictionShareText(data, url),
        'Estou em #5 no ranking de palpites do Open Goiânia Beach 2026. '
        'Dá o seu: $url',
      );
    });

    test('muda o tom quando quem compartilha é o líder', () {
      final data = buildPredictionShareData(
        tournamentName: null,
        leaderboard: [_row(1, 'Marcelo Antunes', score: 9, isMe: true)],
        url: url,
      );
      expect(predictionShareText(data, url), contains('Estou liderando'));
    });

    test('cita o líder quando quem compartilha não palpitou', () {
      final data = buildPredictionShareData(
        tournamentName: null,
        leaderboard: [_row(1, 'Rafaela Nunes', score: 9)],
        url: url,
      );
      expect(
        predictionShareText(data, url),
        'Rafaela N. lidera o ranking de palpites. Dá o seu: $url',
      );
    });
  });

  group('renderPredictionShareCard', () {
    const url = 'https://atleta.nexago.com.br/torneios/t1/palpites';

    Future<void> renderOk(List<PredictionLeaderboardRow> leaderboard) async {
      final data = buildPredictionShareData(
        tournamentName: 'Open Goiânia Beach 2026',
        leaderboard: leaderboard,
        url: url,
      );
      final image = await renderPredictionShareCard(data);
      addTearDown(image.dispose);
      expect(image.width, kPredictionCardWidth.round());
      expect(image.height, kPredictionCardHeight.round());
    }

    test('desenha o card cheio no formato 9:16', () async {
      await renderOk([
        _row(1, 'Rafaela Nunes', score: 12),
        _row(2, 'Diego Torres', score: 9),
        _row(3, 'Carla Menezes', score: 7),
        _row(9, 'Marcelo Antunes', score: 4, isMe: true),
      ]);
    });

    // Os casos em que a pilha de linhas encolhe: o centramento vertical não pode
    // estourar nem colidir com o rodapé.
    test('desenha com um único participante', () async {
      await renderOk([_row(1, 'Rafaela Nunes', score: 1, isMe: true)]);
    });

    test('desenha com nome longo e pontuação de três dígitos', () async {
      await renderOk([
        _row(1, 'Maria Aparecida Nascimento Gonçalves', score: 188),
        _row(2, 'Diego Torres', score: 97),
      ]);
    });
  });
}
