import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/how_it_works/how_it_works_rules.dart';

void main() {
  group('HowItWorksTab.fromQuery', () {
    test('lê a aba da rota e cai em Nível quando não reconhece', () {
      expect(HowItWorksTab.fromQuery('elo'), HowItWorksTab.elo);
      expect(HowItWorksTab.fromQuery(' Ranking '), HowItWorksTab.ranking);
      expect(HowItWorksTab.fromQuery(null), HowItWorksTab.level);
      expect(HowItWorksTab.fromQuery('xp'), HowItWorksTab.level);
      expect(HowItWorksTab.fromQueryOrNull('xp'), isNull);
    });
  });

  group('isRatedSport', () {
    test('só vôlei tem acompanhamento por rating', () {
      expect(isRatedSport('VOLEI_PRAIA'), isTrue);
      expect(isRatedSport('volei_quadra'), isTrue);
      expect(isRatedSport('BEACH_TENNIS'), isFalse);
      expect(isRatedSport('FUTEVOLEI'), isFalse);
    });
  });

  group('howItWorksXpRules', () {
    test('usa os valores reais do backend, não os do protótipo', () {
      final byTitle = {for (final r in howItWorksXpRules()) r.title: r.value};
      expect(byTitle['Jogo na quadra que você reservou'], '+50');
      expect(byTitle['Vitória em torneio'], '+50');
      // Faixas saem dos catálogos: missões 15–40, conquistas 15–120.
      expect(byTitle['Missões do dia'], '+15 a 40');
      expect(byTitle['Conquistas'], '+15 a 120');
      expect(byTitle['Indicar um amigo'], '+50');
      expect(byTitle['Convite pra jogar aceito'], '+20');
      expect(byTitle['Avaliações e palpites'], '+10 a 30');
    });

    test('xpRangeLabel junta valores iguais', () {
      expect(xpRangeLabel([20, 20]), '+20');
      expect(xpRangeLabel([40, 15, 20]), '+15 a 40');
      expect(xpRangeLabel(const []), '');
    });
  });

  group('sandRankFamilies', () {
    test('um degrau por elo, do Iniciante III à Lenda', () {
      final families = sandRankFamilies();
      expect(families.map((s) => s.rankCode), [
        'INICIANTE',
        'COMPETIDOR',
        'DESAFIANTE',
        'ELITE',
        'MESTRE',
        'LENDA',
      ]);
      expect(families.first.division, 3);
    });
  });

  group('howItWorksPresetForLevel', () {
    test('abre a tabela na faixa do nível do atleta', () {
      expect(howItWorksPresetForLevel('Iniciante 2'), 'Iniciante');
      expect(howItWorksPresetForLevel('intermediario_1'), 'Intermediário');
      expect(howItWorksPresetForLevel('Avançado 2'), 'Avançado');
      expect(howItWorksPresetForLevel('Open'), 'Open');
      expect(howItWorksPresetForLevel(null), 'Open');
    });
  });

  group('howItWorksPointsTable', () {
    test('Open (peso 1) é a tabela base', () {
      final rows = howItWorksPointsTable(1);
      expect(
          rows.map((r) => r.points), [1000, 800, 600, 500, 330, 200, 130, 100]);
    });

    test('Intermediário (×0,25) arredonda como o backend', () {
      final points = {
        for (final r in howItWorksPointsTable(0.25)) r.label: r.points,
      };
      expect(points['Título'], 250);
      expect(points['Vice'], 200);
      expect(points['3º lugar'], 150);
      expect(points['Quartas de final'], 83); // 82,5 → 83 (Math.round)
      expect(points['16-avos de final'], 33); // 32,5 → 33
      expect(points['Participação'], 25);
    });

    test('Elite (×1,2) passa da tabela base', () {
      expect(howItWorksPointsTable(1.2).first.points, 1200);
    });
  });

  test('formatRankingWeight usa vírgula e corta o zero', () {
    expect(formatRankingWeight(0.125), '×0,125');
    expect(formatRankingWeight(1.0), '×1');
    expect(formatRankingWeight(1.2), '×1,2');
  });

  test('regra de chave pequena sai das constantes', () {
    expect(
      howItWorksBracketSizeRule(),
      'Com 8 ou mais duplas pagas, vale a tabela inteira; de 4 a 7, ×0,6; '
      'com menos de 4, ×0,25.',
    );
  });

  group('buildLevelReviewContactUrl', () {
    test('WhatsApp com o pedido já escrito', () {
      final url = buildLevelReviewContactUrl(
        sportLabel: 'vôlei de praia',
        levelLabel: 'Intermediário 1',
        athleteName: 'Ana',
        whatsapp: '+55 (62) 99853-9835',
      );
      expect(url, startsWith('https://wa.me/5562998539835?text='));
      final text = Uri.parse(url).queryParameters['text'];
      expect(text, contains('revisão do meu nível no vôlei de praia'));
      expect(text, contains('Intermediário 1'));
      expect(text, contains('Meu nome no app: Ana.'));
    });

    test('sem número configurado cai no e-mail', () {
      final url = buildLevelReviewContactUrl(
        sportLabel: 'vôlei de praia',
        levelLabel: 'Open',
        whatsapp: '',
      );
      expect(url, startsWith('mailto:'));
      expect(Uri.parse(url).queryParameters['subject'], 'Revisão de nível');
    });
  });
}
