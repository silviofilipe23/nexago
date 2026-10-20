import 'dart:async';

import 'package:nexago_app/features/arenas/domain/booking_result.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_record.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_repository.dart';

/// Placares em memória: o teste empurra o que o Firestore devolveria e lê o
/// que a tela mandou para as callables.
class FakeBookingResultRepository implements BookingResultRepository {
  FakeBookingResultRepository([this._current = const []]);

  List<SavedBookingResult> _current;
  final _changes = StreamController<List<SavedBookingResult>>.broadcast();

  final saves = <(String bookingId, BookingResult result)>[];
  final responses = <(String bookingId, bool confirm, int version)>[];
  String? saveError;
  String? respondError;

  void emit(List<SavedBookingResult> results) {
    _current = results;
    _changes.add(results);
  }

  @override
  Stream<List<SavedBookingResult>> watchMine(String uid) async* {
    yield _current;
    yield* _changes.stream;
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
  }) async {
    if (respondError != null) throw BookingResultException(respondError!);
    responses.add((bookingId, confirm, version));
  }
}

/// Maria (u1) + Enzo (u2) contra Rafael (u3) + Lia avulsa, 2–1 em sets.
SavedBookingResult savedResult({
  BookingResultStatus status = BookingResultStatus.pending,
  List<String> opponentUids = const ['u3'],
  String? respondedByName,
  int version = 1,
  String bookingId = 'b1',
}) {
  return SavedBookingResult(
    bookingId: bookingId,
    arenaName: 'Arena CFC',
    courtName: 'Quadra 1',
    dateKey: '2026-05-22',
    startTime: '09:00',
    endTime: '10:30',
    createdBy: 'u1',
    createdByName: 'Maria Alves',
    result: const BookingResult(
      teams: [
        ResultTeam(id: 0, players: [
          ResultPlayer(id: 'u1', name: 'Maria Alves'),
          ResultPlayer(id: 'u2', name: 'Enzo Lima'),
        ]),
        ResultTeam(id: 1, players: [
          ResultPlayer(id: 'u3', name: 'Rafael Souza'),
          ResultPlayer(id: 'guest:lia', name: 'Lia'),
        ]),
      ],
      games: [
        ResultGame(teamA: 0, teamB: 1, scoreA: 21, scoreB: 18),
        ResultGame(teamA: 0, teamB: 1, scoreA: 17, scoreB: 21),
        ResultGame(teamA: 0, teamB: 1, scoreA: 15, scoreB: 12),
      ],
    ),
    opponentUids: opponentUids,
    status: status,
    version: version,
    respondedBy: respondedByName == null ? null : 'u3',
    respondedByName: respondedByName,
  );
}
