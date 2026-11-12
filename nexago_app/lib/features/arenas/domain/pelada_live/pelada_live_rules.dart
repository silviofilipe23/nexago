import 'package:flutter/foundation.dart';

import '../../../../core/sports/sport_catalog.dart';

/// Família de marcador da pelada ao vivo — cada esporte cai numa.
enum PeladaLiveMode {
  /// Sets por pontos corridos (vôlei de praia, futevôlei, vôlei de quadra).
  setsPoints,

  /// Sets de games 0/15/30/40 (beach tennis, padel, tênis).
  setsGames,

  /// Gols, com cronômetro e limite de gols (futebol).
  goals,

  /// Cestas de 1/2(/3) pontos, alvo e cronômetro (basquete).
  baskets,

  /// +1 por ponto, alvo e tempo opcionais (os outros esportes).
  points,
}

/// Regras da pelada marcada ao vivo. O padrão vem do esporte da reserva
/// ([PeladaLiveRules.forSport]); o atleta ajusta na tela de regras.
@immutable
class PeladaLiveRules {
  const PeladaLiveRules({
    required this.mode,
    this.bestOf = 1,
    this.setTarget = 21,
    this.decidingSetTarget = 15,
    this.winByTwo = true,
    this.courtSwitch = false,
    this.gamesPerSet = 6,
    this.noAd = true,
    this.tiebreak = true,
    this.superTiebreak = true,
    this.minutes,
    this.limit,
    this.threePointers = false,
  });

  final PeladaLiveMode mode;

  /// 1 ou 3. Só os modos de set usam; o resto é sempre um jogo só.
  final int bestOf;

  // Sets por pontos.
  final int setTarget;
  final int decidingSetTarget;
  final bool winByTwo;

  /// Avisa a troca de lado (vôlei de praia: a cada 7; a cada 5 no set de 15).
  final bool courtSwitch;

  // Sets de games.
  final int gamesPerSet;

  /// 40–40 vira ponto de ouro (sem vantagem).
  final bool noAd;

  /// Tie-break até 7 quando o set empata no número de games.
  final bool tiebreak;

  /// Set decisivo vira super tie-break até 10 (só com [bestOf] 3).
  final bool superTiebreak;

  // Gols, cestas e pontos.
  /// Duração do jogo; `null` = sem cronômetro.
  final int? minutes;

  /// Gols para encerrar (futebol) ou o "jogo até" (cestas e pontos);
  /// `null` = sem limite.
  final int? limit;

  /// Basquete 5x5: cesta de 3 além de 1 e 2.
  final bool threePointers;

  static const int tiebreakTo = 7;
  static const int superTiebreakTo = 10;

  bool get usesSets =>
      mode == PeladaLiveMode.setsPoints || mode == PeladaLiveMode.setsGames;

  bool get timed => !usesSets && minutes != null;

  /// Valores dos botões de cada time: um toque na metade vale o primeiro.
  List<int> get pointValues => switch (mode) {
        PeladaLiveMode.baskets =>
          threePointers ? const [1, 2, 3] : const [1, 2],
        _ => const [1],
      };

  /// Perfil do núcleo de regras (o mesmo da mesa do organizador) nos modos de
  /// set; `null` nos outros.
  ScoringProfile? get profile => switch (mode) {
        PeladaLiveMode.setsPoints => SetsPointsProfile(
            bestOf: bestOf,
            setTarget: setTarget,
            decidingSetTarget: bestOf > 1 ? decidingSetTarget : setTarget,
            winBy: winByTwo ? 2 : 1,
            pointCap: null,
          ),
        PeladaLiveMode.setsGames => SetsGamesProfile(
            bestOf: bestOf,
            gamesPerSet: gamesPerSet,
            winByGames: 2,
            tiebreakAtGames: tiebreak ? gamesPerSet : null,
            tiebreakTo: tiebreakTo,
            noAd: noAd,
            decidingSet: bestOf > 1 && superTiebreak
                ? DecidingSet.superTiebreak
                : DecidingSet.full,
            superTiebreakTo: superTiebreakTo,
          ),
        _ => null,
      };

  /// A cada quantos pontos somados do set a dupla troca de lado: 7 nos sets
  /// longos, 5 nos de 15 ou menos. `null` sem aviso.
  int? courtSwitchEvery(int setIndex) {
    if (mode != PeladaLiveMode.setsPoints || !courtSwitch) return null;
    final deciding = bestOf > 1 && setIndex == bestOf - 1;
    final target = deciding ? decidingSetTarget : setTarget;
    return target <= 15 ? 5 : 7;
  }

  /// Padrão do esporte da reserva. Sem esporte (ou um que não está no
  /// catálogo), o marcador de pontos simples.
  static PeladaLiveRules forSport(String? sport) {
    final entry = SportCatalog.resolve(sport);
    final code = entry?.code;
    if (code == 'football') {
      return const PeladaLiveRules(
        mode: PeladaLiveMode.goals,
        minutes: 10,
        limit: 2,
      );
    }
    if (code == 'basketball') {
      return const PeladaLiveRules(
        mode: PeladaLiveMode.baskets,
        minutes: 10,
        limit: 21,
      );
    }
    final p = entry?.scoringProfile;
    if (p is SetsPointsProfile) {
      return PeladaLiveRules(
        mode: PeladaLiveMode.setsPoints,
        bestOf: p.bestOf > 1 ? 3 : 1,
        setTarget: p.setTarget,
        decidingSetTarget: p.decidingSetTarget,
        winByTwo: p.winBy >= 2,
        courtSwitch: code == 'beachVolleyball',
      );
    }
    if (p is SetsGamesProfile) {
      return PeladaLiveRules(
        mode: PeladaLiveMode.setsGames,
        bestOf: p.bestOf > 1 ? 3 : 1,
        gamesPerSet: p.gamesPerSet,
        noAd: p.noAd,
        tiebreak: p.tiebreakAtGames != null,
        superTiebreak: p.decidingSet == DecidingSet.superTiebreak,
      );
    }
    return const PeladaLiveRules(mode: PeladaLiveMode.points);
  }

  /// Rei da quadra (três ou mais times): cada jogo é um set só.
  PeladaLiveRules forRotation() => bestOf == 1 ? this : copyWith(bestOf: 1);

  /// "set até 21 · decisivo 15 · troca a cada 7" — o subtítulo do placar.
  String get summary {
    switch (mode) {
      case PeladaLiveMode.setsPoints:
        return [
          bestOf > 1 ? 'melhor de $bestOf' : '1 set',
          'até $setTarget',
          if (bestOf > 1) 'decisivo $decidingSetTarget',
          if (!winByTwo) 'sem vantagem de 2',
        ].join(' · ');
      case PeladaLiveMode.setsGames:
        return [
          bestOf > 1 ? 'melhor de $bestOf' : '1 set',
          '$gamesPerSet games',
          if (noAd) 'ponto de ouro',
          if (bestOf > 1 && superTiebreak) 'super tie-break',
        ].join(' · ');
      case PeladaLiveMode.goals:
        return [
          minutes == null ? 'sem tempo' : '$minutes min',
          if (limit != null) '$limit ${limit == 1 ? 'gol' : 'gols'}',
        ].join(' ou ');
      case PeladaLiveMode.baskets:
      case PeladaLiveMode.points:
        return [
          if (mode == PeladaLiveMode.baskets) threePointers ? '5x5' : '3x3',
          if (limit != null) 'até $limit',
          if (minutes != null) '$minutes min',
        ].join(' · ');
    }
  }

  PeladaLiveRules copyWith({
    PeladaLiveMode? mode,
    int? bestOf,
    int? setTarget,
    int? decidingSetTarget,
    bool? winByTwo,
    bool? courtSwitch,
    int? gamesPerSet,
    bool? noAd,
    bool? tiebreak,
    bool? superTiebreak,
    int? Function()? minutes,
    int? Function()? limit,
    bool? threePointers,
  }) =>
      PeladaLiveRules(
        mode: mode ?? this.mode,
        bestOf: bestOf ?? this.bestOf,
        setTarget: setTarget ?? this.setTarget,
        decidingSetTarget: decidingSetTarget ?? this.decidingSetTarget,
        winByTwo: winByTwo ?? this.winByTwo,
        courtSwitch: courtSwitch ?? this.courtSwitch,
        gamesPerSet: gamesPerSet ?? this.gamesPerSet,
        noAd: noAd ?? this.noAd,
        tiebreak: tiebreak ?? this.tiebreak,
        superTiebreak: superTiebreak ?? this.superTiebreak,
        minutes: minutes != null ? minutes() : this.minutes,
        limit: limit != null ? limit() : this.limit,
        threePointers: threePointers ?? this.threePointers,
      );

  Map<String, Object?> toJson() => {
        'mode': mode.name,
        'bestOf': bestOf,
        'setTarget': setTarget,
        'decidingSetTarget': decidingSetTarget,
        'winByTwo': winByTwo,
        'courtSwitch': courtSwitch,
        'gamesPerSet': gamesPerSet,
        'noAd': noAd,
        'tiebreak': tiebreak,
        'superTiebreak': superTiebreak,
        'minutes': minutes,
        'limit': limit,
        'threePointers': threePointers,
      };

  /// `null` se o modo não for conhecido (rascunho de outra versão).
  static PeladaLiveRules? fromJson(Object? raw) {
    if (raw is! Map) return null;
    PeladaLiveMode? mode;
    for (final m in PeladaLiveMode.values) {
      if (m.name == raw['mode']) mode = m;
    }
    if (mode == null) return null;
    int intOr(Object? v, int fallback) => v is int && v > 0 ? v : fallback;
    int? optInt(Object? v) => v is int && v > 0 ? v : null;
    bool boolOr(Object? v, bool fallback) => v is bool ? v : fallback;
    return PeladaLiveRules(
      mode: mode,
      bestOf: raw['bestOf'] == 3 ? 3 : 1,
      setTarget: intOr(raw['setTarget'], 21),
      decidingSetTarget: intOr(raw['decidingSetTarget'], 15),
      winByTwo: boolOr(raw['winByTwo'], true),
      courtSwitch: boolOr(raw['courtSwitch'], false),
      gamesPerSet: intOr(raw['gamesPerSet'], 6),
      noAd: boolOr(raw['noAd'], true),
      tiebreak: boolOr(raw['tiebreak'], true),
      superTiebreak: boolOr(raw['superTiebreak'], true),
      minutes: optInt(raw['minutes']),
      limit: optInt(raw['limit']),
      threePointers: boolOr(raw['threePointers'], false),
    );
  }

  @override
  bool operator ==(Object other) =>
      other is PeladaLiveRules && mapEquals(other.toJson(), toJson());

  @override
  int get hashCode => Object.hashAll(toJson().values);
}
