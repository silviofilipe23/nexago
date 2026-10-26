import 'package:flutter/foundation.dart';

import '../../../../core/brand/nexa_hashtag.dart';
import '../../../arenas/domain/booking_story.dart';
import 'campaign_share_data.dart';

/// Informações que o atleta liga/desliga no story da campanha, na ordem dos
/// chips.
enum CampaignStoryInfo {
  record('Placar'),
  path('Trajetória'),
  team('Dupla'),
  event('Torneio');

  const CampaignStoryInfo(this.label);

  final String label;
}

/// Tudo o que a arte do story da campanha escreve — o cartel e a trajetória
/// vêm do [CampaignShareData] (a mesma conta do pôster), o resto é moldura.
@immutable
class CampaignStoryData {
  const CampaignStoryData({
    required this.campaign,
    required this.people,
    this.sportLabel,
  });

  final CampaignShareData campaign;

  /// Os rostos da dupla (ou do trio), na ordem do elenco.
  final List<BookingStoryPerson> people;

  /// "Beach Tennis"; `null` esconde o esporte do kicker.
  final String? sportLabel;

  CampaignPlacement get placement => campaign.placement;

  /// "BEACH TENNIS · MASCULINO B".
  String get kicker => [
        if (sportLabel?.trim().isNotEmpty == true) sportLabel!.trim(),
        if (campaign.categoryLine.trim().isNotEmpty)
          campaign.categoryLine.trim(),
      ].join(' · ').toUpperCase();

  /// O selo do topo, pela colocação.
  String get pillLabel => switch (placement) {
        CampaignPlacement.champion => 'CAMPEÕES',
        CampaignPlacement.runnerUp => 'VICE-CAMPEÕES',
        CampaignPlacement.third => '3º LUGAR',
        CampaignPlacement.none => 'CAMPANHA',
      };

  /// A frase grande (duas linhas), pela colocação.
  String get headline => switch (placement) {
        CampaignPlacement.champion => 'Título\nna conta.',
        CampaignPlacement.runnerUp => 'Vice-\ncampeões.',
        CampaignPlacement.third => 'Pódio\nconquistado.',
        CampaignPlacement.none => 'Jogamos\ncom atitude.',
      };

  /// "Arena CFC · 25–26 ABR" — embaixo do nome do torneio.
  String get eventLine => [
        if (campaign.locationName?.trim().isNotEmpty == true)
          campaign.locationName!.trim(),
        if (campaign.dateRangeLabel?.trim().isNotEmpty == true)
          campaign.dateRangeLabel!.trim(),
      ].join(' · ');
}

/// Linhas de trajetória que cabem no story — menos que no pôster: o story
/// guarda o topo e a base para a interface do Instagram.
const int kCampaignStoryMaxRows = 4;

/// A trajetória do story: igual à do pôster quando cabe; senão o grupo
/// inteiro vira UM resumo e ficam as últimas fases do mata-mata (é a final
/// que conta a história).
List<CampaignRow> campaignStoryRows(List<CampaignRow> rows) {
  if (rows.length <= kCampaignStoryMaxRows) return rows;

  var wins = 0;
  var losses = 0;
  var games = 0;
  final knockout = <CampaignMatchRow>[];
  for (final row in rows) {
    switch (row) {
      case CampaignGroupRow():
        wins += row.wins;
        losses += row.losses;
        games += row.games;
      case CampaignMatchRow(isGroup: true):
        row.won ? wins++ : losses++;
        games++;
      case CampaignMatchRow():
        knockout.add(row);
    }
  }
  if (games == 0) {
    return knockout.sublist(knockout.length - kCampaignStoryMaxRows);
  }
  const room = kCampaignStoryMaxRows - 1;
  return [
    CampaignGroupRow(wins: wins, losses: losses, games: games),
    ...(knockout.length <= room
        ? knockout
        : knockout.sublist(knockout.length - room)),
  ];
}

/// "Oitavas de final" → "Oitavas": a coluna da fase é estreita.
String campaignStoryPhaseLabel(String label) => label
    .replaceFirst(RegExp(r'\s+de\s+final$', caseSensitive: false), '')
    .trim();

/// Chips que fazem sentido para esta campanha: sem partida, sem trajetória;
/// sem nome de equipe, sem a linha da dupla.
List<CampaignStoryInfo> campaignStoryInfosFor(CampaignStoryData data) => [
      if (data.campaign.wins + data.campaign.losses > 0)
        CampaignStoryInfo.record,
      if (data.campaign.rows.isNotEmpty) CampaignStoryInfo.path,
      if (data.campaign.teamName.trim().isNotEmpty) CampaignStoryInfo.team,
      if (data.campaign.tournamentName.trim().isNotEmpty)
        CampaignStoryInfo.event,
    ];

/// Legenda que vai junto do PNG no "Postar no story".
String campaignStoryShareText(CampaignStoryData data) {
  final tournament = data.campaign.tournamentName.trim();
  final where = tournament.isEmpty ? '' : ' no $tournament';
  final lead = switch (data.placement) {
    CampaignPlacement.champion => 'Campeões$where!',
    CampaignPlacement.runnerUp => 'Vice-campeões$where!',
    CampaignPlacement.third => '3º lugar$where!',
    CampaignPlacement.none => 'Nossa campanha$where.',
  };
  final c = data.campaign;
  return withNexaHashtag('$lead ${c.wins}V ${c.losses}D.');
}
