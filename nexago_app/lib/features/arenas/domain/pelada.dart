import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';

import '../../../core/sports/sport_catalog.dart';
import 'arena_booking_labels.dart';
import 'booking_result.dart';
import 'booking_result_record.dart';

/// Peladas (spec "Peladas · 10b/10c/00d"): os placares do pós-jogo vistos como
/// histórico. Tudo aqui é calculado no app a partir de [SavedBookingResult] —
/// posição e saldo saem da mesma [BookingResult.standings] do "Editar placar".

/// Dia da reserva na parede da arena (`dateKey`) — [SavedBookingResult.playedAt]
/// é instante UTC: jogo às 23h em São Paulo cairia no dia seguinte.
DateTime? peladaWallDate(SavedBookingResult s) => s.dateKey.length < 10
    ? null
    : DateTime.tryParse(s.dateKey.substring(0, 10));

/// A pelada do ponto de vista de um jogador.
@immutable
class PeladaMine {
  const PeladaMine({
    required this.team,
    required this.wins,
    required this.losses,
    required this.balance,
    required this.position,
    required this.teamsCount,
    required this.sharedPosition,
    required this.partners,
  });

  final ResultTeam team;
  final int wins;
  final int losses;
  final int balance;
  final int position;
  final int teamsCount;

  /// Empatou com outro time em vitórias, saldo e pontos.
  final bool sharedPosition;

  /// Os outros do time de quem está vendo.
  final List<ResultPlayer> partners;

  int get games => wins + losses;
}

PeladaMine? peladaMineOf(SavedBookingResult saved, String uid) {
  final r = saved.result;
  final team = r.teamOfPlayer(uid);
  if (team == null) return null;
  final rows = r.standings;
  final mine = rows.firstWhere((s) => s.team.id == team.id);
  return PeladaMine(
    team: team,
    wins: mine.wins,
    losses: mine.losses,
    balance: mine.pointDiff,
    position: mine.position,
    teamsCount: r.teams.length,
    sharedPosition: rows.where((s) => s.position == mine.position).length > 1,
    partners: [
      for (final p in team.players)
        if (p.id != uid) p,
    ],
  );
}

enum PeladaStatusTone { confirmed, pending, disputed }

/// `● CONFIRMADO` · `◐ AGUARDANDO 2` · `✕ CONTESTADO`.
({String label, PeladaStatusTone tone}) peladaStatusTag(SavedBookingResult s) =>
    switch (s.status) {
      BookingResultStatus.confirmed => (
          label: '● CONFIRMADO',
          tone: PeladaStatusTone.confirmed,
        ),
      BookingResultStatus.disputed => (
          label: '✕ CONTESTADO',
          tone: PeladaStatusTone.disputed,
        ),
      BookingResultStatus.pending => (
          label: '◐ AGUARDANDO ${s.pendingUids.length}',
          tone: PeladaStatusTone.pending,
        ),
    };

@immutable
class PeladaArenaCount {
  const PeladaArenaCount(this.name, this.count);

  final String name;
  final int count;
}

/// O cartão do topo de 10b e os números do perfil público. Só pelada
/// confirmada conta, menos [pendingCount].
@immutable
class PeladasSummary {
  const PeladasSummary({
    required this.year,
    required this.sessions,
    required this.minutes,
    required this.games,
    required this.wins,
    required this.firstPlaces,
    required this.arenas,
    required this.pendingCount,
  });

  final int year;
  final int sessions;
  final int minutes;
  final int games;
  final int wins;
  final int firstPlaces;

  /// Da mais jogada para a menos.
  final List<PeladaArenaCount> arenas;

  /// Peladas que ainda não contam (pendentes ou contestadas), de qualquer ano.
  final int pendingCount;

  double get winRate => games == 0 ? 0 : wins / games;
  PeladaArenaCount? get topArena => arenas.isEmpty ? null : arenas.first;
}

PeladasSummary peladasSummary(
  List<SavedBookingResult> all,
  String uid, {
  required int year,
}) {
  var sessions = 0;
  var minutes = 0;
  var games = 0;
  var wins = 0;
  var firstPlaces = 0;
  final arenaCounts = <String, int>{};
  var pending = 0;
  for (final s in all) {
    final mine = peladaMineOf(s, uid);
    if (mine == null) continue;
    if (!s.isConfirmed) {
      pending++;
      continue;
    }
    if (peladaWallDate(s)?.year != year) continue;
    sessions++;
    minutes += s.minutes;
    games += mine.games;
    wins += mine.wins;
    if (mine.position == 1) firstPlaces++;
    arenaCounts.update(s.arenaName, (n) => n + 1, ifAbsent: () => 1);
  }
  return PeladasSummary(
    year: year,
    sessions: sessions,
    minutes: minutes,
    games: games,
    wins: wins,
    firstPlaces: firstPlaces,
    arenas: peladaArenaCounts(arenaCounts),
    pendingCount: pending,
  );
}

List<PeladaArenaCount> peladaArenaCounts(Map<String, int> counts) {
  final out = [for (final e in counts.entries) PeladaArenaCount(e.key, e.value)]
    ..sort((a, b) {
      final byCount = b.count.compareTo(a.count);
      return byCount != 0 ? byCount : a.name.compareTo(b.name);
    });
  return out;
}

/// `22h` · `1h30` · `45min`.
String peladaHoursLabel(int minutes) {
  final h = minutes ~/ 60;
  final m = minutes % 60;
  if (h == 0) return '${m}min';
  return m == 0 ? '${h}h' : '${h}h${m.toString().padLeft(2, '0')}';
}

/// Filtro dos chips de 10b: todas, pendentes ou uma arena.
@immutable
class PeladaFilter {
  const PeladaFilter.all()
      : arena = null,
        pending = false;
  const PeladaFilter.pending()
      : arena = null,
        pending = true;
  const PeladaFilter.arena(String this.arena) : pending = false;

  final String? arena;
  final bool pending;

  bool get isAll => arena == null && !pending;

  bool matches(SavedBookingResult s) {
    if (pending) return !s.isConfirmed;
    if (arena != null) return s.arenaName == arena;
    return true;
  }

  @override
  bool operator ==(Object other) =>
      other is PeladaFilter && other.arena == arena && other.pending == pending;

  @override
  int get hashCode => Object.hash(arena, pending);
}

/// As peladas de [uid] (só as em que ele joga), mais recentes primeiro.
List<SavedBookingResult> peladasOf(List<SavedBookingResult> all, String uid) {
  final out = [
    for (final s in all)
      if (s.playedAt != null &&
          peladaWallDate(s) != null &&
          s.result.teamOfPlayer(uid) != null)
        s,
  ]..sort((a, b) => b.playedAt!.compareTo(a.playedAt!));
  return out;
}

/// Contagem por arena dos chips (de tudo que está na lista).
List<PeladaArenaCount> peladaArenaChips(List<SavedBookingResult> list) {
  final counts = <String, int>{};
  for (final s in list) {
    counts.update(s.arenaName, (n) => n + 1, ifAbsent: () => 1);
  }
  return peladaArenaCounts(counts);
}

@immutable
class PeladaMonthGroup {
  const PeladaMonthGroup({
    required this.title,
    required this.summaryLabel,
    required this.items,
  });

  /// `Outubro · 2026`.
  final String title;

  /// `3 horários · 10V 6D`.
  final String summaryLabel;
  final List<SavedBookingResult> items;
}

/// Agrupa por mês (data da reserva, parede da arena), na ordem de [list].
List<PeladaMonthGroup> peladaMonthGroups(
  List<SavedBookingResult> list,
  String uid,
) {
  final groups = <String, List<SavedBookingResult>>{};
  for (final s in list) {
    final at = peladaWallDate(s)!;
    groups.putIfAbsent('${at.year}-${at.month}', () => []).add(s);
  }
  return [
    for (final items in groups.values)
      () {
        final at = peladaWallDate(items.first)!;
        final month = DateFormat('MMMM', 'pt_BR').format(at);
        var w = 0;
        var l = 0;
        for (final s in items) {
          final mine = peladaMineOf(s, uid);
          w += mine?.wins ?? 0;
          l += mine?.losses ?? 0;
        }
        final n = items.length;
        return PeladaMonthGroup(
          title: '${month[0].toUpperCase()}${month.substring(1)} · ${at.year}',
          summaryLabel: '$n ${n == 1 ? 'horário' : 'horários'} · ${w}V ${l}D',
          items: items,
        );
      }(),
  ];
}

/// `SÁB` e `18` da linha.
({String weekday, String day}) peladaDayParts(SavedBookingResult s) {
  final at = peladaWallDate(s)!;
  final weekday = DateFormat(
    'EEE',
    'pt_BR',
  ).format(at).replaceAll('.', '').toUpperCase();
  return (
    weekday: weekday.length > 3 ? weekday.substring(0, 3) : weekday,
    day: at.day.toString().padLeft(2, '0'),
  );
}

/// `08:00–10:00`.
String peladaTimeRange(SavedBookingResult s) {
  String hm(String v) => v.length >= 5 ? v.substring(0, 5) : v;
  return '${hm(s.startTime)}–${hm(s.endTime)}';
}

/// `SÁB 18 OUT · 08:00–10:00` do topo do detalhe.
String peladaHeroDateLine(SavedBookingResult s) =>
    '${formatTicketDateCompact(s.dateKey).replaceAll(' • ', ' ')} · '
    '${peladaTimeRange(s)}';

/// "duplas" · "trios" · "quartetos" · "sextetos" · "times" (misto).
String peladaTeamNoun(BookingResult r) {
  final sizes = {for (final t in r.teams) t.players.length};
  if (sizes.length != 1) return 'times';
  return switch (sizes.single) {
    2 => 'duplas',
    3 => 'trios',
    4 => 'quartetos',
    6 => 'sextetos',
    _ => 'times',
  };
}

/// `Quadra 2 · Vôlei de praia · 4 duplas, rei da quadra`.
String peladaFormatLine(SavedBookingResult s) {
  final r = s.result;
  final sport = SportCatalog.labelOf(s.sport);
  final format = r.isRotation
      ? '${r.teams.length} ${peladaTeamNoun(r)}, rei da quadra'
      : '2 ${peladaTeamNoun(r)}';
  return [
    if (s.courtName != null) s.courtName!,
    if (sport != null) sport,
    format,
  ].join(' · ');
}

/// "Você venceu a pelada" · "Você ficou em 2º" · "Você empatou em 2º".
String peladaHeroTitle(PeladaMine mine) {
  if (mine.sharedPosition) return 'Você empatou em ${mine.position}º';
  if (mine.position == 1) return 'Você venceu a pelada';
  return 'Você ficou em ${mine.position}º';
}

/// "com Enzo · 7 jogos" (ou só os jogos, sozinho no time).
String peladaHeroSubtitle(PeladaMine mine) {
  final games = '${mine.games} ${mine.games == 1 ? 'jogo' : 'jogos'}';
  if (mine.partners.isEmpty) return games;
  final names = [for (final p in mine.partners) p.firstName];
  final withWho = names.length == 1
      ? names.single
      : '${names.sublist(0, names.length - 1).join(', ')} e ${names.last}';
  return 'com $withWho · $games';
}

/// `+18` · `−9` · `0` (sinal tipográfico, como no protótipo).
String peladaBalanceLabel(int balance) =>
    balance > 0 ? '+$balance' : (balance < 0 ? '−${-balance}' : '0');

/// Jogos do time de [uid], na ordem do placar (para "Seus jogos").
List<({int order, ResultGame game})> peladaMyGames(
  SavedBookingResult s,
  String uid,
) {
  final team = s.result.teamOfPlayer(uid);
  if (team == null) return const [];
  return [
    for (var i = 0; i < s.result.games.length; i++)
      if (s.result.games[i].involves(team.id))
        (order: i + 1, game: s.result.games[i]),
  ];
}

/// "R$ 30 por pessoa" — valor da reserva dividido por quem está no placar.
String? peladaPricePerPerson(SavedBookingResult s) {
  final amount = s.bookingAmountReais;
  if (amount == null || amount <= 0 || s.playerCount == 0) return null;
  final each = amount / s.playerCount;
  final f = NumberFormat.currency(
    locale: 'pt_BR',
    symbol: r'R$',
    decimalDigits: each == each.roundToDouble() ? 0 : 2,
  );
  return '${f.format(each)} por pessoa';
}

/// Motivos rápidos da contestação (spec 10c).
const List<String> kPeladaDisputeReasons = [
  'Placar errado',
  'Não joguei',
  'Dupla errada',
];

/// O motivo que vai para a callable: o chip, o texto, ou os dois.
String? peladaDisputeReason({String? chip, String text = ''}) {
  final free = text.trim().replaceAll(RegExp(r'\s+'), ' ');
  final parts = [if (chip != null) chip, if (free.isNotEmpty) free];
  final reason = parts.join(': ');
  if (reason.length < 3) return null;
  return reason.length > 140 ? reason.substring(0, 140) : reason;
}

/// "Você & Enzo": o time de [uid] com o próprio nome trocado (nome dado ao time
/// fica como está).
String peladaTeamNameFor(ResultTeam team, String uid) {
  final custom = team.customName?.trim() ?? '';
  if (custom.isNotEmpty) return custom;
  final names = [
    for (final p in team.players) p.id == uid ? 'Você' : p.firstName,
  ];
  if (names.isEmpty) return team.name;
  if (names.length == 1) return names.single;
  return '${names.sublist(0, names.length - 1).join(', ')} & ${names.last}';
}
