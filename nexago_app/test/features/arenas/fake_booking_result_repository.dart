import 'dart:async';

import 'package:nexago_app/features/arenas/domain/booking_result.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_record.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_repository.dart';

/// Peladas em memória: o teste empurra o que o Firestore devolveria e lê o
/// que a tela mandou para as callables.
class FakeBookingResultRepository implements BookingResultRepository {
  FakeBookingResultRepository([this._current = const []]);

  List<SavedBookingResult> _current;
  final _changes = StreamController<List<SavedBookingResult>>.broadcast();

  final saves = <(String bookingId, BookingResult result)>[];
  final responses =
      <(String bookingId, bool confirm, int version, String? reason)>[];
  String? saveError;
  String? respondError;

  void emit(List<SavedBookingResult> results) {
    _current = results;
    _changes.add(results);
  }

  @override
  Stream<List<SavedBookingResult>> watchMine(String uid) async* {
    yield [
      for (final r in _current)
        if (r.involves(uid)) r,
    ];
    yield* _changes.stream.map(
      (all) => [
        for (final r in all)
          if (r.involves(uid)) r,
      ],
    );
  }

  @override
  Stream<SavedBookingResult?> watchOne(String bookingId) async* {
    SavedBookingResult? find(List<SavedBookingResult> all) {
      for (final r in all) {
        if (r.bookingId == bookingId) return r;
      }
      return null;
    }

    yield find(_current);
    yield* _changes.stream.map(find);
  }

  @override
  Stream<List<SavedBookingResult>> watchConfirmedOf(String userId) async* {
    List<SavedBookingResult> pick(List<SavedBookingResult> all) => [
          for (final r in all)
            if (r.isConfirmed && r.involves(userId)) r,
        ];
    yield pick(_current);
    yield* _changes.stream.map(pick);
  }

  @override
  Future<void> save(String bookingId, BookingResult result) async {
    if (saveError != null) throw BookingResultException(saveError!);
    saves.add((bookingId, result));
  }

  @override
  Future<void> respond(
    String bookingId, {
    required bool confirm,
    required int version,
    String? reason,
  }) async {
    if (respondError != null) throw BookingResultException(respondError!);
    responses.add((bookingId, confirm, version, reason));
  }
}

const _maria = ResultPlayer(id: 'u1', name: 'Maria Alves');
const _enzo = ResultPlayer(id: 'u2', name: 'Enzo Lima');
const _rafael = ResultPlayer(id: 'u3', name: 'Rafael Souza');
const _lia = ResultPlayer(id: 'u4', name: 'Lia Martins');

/// Maria (u1, dona) + Enzo (u2) contra Rafael (u3) + Lia (u4), 2–1 em sets.
/// [pending] = quem ainda não respondeu (Maria, que lançou, já confirmou).
SavedBookingResult savedResult({
  BookingResultStatus status = BookingResultStatus.pending,
  List<String> pending = const ['u2', 'u3', 'u4'],
  String? disputedBy,
  String? disputeReason,
  int version = 1,
  String bookingId = 'b1',
  String dateKey = '2026-05-22',
  String arenaName = 'Arena CFC',
  bool autoConfirmed = false,
  BookingResult? result,
}) {
  final r = result ??
      const BookingResult(
        teams: [
          ResultTeam(id: 0, players: [_maria, _enzo]),
          ResultTeam(id: 1, players: [_rafael, _lia]),
        ],
        games: [
          ResultGame(teamA: 0, teamB: 1, scoreA: 21, scoreB: 18),
          ResultGame(teamA: 0, teamB: 1, scoreA: 17, scoreB: 21),
          ResultGame(teamA: 0, teamB: 1, scoreA: 15, scoreB: 12),
        ],
      );
  final players = [
    for (final t in r.teams)
      for (final p in t.players) p.id,
  ];
  return SavedBookingResult(
    bookingId: bookingId,
    arenaName: arenaName,
    courtName: 'Quadra 1',
    sport: 'beachVolleyball',
    dateKey: dateKey,
    startTime: '09:00',
    endTime: '10:30',
    createdBy: 'u1',
    createdByName: 'Maria Alves',
    result: r,
    status: status,
    version: version,
    bookingAmountReais: 120,
    confirmations: {
      for (final uid in players)
        uid: ResultConfirmation(
          state: uid == disputedBy
              ? ResultConfirmationState.disputed
              : (status != BookingResultStatus.confirmed &&
                      pending.contains(uid)
                  ? ResultConfirmationState.pending
                  : ResultConfirmationState.confirmed),
          reason: uid == disputedBy ? disputeReason : null,
          auto: autoConfirmed && pending.contains(uid),
        ),
    },
    disputedBy: disputedBy,
    disputedByName: disputedBy == null ? null : 'Rafael Souza',
    disputeReason: disputeReason,
  );
}

/// Rei da quadra com quatro duplas, Maria & Enzo em 1º (4–3).
BookingResult kingOfCourtResult() => const BookingResult(
      teams: [
        ResultTeam(id: 0, players: [_maria, _enzo]),
        ResultTeam(id: 1, players: [_rafael, _lia]),
        ResultTeam(
          id: 2,
          players: [
            ResultPlayer(id: 'u5', name: 'Bruno Lima'),
            ResultPlayer(id: 'u6', name: 'Carol Dias'),
          ],
        ),
        ResultTeam(
          id: 3,
          players: [
            ResultPlayer(id: 'u7', name: 'Diego Reis'),
            ResultPlayer(id: 'u8', name: 'Fê Souza'),
          ],
        ),
      ],
      games: [
        ResultGame(teamA: 0, teamB: 1, scoreA: 18, scoreB: 21),
        ResultGame(teamA: 1, teamB: 2, scoreA: 21, scoreB: 15),
        ResultGame(teamA: 0, teamB: 2, scoreA: 21, scoreB: 15),
        ResultGame(teamA: 0, teamB: 3, scoreA: 21, scoreB: 12),
        ResultGame(teamA: 0, teamB: 1, scoreA: 21, scoreB: 19),
        ResultGame(teamA: 0, teamB: 2, scoreA: 17, scoreB: 21),
        ResultGame(teamA: 0, teamB: 3, scoreA: 21, scoreB: 14),
        ResultGame(teamA: 0, teamB: 1, scoreA: 15, scoreB: 21),
        ResultGame(teamA: 2, teamB: 3, scoreA: 21, scoreB: 10),
      ],
    );
