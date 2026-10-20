import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

import '../../../core/time/nexago_event_timezone.dart';
import 'booking_result.dart';
import 'booking_story.dart';

/// Placar do pós-jogo gravado em `bookingResults/{bookingId}` pelas callables
/// `saveBookingResult` / `respondBookingResult`. Quem lança é o dono da
/// reserva; quem tem conta nos outros times confirma ou contesta. Só depois de
/// confirmado ele conta no histórico (nunca no ranking).
enum BookingResultStatus { pending, confirmed, disputed }

BookingResultStatus _statusFrom(Object? raw) => switch (raw) {
      'confirmed' => BookingResultStatus.confirmed,
      'disputed' => BookingResultStatus.disputed,
      _ => BookingResultStatus.pending,
    };

@immutable
class SavedBookingResult {
  const SavedBookingResult({
    required this.bookingId,
    required this.arenaName,
    required this.dateKey,
    required this.startTime,
    required this.endTime,
    required this.createdBy,
    required this.createdByName,
    required this.result,
    required this.opponentUids,
    required this.status,
    required this.version,
    this.courtName,
    this.sport,
    this.respondedBy,
    this.respondedByName,
  });

  final String bookingId;
  final String arenaName;
  final String? courtName;
  final String? sport;
  final String dateKey;
  final String startTime;
  final String endTime;
  final String createdBy;
  final String createdByName;
  final BookingResult result;

  /// Quem tem conta fora do time de quem lançou — são eles que confirmam.
  final List<String> opponentUids;
  final BookingResultStatus status;

  /// Sobe a cada "Salvar placar"; a resposta leva a versão que o adversário viu.
  final int version;
  final String? respondedBy;
  final String? respondedByName;

  static SavedBookingResult? fromFirestore(String id, Map<String, dynamic> d) {
    String s(Object? v) => v is String ? v.trim() : '';
    final createdBy = s(d['createdBy']);
    final rawTeams = d['teams'];
    final rawGames = d['games'];
    if (createdBy.isEmpty || rawTeams is! List || rawGames is! List) {
      return null;
    }
    final teams = <ResultTeam>[
      for (final t in rawTeams)
        if (t is Map && t['id'] is num)
          ResultTeam(
            id: (t['id'] as num).toInt(),
            customName: s(t['customName']).isEmpty ? null : s(t['customName']),
            players: [
              for (final p
                  in (t['players'] is List ? t['players'] as List : []))
                if (p is Map && s(p['id']).isNotEmpty)
                  ResultPlayer(
                    id: s(p['id']),
                    name: s(p['name']).isEmpty ? 'Atleta' : s(p['name']),
                    avatarUrl:
                        s(p['avatarUrl']).isEmpty ? null : s(p['avatarUrl']),
                  ),
            ],
          ),
    ];
    final games = <ResultGame>[
      for (final g in rawGames)
        if (g is Map &&
            g['teamA'] is num &&
            g['teamB'] is num &&
            g['scoreA'] is num &&
            g['scoreB'] is num)
          ResultGame(
            teamA: (g['teamA'] as num).toInt(),
            teamB: (g['teamB'] as num).toInt(),
            scoreA: (g['scoreA'] as num).toInt(),
            scoreB: (g['scoreB'] as num).toInt(),
          ),
    ];
    if (teams.length < 2 || games.isEmpty) return null;
    return SavedBookingResult(
      bookingId: s(d['bookingId']).isEmpty ? id : s(d['bookingId']),
      arenaName: s(d['arenaName']).isEmpty ? 'Arena' : s(d['arenaName']),
      courtName: s(d['courtName']).isEmpty ? null : s(d['courtName']),
      sport: s(d['sport']).isEmpty ? null : s(d['sport']),
      dateKey: s(d['dateKey']),
      startTime: s(d['startTime']),
      endTime: s(d['endTime']),
      createdBy: createdBy,
      createdByName:
          s(d['createdByName']).isEmpty ? 'Atleta' : s(d['createdByName']),
      result: BookingResult(teams: teams, games: games),
      opponentUids: [
        for (final u
            in (d['opponentUids'] is List ? d['opponentUids'] as List : []))
          if (u is String && u.isNotEmpty) u,
      ],
      status: _statusFrom(d['status']),
      version: (d['version'] as num?)?.toInt() ?? 0,
      respondedBy: s(d['respondedBy']).isEmpty ? null : s(d['respondedBy']),
      respondedByName:
          s(d['respondedByName']).isEmpty ? null : s(d['respondedByName']),
    );
  }

  static SavedBookingResult? fromDoc(
      DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data();
    return data == null ? null : fromFirestore(doc.id, data);
  }

  bool get isConfirmed => status == BookingResultStatus.confirmed;

  /// O adversário [uid] ainda precisa confirmar ou contestar.
  bool awaitsResponseFrom(String uid) =>
      status == BookingResultStatus.pending && opponentUids.contains(uid);

  /// Instante do início (parede SP), para ordenar no histórico.
  DateTime? get playedAt {
    final day = nexagoEventDayKeyAnchor(dateKey);
    if (day == null) return null;
    final parts = startTime.split(':');
    final h = int.tryParse(parts.first) ?? 0;
    final m = parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0;
    return day.add(Duration(hours: h, minutes: m));
  }

  /// Para reabrir o pós-jogo a partir do histórico.
  BookingStoryArgs toStoryArgs() => BookingStoryArgs(
        bookingId: bookingId,
        arenaName: arenaName,
        courtName: courtName ?? '',
        dateKey: dateKey,
        startTime: startTime,
        endTime: endTime,
      );

  /// Primeiros nomes de quem confirma, pela ordem dos times.
  List<String> get opponentFirstNames => [
        for (final t in result.teams)
          for (final p in t.players)
            if (opponentUids.contains(p.id)) p.firstName,
      ];
}

/// O que vai para a callable `saveBookingResult`. O nome de quem tem conta é
/// ignorado no servidor (vem do perfil); só o do avulso vale.
Map<String, Object?> bookingResultPayload(String bookingId, BookingResult r) =>
    {
      'bookingId': bookingId,
      'teams': [
        for (final t in r.teams)
          {
            'id': t.id,
            'customName': t.customName?.trim() ?? '',
            'players': [
              for (final p in t.players) {'id': p.id, 'name': p.name},
            ],
          },
      ],
      'games': [
        for (final g in r.games)
          {
            'teamA': g.teamA,
            'teamB': g.teamB,
            'scoreA': g.scoreA,
            'scoreB': g.scoreB,
          },
      ],
    };

/// Quem tem conta fora do time de [ownerPlayerId] — quem vai receber o placar
/// para confirmar (avulso não confirma).
List<ResultPlayer> bookingResultConfirmers(
  BookingResult result,
  String? ownerPlayerId,
) {
  final mine = resultOwnerTeamId(result, ownerPlayerId);
  return [
    for (final t in result.teams)
      if (t.id != mine)
        for (final p in t.players)
          if (!p.isGuest) p,
  ];
}

/// "Rafael" · "Rafael e Lia" · "Rafael, Lia +2" (como no protótipo).
String bookingResultNamesLine(List<String> names) {
  if (names.isEmpty) return '';
  if (names.length > 2)
    return '${names.take(2).join(', ')} +${names.length - 2}';
  return names.join(' e ');
}

/// O aviso do "Editar placar": quem recebe o placar e quando ele passa a contar.
/// `names` vazio = só tem avulso do outro lado.
({String names, String rest}) bookingResultSaveNotice(List<String> names) {
  if (names.isEmpty) {
    return (
      names: '',
      rest:
          'Ninguém do outro lado tem conta no nexaGO para confirmar: o placar '
          'fica salvo, mas não conta no seu histórico.',
    );
  }
  final verb = names.length == 1 ? 'recebe' : 'recebem';
  return (
    names: bookingResultNamesLine(names),
    rest:
        ' $verb o placar para confirmar. Só depois ele conta no seu histórico.',
  );
}

/// Linha de estado do placar salvo, do ponto de vista de quem lançou.
String bookingResultStatusLine(SavedBookingResult saved) {
  final who = saved.respondedByName?.trim().split(RegExp(r'\s+')).first ?? '';
  return switch (saved.status) {
    BookingResultStatus.confirmed => who.isEmpty
        ? 'Confirmado · já conta no seu histórico'
        : 'Confirmado por $who · já conta no seu histórico',
    BookingResultStatus.disputed => who.isEmpty
        ? 'Contestado · corrija e envie de novo'
        : '$who contestou · corrija e envie de novo',
    BookingResultStatus.pending => saved.opponentUids.isEmpty
        ? 'Sem adversário com conta para confirmar · não conta no histórico'
        : 'Aguardando ${bookingResultNamesLine(saved.opponentFirstNames)} '
            'confirmar',
  };
}

/// Estado do placar para quem está vendo ([uid]): adversário que ainda
/// responde, companheiro, ou quem lançou.
String bookingResultViewerStatusLine(SavedBookingResult saved, String uid) {
  if (uid == saved.createdBy) return bookingResultStatusLine(saved);
  final who = saved.respondedByName?.trim().split(RegExp(r'\s+')).first ?? '';
  final creator = saved.createdByName.trim().split(RegExp(r'\s+')).first;
  if (saved.respondedBy == uid) {
    if (saved.status == BookingResultStatus.confirmed) {
      return 'Você confirmou · conta no histórico de quem jogou';
    }
    if (saved.status == BookingResultStatus.disputed) {
      return 'Você contestou · $creator vai corrigir';
    }
  }
  return switch (saved.status) {
    BookingResultStatus.confirmed => who.isEmpty
        ? 'Confirmado · conta no histórico de quem jogou'
        : 'Confirmado por $who · conta no histórico de quem jogou',
    BookingResultStatus.disputed => who.isEmpty
        ? 'Contestado · $creator vai corrigir'
        : 'Contestado por $who · $creator vai corrigir',
    BookingResultStatus.pending => saved.awaitsResponseFrom(uid)
        ? 'Com a sua confirmação, o placar entra no histórico de quem jogou. '
            'Não conta no ranking.'
        : saved.opponentUids.isEmpty
            ? 'Sem adversário com conta para confirmar · não conta no histórico'
            : 'Aguardando ${bookingResultNamesLine(saved.opponentFirstNames)} '
                'confirmar',
  };
}

/// "Maria & Enzo 2–1 Rafael & Lia" (sets vencidos) · "Rotação · 3 times".
String bookingResultScoreLine(BookingResult r) {
  if (r.isRotation) return 'Rotação · ${r.teams.length} times';
  final a = r.teams[0];
  final b = r.teams[1];
  return '${a.name} ${r.winsOf(a.id)}–${r.winsOf(b.id)} ${b.name}';
}

/// Título da linha do placar no topo do Histórico, para [uid].
String bookingResultAttentionTitle(SavedBookingResult saved, String uid) {
  String first(String? name) => name?.trim().split(RegExp(r'\s+')).first ?? '';
  if (saved.awaitsResponseFrom(uid)) {
    return 'Confirme o placar de ${first(saved.createdByName)}';
  }
  return switch (saved.status) {
    BookingResultStatus.disputed => saved.respondedByName == null
        ? 'Placar contestado'
        : '${first(saved.respondedByName)} contestou o placar',
    BookingResultStatus.confirmed => 'Placar confirmado',
    BookingResultStatus.pending => saved.opponentUids.isEmpty
        ? 'Sem adversário com conta para confirmar'
        : 'Aguardando ${bookingResultNamesLine(saved.opponentFirstNames)} '
            'confirmar',
  };
}
