import 'package:flutter/foundation.dart';

import '../../../core/brand/nexa_hashtag.dart';
import '../../../core/profiles/app_user_profile.dart';
import '../../../core/sports/sport_catalog.dart';
import 'booking_story.dart';
import 'my_booking_confirmed_athlete.dart';

/// Placar do pós-jogo (protótipo "Reservar · 6 · Pós-jogo"). Vive só na tela:
/// vira a arte do story e não é gravado em lugar nenhum.

/// Informações que o atleta liga/desliga na arte do pós-jogo.
enum BookingResultInfo {
  score('Placar'),
  sets('Sets'),
  duration('Duração'),
  arenaDate('Arena e data');

  const BookingResultInfo(this.label);

  final String label;
}

/// Tamanhos de time do "Adicionar dupla / trio / quarteto".
enum BookingResultFormation {
  pair(2, 'Dupla'),
  trio(3, 'Trio'),
  quartet(4, 'Quarteto'),
  sextet(6, 'Sexteto');

  const BookingResultFormation(this.size, this.label);

  final int size;
  final String label;

  /// O tamanho exato, ou o menor que comporta [players].
  static BookingResultFormation forPlayers(int players) {
    for (final f in values) {
      if (f.size >= players) return f;
    }
    return values.last;
  }
}

/// Um jogador do placar: atleta do app (id = uid) ou avulso (id `guest:…`).
@immutable
class ResultPlayer {
  const ResultPlayer({required this.id, required this.name, this.avatarUrl});

  final String id;
  final String name;
  final String? avatarUrl;

  bool get isGuest => id.startsWith('guest:');
  String get firstName => name.trim().split(RegExp(r'\s+')).first;
  String get initials => initialsFromDisplayName(name);

  BookingStoryPerson toStoryPerson() => BookingStoryPerson(
        firstName: firstName,
        initials: initials,
        avatarUrl: avatarUrl,
      );

  @override
  bool operator ==(Object other) => other is ResultPlayer && other.id == id;

  @override
  int get hashCode => id.hashCode;
}

@immutable
class ResultTeam {
  const ResultTeam(
      {required this.id, this.players = const [], this.customName});

  final int id;
  final List<ResultPlayer> players;

  /// "Renomear"; `null` = nome automático pelos jogadores.
  final String? customName;

  String get name {
    final custom = customName?.trim() ?? '';
    if (custom.isNotEmpty) return custom;
    final auto = resultTeamAutoName(players);
    return auto.isEmpty ? 'Adversários' : auto;
  }

  ResultTeam copyWith({List<ResultPlayer>? players, String? customName}) =>
      ResultTeam(
        id: id,
        players: players ?? this.players,
        customName: customName ?? this.customName,
      );
}

/// "Maria & Enzo" · "Ana, Bia & Carol" — primeiros nomes, como no protótipo.
String resultTeamAutoName(List<ResultPlayer> players) {
  final names = [for (final p in players) p.firstName];
  if (names.isEmpty) return '';
  if (names.length == 1) return names.single;
  return '${names.sublist(0, names.length - 1).join(', ')} & ${names.last}';
}

/// Um set (dois times) ou um jogo da rotação (três ou mais times).
@immutable
class ResultGame {
  const ResultGame({
    required this.teamA,
    required this.teamB,
    this.scoreA = 0,
    this.scoreB = 0,
  });

  final int teamA;
  final int teamB;
  final int scoreA;
  final int scoreB;

  /// `null` empatado (inclusive 0×0, ainda sem placar).
  int? get winner =>
      scoreA == scoreB ? null : (scoreA > scoreB ? teamA : teamB);

  bool involves(int teamId) => teamA == teamId || teamB == teamId;

  int scoreOf(int teamId) => teamId == teamA ? scoreA : scoreB;

  ResultGame copyWith({int? teamA, int? teamB, int? scoreA, int? scoreB}) =>
      ResultGame(
        teamA: teamA ?? this.teamA,
        teamB: teamB ?? this.teamB,
        scoreA: scoreA ?? this.scoreA,
        scoreB: scoreB ?? this.scoreB,
      );
}

/// Linha da classificação: vitórias, depois saldo de pontos.
@immutable
class ResultStanding {
  const ResultStanding({
    required this.team,
    required this.wins,
    required this.pointDiff,
  });

  final ResultTeam team;
  final int wins;
  final int pointDiff;
}

@immutable
class BookingResult {
  const BookingResult({required this.teams, required this.games});

  final List<ResultTeam> teams;
  final List<ResultGame> games;

  /// Três ou mais times: rotação ("Jogos" e classificação), sem sets.
  bool get isRotation => teams.length > 2;

  /// Já tem algum ponto lançado.
  bool get hasScore => games.any((g) => g.scoreA > 0 || g.scoreB > 0);

  ResultTeam? teamById(int id) {
    for (final t in teams) {
      if (t.id == id) return t;
    }
    return null;
  }

  int get _nextTeamId => teams.fold(-1, (m, t) => t.id > m ? t.id : m) + 1;

  List<ResultStanding> get standings {
    final rows = [
      for (final team in teams)
        ResultStanding(
          team: team,
          wins: games.where((g) => g.winner == team.id).length,
          pointDiff: games.where((g) => g.involves(team.id)).fold(0, (sum, g) {
            final mine = g.scoreOf(team.id);
            final theirs = g.teamA == team.id ? g.scoreB : g.scoreA;
            return sum + mine - theirs;
          }),
        ),
    ];
    // Estável: empate total mantém a ordem dos times.
    final indexed = rows.asMap().entries.toList()
      ..sort((x, y) {
        final byWins = y.value.wins.compareTo(x.value.wins);
        if (byWins != 0) return byWins;
        final byDiff = y.value.pointDiff.compareTo(x.value.pointDiff);
        return byDiff != 0 ? byDiff : x.key.compareTo(y.key);
      });
    return [for (final e in indexed) e.value];
  }

  /// Quem está na frente; `null` sem vitória ou empatado com o segundo em
  /// vitórias e saldo.
  int? get leaderId {
    final rows = standings;
    if (rows.isEmpty || rows.first.wins == 0) return null;
    if (rows.length > 1 &&
        rows[0].wins == rows[1].wins &&
        rows[0].pointDiff == rows[1].pointDiff) {
      return null;
    }
    return rows.first.team.id;
  }

  /// Vitórias de cada time (sets, com dois times).
  int winsOf(int teamId) => games.where((g) => g.winner == teamId).length;

  BookingResult updateGame(int index, ResultGame game) => BookingResult(
        teams: teams,
        games: [
          for (var i = 0; i < games.length; i++) i == index ? game : games[i]
        ],
      );

  BookingResult removeGame(int index) => BookingResult(
        teams: teams,
        games: [
          for (var i = 0; i < games.length; i++)
            if (i != index) games[i],
        ],
      );

  /// Novo set com os mesmos dois times; na rotação, quem venceu o último
  /// fica e enfrenta o próximo que estava fora (rei da quadra).
  BookingResult addGame() {
    if (teams.length < 2) return this;
    final ids = [for (final t in teams) t.id];
    var a = ids[0];
    var b = ids[1];
    final last = games.isEmpty ? null : games.last;
    if (last != null && isRotation) {
      final stays = last.scoreA >= last.scoreB ? last.teamA : last.teamB;
      final left = last.teamA == stays ? last.teamB : last.teamA;
      // Próximo da fila depois de quem saiu, pulando quem fica.
      final start = ids.indexOf(left);
      a = stays;
      b = left;
      for (var step = 1; step < ids.length; step++) {
        final candidate = ids[(start + step) % ids.length];
        if (candidate != stays) {
          b = candidate;
          break;
        }
      }
    } else if (last != null) {
      a = last.teamA;
      b = last.teamB;
    }
    return BookingResult(
      teams: teams,
      games: [...games, ResultGame(teamA: a, teamB: b)],
    );
  }

  /// Troca o time de um lado do jogo pelo próximo da lista (só na rotação),
  /// sem repetir o time do outro lado.
  BookingResult cycleTeam(int index, {required bool sideA}) {
    final game = games[index];
    final other = sideA ? game.teamB : game.teamA;
    final ids = [for (final t in teams) t.id]..remove(other);
    if (ids.length < 2) return this;
    final current = sideA ? game.teamA : game.teamB;
    final next = ids[(ids.indexOf(current) + 1) % ids.length];
    return updateGame(
      index,
      sideA ? game.copyWith(teamA: next) : game.copyWith(teamB: next),
    );
  }

  /// Time novo (vem do "Adicionar dupla") com o próximo id livre.
  BookingResult addTeam(List<ResultPlayer> players, {String? customName}) =>
      BookingResult(
        teams: [
          ...teams,
          ResultTeam(
            id: _nextTeamId,
            players: players,
            customName: customName,
          ),
        ],
        games: games,
      );

  BookingResult replaceTeam(ResultTeam team) => BookingResult(
        teams: [for (final t in teams) t.id == team.id ? team : t],
        games: games,
      );

  /// Remove o time e os jogos dele; com dois times não remove (sobra placar
  /// sem adversário). Sem jogo nenhum, abre um set novo.
  BookingResult removeTeam(int teamId) {
    if (teams.length <= 2) return this;
    final next = BookingResult(
      teams: [
        for (final t in teams)
          if (t.id != teamId) t,
      ],
      games: [
        for (final g in games)
          if (!g.involves(teamId)) g,
      ],
    );
    return next.games.isEmpty ? next.addGame() : next;
  }

  /// Em que time cada jogador está (para o "Já em …" do montar time).
  ResultTeam? teamOfPlayer(String playerId) {
    for (final t in teams) {
      if (t.players.any((p) => p.id == playerId)) return t;
    }
    return null;
  }
}

/// Quem estava na reserva, para montar os times: quem reservou primeiro, depois
/// os confirmados, sem repetir. Confirmado sem conta vira avulso.
List<ResultPlayer> bookingResultCrew({
  String? ownerUid,
  String? ownerName,
  String? ownerAvatarUrl,
  Iterable<MyBookingConfirmedAthlete> confirmed = const [],
}) {
  final crew = <ResultPlayer>[];
  void add(String? uid, String? name, String? avatarUrl) {
    final display = name?.trim() ?? '';
    if (display.isEmpty) return;
    final id = (uid?.trim().isNotEmpty ?? false)
        ? uid!.trim()
        : 'guest:${display.toLowerCase()}';
    if (crew.any((p) => p.id == id)) return;
    crew.add(
      ResultPlayer(
        id: id,
        name: display,
        avatarUrl: (avatarUrl?.trim() ?? '').isEmpty ? null : avatarUrl,
      ),
    );
  }

  add(ownerUid, ownerName, ownerAvatarUrl);
  for (final a in confirmed) {
    add(a.userId, a.displayName, a.avatarUrl);
  }
  return crew;
}

/// Placar inicial pela galera da reserva: metade de cada lado, quem reservou
/// no primeiro time, um set 0×0. Sozinho na reserva, o outro lado é
/// "Adversários" até o atleta montar o time.
BookingResult initialBookingResult(List<ResultPlayer> crew) {
  final half = (crew.length / 2).ceil();
  final teamA = ResultTeam(id: 0, players: crew.take(half).toList());
  final teamB = ResultTeam(id: 1, players: crew.skip(half).toList());
  return BookingResult(
    teams: [teamA, teamB],
    games: const [ResultGame(teamA: 0, teamB: 1)],
  );
}

/// O time de quem posta: o que tem [playerId], senão o primeiro.
int resultOwnerTeamId(BookingResult result, String? playerId) {
  final team = playerId == null ? null : result.teamOfPlayer(playerId);
  return team?.id ?? result.teams.first.id;
}

/// VITÓRIA / DERROTA / EMPATE do ponto de vista de [ownerTeamId] — só com
/// dois times e algum ponto lançado.
String? bookingResultOutcome(BookingResult result, int ownerTeamId) {
  if (result.isRotation || !result.hasScore) return null;
  final other = result.teams.firstWhere((t) => t.id != ownerTeamId).id;
  final mine = result.winsOf(ownerTeamId);
  final theirs = result.winsOf(other);
  if (mine == theirs) return 'EMPATE';
  return mine > theirs ? 'VITÓRIA' : 'DERROTA';
}

/// `21–18 · 17–21 · 15–12` pela ordem dos times da lista.
String bookingResultSetsLine(BookingResult result) {
  final first = result.teams.first.id;
  return [
    for (final g in result.games)
      g.teamA == first ? '${g.scoreA}–${g.scoreB}' : '${g.scoreB}–${g.scoreA}',
  ].join(' · ');
}

/// "Jogaço na areia." nos esportes de areia e no esporte desconhecido (o
/// app nasceu na areia); "na quadra." nos outros.
String bookingResultHeadline(String? sport) {
  const indoor = {
    'indoorVolleyball',
    'football',
    'basketball',
    'tennis',
    'padel',
    'running',
  };
  final code = SportCatalog.resolve(sport)?.code;
  return indoor.contains(code) ? 'Jogaço\nna quadra.' : 'Jogaço\nna areia.';
}

/// `1h30` · `2h` · `45min` — o tempo reservado, que é o "em quadra" da arte.
String bookingResultDuration(String start, String end) {
  int? minutes(String hm) {
    final parts = hm.trim().split(':');
    final h = int.tryParse(parts.first);
    if (h == null) return null;
    final m = parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0;
    return h * 60 + m;
  }

  final s = minutes(start);
  var e = minutes(end);
  if (s == null || e == null) return '';
  if (e <= s) e += 24 * 60;
  final total = e - s;
  final h = total ~/ 60;
  final m = total % 60;
  if (h == 0) return '${m}min';
  if (m == 0) return '${h}h';
  return '${h}h${m.toString().padLeft(2, '0')}';
}

/// Legenda da folha de compartilhamento.
String bookingResultShareText(BookingResult result, String arenaName) {
  if (result.isRotation) {
    final leader =
        result.leaderId == null ? null : result.teamById(result.leaderId!);
    return withNexaHashtag(
      leader == null
          ? 'Fim de jogo na $arenaName!'
          : 'Fim de jogo na $arenaName — ${leader.name} na frente!',
    );
  }
  final a = result.teams[0];
  final b = result.teams[1];
  return withNexaHashtag(
    'Fim de jogo na $arenaName: ${a.name} ${result.winsOf(a.id)}–'
    '${result.winsOf(b.id)} ${b.name} (${bookingResultSetsLine(result)})',
  );
}
