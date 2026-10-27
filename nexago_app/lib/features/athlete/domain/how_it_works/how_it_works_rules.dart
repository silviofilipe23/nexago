import '../../../arenas/domain/arena_contact_message.dart';
import '../../../ranking/domain/ranking_constants.dart';
import '../../../ranking/domain/ranking_list_models.dart';
import '../achievements/achievement_catalog.dart';
import '../athlete_profile_options.dart';
import '../daily_mission_catalog.dart';
import '../sand_rank/sand_rank_catalog.dart';

// Regras da tela "Como funciona" (Nível · Elo e XP · Ranking).
//
// Exibição apenas: quem concede XP e pontua é o backend. Onde o app já tem o
// catálogo (missões, conquistas, tabela de colocação, pesos, trilha de elos),
// o texto sai dele; o que só existe nas functions ganha constante aqui, com o
// arquivo de origem no comentário.

/// Abas da tela — `query` é o valor de `?aba=` na rota.
enum HowItWorksTab {
  level('nivel', 'Nível', 'Com quem você joga'),
  elo('elo', 'Elo e XP', 'O quanto você joga'),
  ranking('ranking', 'Ranking', 'Como vai em torneios');

  const HowItWorksTab(this.query, this.label, this.question);

  final String query;
  final String label;
  final String question;

  /// Aba pedida na rota; desconhecida ou ausente abre em [level].
  static HowItWorksTab fromQuery(String? raw) => fromQueryOrNull(raw) ?? level;

  static HowItWorksTab? fromQueryOrNull(String? raw) {
    final value = raw?.trim().toLowerCase();
    for (final tab in values) {
      if (tab.query == value) return tab;
    }
    return null;
  }
}

// ── Nível ──────────────────────────────────────────────────────────────────

/// Esportes em que o jogo é acompanhado pelo rating (Glicko) — espelho de
/// `RATED_SPORT_CODES` em `functions/src/rating-config.ts`.
const Set<String> kRatedSportCodes = {'VOLEI_PRAIA', 'VOLEI_QUADRA'};

bool isRatedSport(String firestoreSportId) =>
    kRatedSportCodes.contains(firestoreSportId.trim().toUpperCase());

/// As 4 faixas da escada de 7, na ordem — mesma lente do filtro do ranking.
const List<RankingLevelFilter> howItWorksLevelBands = [
  RankingLevelFilter.iniciante,
  RankingLevelFilter.intermediario,
  RankingLevelFilter.avancado,
  RankingLevelFilter.open,
];

// ── Elo e XP ───────────────────────────────────────────────────────────────

/// Jogo na quadra reservada — `XP_GAME_COMPLETED` em
/// `functions/src/game-completed-gamification.ts`.
const int kXpBookingGamePlayed = 50;

/// Partida de torneio vencida — `XP_GAME_COMPLETED` em
/// `functions/src/tournament-match-gamification.ts`.
const int kXpTournamentMatchWin = 50;

/// Amigo indicado que joga pela 1ª vez — `XP_REFERRAL_BONUS` em
/// `functions/src/athlete-referral.ts`.
const int kXpReferral = 50;

/// Convite pra jogar aceito (vai pra quem convidou) — `XP_INVITE_PLAYER` em
/// `functions/src/player-invite-gamification.ts`.
const int kXpInviteAccepted = 20;

/// Avaliar arena/torneio e acertar palpite valem 10; acertar o campeão, 30 —
/// `arena-review-gamification.ts`, `tournament-review-constants.ts` e
/// `tournament-predictions.ts`.
const int kXpReviewOrPrediction = 10;
const int kXpChampionPrediction = 30;

class HowItWorksXpRule {
  const HowItWorksXpRule({
    required this.title,
    required this.value,
    this.subtitle,
  });

  final String title;
  final String value;
  final String? subtitle;
}

List<HowItWorksXpRule> howItWorksXpRules() {
  final missions = DailyMissionCatalog.all;
  return [
    const HowItWorksXpRule(
      title: 'Jogo na quadra que você reservou',
      subtitle: 'Conta quando o horário do jogo termina',
      value: '+$kXpBookingGamePlayed',
    ),
    const HowItWorksXpRule(
      title: 'Vitória em torneio',
      subtitle: 'A cada partida vencida',
      value: '+$kXpTournamentMatchWin',
    ),
    HowItWorksXpRule(
      title: 'Missões do dia',
      subtitle: '${missions.length} por dia, cada uma vale uma vez',
      value: xpRangeLabel(missions.map((m) => m.xpReward)),
    ),
    HowItWorksXpRule(
      title: 'Conquistas',
      subtitle: 'Cada uma vale uma vez',
      value: xpRangeLabel(AchievementCatalog.all.map((a) => a.xpReward)),
    ),
    const HowItWorksXpRule(
      title: 'Indicar um amigo',
      subtitle: 'Quando ele joga pela primeira vez',
      value: '+$kXpReferral',
    ),
    const HowItWorksXpRule(
      title: 'Convite pra jogar aceito',
      value: '+$kXpInviteAccepted',
    ),
    const HowItWorksXpRule(
      title: 'Avaliações e palpites',
      subtitle: 'Avaliar arena ou torneio, acertar palpites',
      value: '+$kXpReviewOrPrediction a $kXpChampionPrediction',
    ),
  ];
}

/// `+40` quando todos valem o mesmo; `+15 a 120` quando variam.
String xpRangeLabel(Iterable<int> values) {
  if (values.isEmpty) return '';
  var min = values.first;
  var max = values.first;
  for (final v in values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return min == max ? '+$min' : '+$min a $max';
}

/// Primeiro degrau de cada elo (Iniciante III … Mestre III, Lenda).
List<SandRankStep> sandRankFamilies() {
  final families = <SandRankStep>[];
  for (final step in sandRankTrack) {
    if (families.isEmpty || families.last.rankCode != step.rankCode) {
      families.add(step);
    }
  }
  return families;
}

// ── Ranking ────────────────────────────────────────────────────────────────

/// Presets de categoria na ordem da escada; o peso vem de
/// [categoryPresetWeights]. O Livre fica de fora: o peso dele é medido no
/// campo inscrito, não fixo.
const List<String> howItWorksRankingPresets = [
  'Iniciante',
  'Intermediário',
  'Avançado',
  'Open',
  'Elite',
];

double howItWorksPresetWeight(String preset) =>
    categoryPresetWeights[preset] ?? 1.0;

/// Preset da faixa do nível do atleta, pra tabela abrir no peso dele. Sem
/// nível conhecido, abre no Open (a tabela base, peso 1).
String howItWorksPresetForLevel(String? level) {
  final rank = AthleteProfileOptions.levelRank(level);
  if (rank == null) return 'Open';
  for (final band in howItWorksLevelBands) {
    if (band.matchesRank(rank)) return band.label;
  }
  return 'Open';
}

class HowItWorksPointsRow {
  const HowItWorksPointsRow({
    required this.label,
    required this.points,
    this.detail,
  });

  final String label;
  final int points;
  final String? detail;
}

/// Tabela de pontos numa categoria de peso [weight] — o backend arredonda uma
/// vez `base × peso` (chave cheia e torneio sem multiplicador próprio).
List<HowItWorksPointsRow> howItWorksPointsTable(double weight) {
  int scaled(int base) => (base * weight).round();
  return [
    HowItWorksPointsRow(label: 'Título', points: scaled(getPointsForPlace(1))),
    HowItWorksPointsRow(label: 'Vice', points: scaled(getPointsForPlace(2))),
    HowItWorksPointsRow(
      label: '3º lugar',
      points: scaled(getPointsForPlace(3)),
    ),
    HowItWorksPointsRow(
      label: '4º lugar',
      points: scaled(getPointsForPlace(4)),
    ),
    HowItWorksPointsRow(
      label: 'Quartas de final',
      detail: '5º ao 8º',
      points: scaled(getPointsForPlace(5)),
    ),
    HowItWorksPointsRow(
      label: 'Oitavas de final',
      detail: '9º ao 16º',
      points: scaled(getPointsForPlace(9)),
    ),
    HowItWorksPointsRow(
      label: '16-avos de final',
      detail: '17º ao 32º',
      points: scaled(getPointsForPlace(17)),
    ),
    HowItWorksPointsRow(
      label: 'Participação',
      detail: 'Jogou o torneio',
      points: scaled(participationPoints),
    ),
  ];
}

/// `×0,125`, `×1`, `×1,2` — vírgula decimal, sem zero sobrando.
String formatRankingWeight(double weight) {
  var text = weight.toString();
  if (text.endsWith('.0')) text = text.substring(0, text.length - 2);
  return '×${text.replaceAll('.', ',')}';
}

String howItWorksBracketSizeRule() {
  return 'Com $fullBracketMinPaidTeams ou mais duplas pagas, vale a tabela '
      'inteira; de $smallBracketMinPaidTeams a ${fullBracketMinPaidTeams - 1}, '
      '${formatRankingWeight(smallBracketFactor)}; com menos de '
      '$smallBracketMinPaidTeams, ${formatRankingWeight(tinyBracketFactor)}.';
}

// ── Revisão de nível ───────────────────────────────────────────────────────

/// Destino do "Pedir revisão": WhatsApp da nexaGO com o pedido já escrito, ou
/// o e-mail quando o número não estiver configurado. Baixar um nível travado
/// é só pela equipe (`setAthleteLevel`, super admin).
///
/// `whatsapp` existe só para o teste exercitar os dois ramos.
String buildLevelReviewContactUrl({
  required String sportLabel,
  required String levelLabel,
  String athleteName = '',
  String whatsapp = kNexagoSalesWhatsApp,
}) {
  final name = athleteName.trim();
  final message =
      'Olá! Quero pedir a revisão do meu nível no $sportLabel. Hoje ele '
      'está em $levelLabel e acho que não reflete meu jogo.'
      '${name.isEmpty ? '' : ' Meu nome no app: $name.'}';
  final digits = whatsapp.replaceAll(RegExp(r'\D'), '');
  if (digits.length >= 12) {
    return 'https://wa.me/$digits?text=${Uri.encodeComponent(message)}';
  }
  final query = Uri(
    queryParameters: {'subject': 'Revisão de nível', 'body': message},
  ).query;
  return 'mailto:$kNexagoSalesEmail?$query';
}
