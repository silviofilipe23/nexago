import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

import '../../../core/time/nexago_event_timezone.dart';
import 'booking_result.dart';
import 'booking_story.dart';

/// A "pelada": placar do pós-jogo gravado em `bookingResults/{bookingId}` pelas
/// callables `saveBookingResult` / `respondBookingResult` e pela varredura
/// `sweepBookingResults`. Quem lança (e edita) é o dono da reserva; todo mundo
/// no placar, menos quem lançou a versão, confirma ou contesta. Todos
/// confirmados → conta nas estatísticas; 48h sem contestação → confirma
/// sozinho. Nunca conta no ranking. Espelha `functions/src/booking-result.ts`.
enum BookingResultStatus { pending, confirmed, disputed }

enum ResultConfirmationState { pending, confirmed, disputed }

BookingResultStatus _statusFrom(Object? raw) => switch (raw) {
      'confirmed' => BookingResultStatus.confirmed,
      'disputed' => BookingResultStatus.disputed,
      _ => BookingResultStatus.pending,
    };

ResultConfirmationState _confirmationFrom(Object? raw) => switch (raw) {
      'confirmed' => ResultConfirmationState.confirmed,
      'disputed' => ResultConfirmationState.disputed,
      _ => ResultConfirmationState.pending,
    };

/// A resposta de um jogador à versão atual do placar.
@immutable
class ResultConfirmation {
  const ResultConfirmation({
    required this.state,
    this.reason,
    this.auto = false,
  });

  final ResultConfirmationState state;

  /// Motivo da contestação.
  final String? reason;

  /// Confirmado pelo prazo de 48h, não pelo jogador.
  final bool auto;
}

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
    required this.status,
    required this.version,
    this.confirmations = const {},
    this.editedBy,
    this.arenaId,
    this.courtName,
    this.sport,
    this.confirmDeadline,
    this.bookingAmountReais,
    this.disputedBy,
    this.disputedByName,
    this.disputeReason,
  });

  final String bookingId;
  final String? arenaId;
  final String arenaName;
  final String? courtName;
  final String? sport;
  final String dateKey;
  final String startTime;
  final String endTime;

  /// Dono da reserva: quem lança e edita.
  final String createdBy;
  final String createdByName;

  /// Quem lançou a versão atual (não confirma a si mesmo). `null` = [createdBy].
  final String? editedBy;
  final BookingResult result;
  final BookingResultStatus status;

  /// Sobe a cada "Salvar placar"; a resposta leva a versão que o jogador viu.
  final int version;

  /// Uma por jogador do placar, da versão atual.
  final Map<String, ResultConfirmation> confirmations;

  /// Passou daqui sem contestação, a varredura confirma.
  final DateTime? confirmDeadline;

  /// Valor da reserva quando o placar foi salvo (para o "por pessoa").
  final double? bookingAmountReais;
  final String? disputedBy;
  final String? disputedByName;
  final String? disputeReason;

  static SavedBookingResult? fromFirestore(String id, Map<String, dynamic> d) {
    String s(Object? v) => v is String ? v.trim() : '';
    String? opt(Object? v) => s(v).isEmpty ? null : s(v);
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
            customName: opt(t['customName']),
            players: [
              for (final p
                  in (t['players'] is List ? t['players'] as List : []))
                if (p is Map && s(p['id']).isNotEmpty)
                  ResultPlayer(
                    id: s(p['id']),
                    name: s(p['name']).isEmpty ? 'Atleta' : s(p['name']),
                    avatarUrl: opt(p['avatarUrl']),
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
    final status = _statusFrom(d['status']);
    final players = [
      for (final u in (d['playerUids'] is List ? d['playerUids'] as List : []))
        if (u is String && u.isNotEmpty) u,
    ];
    final editedBy = opt(d['editedBy']);
    final deadline = d['confirmDeadline'];
    return SavedBookingResult(
      bookingId: s(d['bookingId']).isEmpty ? id : s(d['bookingId']),
      arenaId: opt(d['arenaId']),
      arenaName: s(d['arenaName']).isEmpty ? 'Arena' : s(d['arenaName']),
      courtName: opt(d['courtName']),
      sport: opt(d['sport']),
      dateKey: s(d['dateKey']),
      startTime: s(d['startTime']),
      endTime: s(d['endTime']),
      createdBy: createdBy,
      createdByName:
          s(d['createdByName']).isEmpty ? 'Atleta' : s(d['createdByName']),
      editedBy: editedBy,
      result: BookingResult(teams: teams, games: games),
      status: status,
      version: (d['version'] as num?)?.toInt() ?? 0,
      confirmations: _confirmationsFrom(
        d['confirmations'],
        players: players,
        editor: editedBy ?? createdBy,
        status: status,
        respondedBy: opt(d['respondedBy']),
      ),
      confirmDeadline: deadline is Timestamp ? deadline.toDate() : null,
      bookingAmountReais: (d['bookingAmountReais'] as num?)?.toDouble(),
      disputedBy: opt(d['disputedBy']) ??
          (status == BookingResultStatus.disputed
              ? opt(d['respondedBy'])
              : null),
      disputedByName: opt(d['disputedByName']) ??
          (status == BookingResultStatus.disputed
              ? opt(d['respondedByName'])
              : null),
      disputeReason: opt(d['disputeReason']),
    );
  }

  /// O mapa do doc; placar do #781 não tem: quem lançou conta como confirmado
  /// e o `status` antigo decide o resto (mesma conta do servidor).
  static Map<String, ResultConfirmation> _confirmationsFrom(
    Object? raw, {
    required List<String> players,
    required String editor,
    required BookingResultStatus status,
    String? respondedBy,
  }) {
    if (raw is Map) {
      return {
        for (final uid in players)
          uid: () {
            final c = raw[uid];
            if (c is! Map) {
              return const ResultConfirmation(
                state: ResultConfirmationState.pending,
              );
            }
            final reason = c['reason'];
            return ResultConfirmation(
              state: _confirmationFrom(c['state']),
              reason: reason is String && reason.trim().isNotEmpty
                  ? reason.trim()
                  : null,
              auto: c['auto'] == true,
            );
          }(),
      };
    }
    return {
      for (final uid in players)
        uid: ResultConfirmation(
          state: uid == editor || status == BookingResultStatus.confirmed
              ? ResultConfirmationState.confirmed
              : (status == BookingResultStatus.disputed && uid == respondedBy
                  ? ResultConfirmationState.disputed
                  : ResultConfirmationState.pending),
        ),
    };
  }

  static SavedBookingResult? fromDoc(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data();
    return data == null ? null : fromFirestore(doc.id, data);
  }

  bool get isConfirmed => status == BookingResultStatus.confirmed;
  bool get isDisputed => status == BookingResultStatus.disputed;

  /// Quem lançou a versão atual.
  String get editorUid => editedBy ?? createdBy;

  /// Todos com conta no placar.
  List<String> get playerUids => confirmations.keys.toList();

  bool involves(String uid) => confirmations.containsKey(uid);

  /// O dono da reserva edita — confirmado também (volta a pendente).
  bool canEdit(String uid) => uid.isNotEmpty && uid == createdBy;

  /// [uid] ainda precisa confirmar ou contestar esta versão.
  bool awaitsResponseFrom(String uid) =>
      status == BookingResultStatus.pending &&
      uid != editorUid &&
      confirmations[uid]?.state == ResultConfirmationState.pending;

  int get confirmedCount => confirmations.values
      .where((c) => c.state == ResultConfirmationState.confirmed)
      .length;

  int get playerCount => confirmations.length;

  /// Ainda não responderam a esta versão.
  List<String> get pendingUids => [
        for (final e in confirmations.entries)
          if (e.value.state == ResultConfirmationState.pending) e.key,
      ];

  /// Confirmado pelo prazo (alguém não respondeu e as 48h venceram).
  bool get autoConfirmed =>
      isConfirmed && confirmations.values.any((c) => c.auto);

  /// Instante do início (parede SP), para ordenar no histórico.
  DateTime? get playedAt {
    final day = nexagoEventDayKeyAnchor(dateKey);
    if (day == null) return null;
    final parts = startTime.split(':');
    final h = int.tryParse(parts.first) ?? 0;
    final m = parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0;
    return day.add(Duration(hours: h, minutes: m));
  }

  /// Minutos reservados (fim antes do início = passou da meia-noite).
  int get minutes {
    int? parse(String hm) {
      final parts = hm.split(':');
      final h = int.tryParse(parts.first);
      if (h == null) return null;
      return h * 60 + (parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0);
    }

    final s = parse(startTime);
    var e = parse(endTime);
    if (s == null || e == null) return 0;
    if (e <= s) e += 24 * 60;
    return e - s;
  }

  /// Para reabrir o pós-jogo (arte do story) a partir do histórico.
  BookingStoryArgs toStoryArgs() => BookingStoryArgs(
        bookingId: bookingId,
        arenaName: arenaName,
        courtName: courtName ?? '',
        dateKey: dateKey,
        startTime: startTime,
        endTime: endTime,
      );

  /// Primeiros nomes de quem ainda não respondeu, pela ordem dos times.
  List<String> get pendingFirstNames => [
        for (final t in result.teams)
          for (final p in t.players)
            if (pendingUids.contains(p.id)) p.firstName,
      ];
}

/// O que vai para a callable `saveBookingResult`: ids dos jogadores (nome e
/// foto vêm do perfil, no servidor) e os jogos.
Map<String, Object?> bookingResultPayload(String bookingId, BookingResult r) =>
    {
      'bookingId': bookingId,
      'teams': [
        for (final t in r.teams)
          {
            'id': t.id,
            'customName': t.customName?.trim() ?? '',
            'players': [
              for (final p in t.players) {'id': p.id},
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

/// Quem recebe o placar para confirmar: todo mundo, menos quem salva.
List<ResultPlayer> bookingResultConfirmers(
  BookingResult result,
  String? editorPlayerId,
) =>
    [
      for (final t in result.teams)
        for (final p in t.players)
          if (p.id != editorPlayerId && !p.isGuest) p,
    ];

/// "Rafael" · "Rafael e Lia" · "Rafael, Lia +2" (como no protótipo).
String bookingResultNamesLine(List<String> names) {
  if (names.isEmpty) return '';
  if (names.length > 2) {
    return '${names.take(2).join(', ')} +${names.length - 2}';
  }
  return names.join(' e ');
}

/// O aviso do "Editar placar": quem recebe o placar e quando ele passa a contar.
({String names, String rest}) bookingResultSaveNotice(List<String> names) {
  if (names.isEmpty) {
    return (
      names: '',
      rest: 'Monte os times com quem jogou: cada um confirma o placar.',
    );
  }
  final verb = names.length == 1 ? 'recebe' : 'recebem';
  return (
    names: bookingResultNamesLine(names),
    rest: ' $verb o placar para confirmar. Sem contestação em 48h, ele '
        'confirma sozinho.',
  );
}

/// "Maria & Enzo 2–1 Rafael & Lia" (sets vencidos) · "Rotação · 3 times".
String bookingResultScoreLine(BookingResult r) {
  if (r.isRotation) return 'Rotação · ${r.teams.length} times';
  final a = r.teams[0];
  final b = r.teams[1];
  return '${a.name} ${r.winsOf(a.id)}–${r.winsOf(b.id)} ${b.name}';
}

String _first(String? name) => name?.trim().split(RegExp(r'\s+')).first ?? '';

/// Linha de estado da pelada para quem está vendo ([uid]).
String bookingResultViewerStatusLine(SavedBookingResult saved, String uid) {
  final missing = saved.pendingFirstNames;
  return switch (saved.status) {
    BookingResultStatus.confirmed => saved.autoConfirmed
        ? 'Confirmado pelo prazo de 48h'
        : 'Confirmado por todos os jogadores',
    BookingResultStatus.disputed => saved.disputedBy == uid
        ? 'Você contestou · ${_first(saved.createdByName)} vai corrigir'
        : '${_first(saved.disputedByName)} contestou'
            '${saved.disputeReason == null ? '' : ': ${saved.disputeReason}'}',
    BookingResultStatus.pending => saved.awaitsResponseFrom(uid)
        ? 'Falta a sua confirmação. Sem contestação em 48h, ele confirma '
            'sozinho.'
        : 'Aguardando ${bookingResultNamesLine(missing)} confirmar',
  };
}

/// Título curto do pedido de atenção (lista de pendentes).
String bookingResultAttentionTitle(SavedBookingResult saved, String uid) {
  if (saved.awaitsResponseFrom(uid)) {
    return 'Confirme o placar de ${_first(saved.createdByName)}';
  }
  return switch (saved.status) {
    BookingResultStatus.disputed => saved.disputedByName == null
        ? 'Placar contestado'
        : '${_first(saved.disputedByName)} contestou o placar',
    BookingResultStatus.confirmed => 'Placar confirmado',
    BookingResultStatus.pending =>
      'Aguardando ${bookingResultNamesLine(saved.pendingFirstNames)} confirmar',
  };
}
