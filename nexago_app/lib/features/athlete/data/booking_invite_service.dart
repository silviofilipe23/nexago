import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/booking_invite_model.dart';

/// Convites para jogar numa reserva.
///
/// Escrita só pelas callables de `functions/src/arena-booking-invite.ts` (as
/// rules fecham `bookingInvites` e a lista de jogadores da reserva para o
/// cliente); daqui saem as chamadas e as leituras.
class BookingInviteService {
  BookingInviteService(this._db, {FirebaseFunctions? functions})
      : _functions = functions ?? nexagoFunctions;

  final FirebaseFirestore _db;
  final FirebaseFunctions _functions;

  static const _collection = 'bookingInvites';

  CollectionReference<Map<String, dynamic>> get _invites =>
      _db.collection(_collection);

  Stream<BookingInvite?> watchInvite(String inviteId) {
    final id = inviteId.trim();
    if (id.isEmpty || id.contains('/')) return Stream.value(null);
    return _invites.doc(id).snapshots().map(
          (snap) => snap.exists ? BookingInvite.fromFirestore(snap) : null,
        );
  }

  /// Convites da reserva (dono): pendentes, respondidos e o link.
  Stream<List<BookingInvite>> watchInvitesForBooking(String bookingId) {
    final id = bookingId.trim();
    if (id.isEmpty) return Stream.value(const []);
    return _invites.where('bookingId', isEqualTo: id).snapshots().map(
          (snap) => snap.docs
              .map((doc) => BookingInvite.fromMap(doc.id, doc.data()))
              .toList(),
        );
  }

  /// Convites recebidos ainda sem resposta.
  Stream<List<BookingInvite>> watchPendingInvitesFor(String uid) {
    final id = uid.trim();
    if (id.isEmpty) return Stream.value(const []);
    return _invites
        .where('inviteeUid', isEqualTo: id)
        .where('status', isEqualTo: 'pending')
        .limit(20)
        .snapshots()
        .map(
          (snap) => snap.docs
              .map((doc) => BookingInvite.fromMap(doc.id, doc.data()))
              .toList(),
        );
  }

  /// Convida atletas do nexaGO (push + inbox para cada um). Devolve quantos
  /// convites saíram — quem já joga ou já tem convite pendente é pulado.
  Future<int> invitePlayers({
    required String bookingId,
    required List<String> inviteeUids,
  }) async {
    final data = await _call(
      'inviteArenaBookingPlayers',
      {'bookingId': bookingId, 'inviteeUids': inviteeUids},
      'Não foi possível enviar o convite.',
    );
    final invited = data['invited'];
    return invited is List ? invited.length : 0;
  }

  /// Id do link multiuso da reserva (cria na primeira vez).
  Future<String> inviteLinkId(String bookingId) async {
    final data = await _call(
      'getArenaBookingInviteLink',
      {'bookingId': bookingId},
      'Não foi possível gerar o link do convite.',
    );
    final id = data['inviteId'];
    if (id is! String || id.trim().isEmpty) {
      throw const BookingInviteException(
        'Não foi possível gerar o link do convite.',
      );
    }
    return id.trim();
  }

  /// Aceita ou recusa. Retorna o status do servidor: `accepted`, `declined`,
  /// `already` (já estava no jogo) ou `dismissed` (recusou um link).
  Future<String> respond(String inviteId, {required bool accept}) async {
    final data = await _call(
      'respondArenaBookingInvite',
      {'inviteId': inviteId, 'accept': accept},
      accept
          ? 'Não foi possível aceitar o convite.'
          : 'Não foi possível recusar o convite.',
    );
    return (data['status'] as String?) ?? (accept ? 'accepted' : 'declined');
  }

  /// Convidado sai do jogo; com [participantUid], o dono tira essa pessoa.
  Future<void> leave(String bookingId, {String? participantUid}) async {
    await _call(
      'leaveArenaBooking',
      {
        'bookingId': bookingId,
        if (participantUid != null) 'participantUid': participantUid,
      },
      participantUid == null
          ? 'Não foi possível sair do jogo.'
          : 'Não foi possível remover o jogador.',
    );
  }

  Future<void> cancelInvite(String inviteId) async {
    await _call(
      'cancelArenaBookingInvite',
      {'inviteId': inviteId},
      'Não foi possível cancelar o convite.',
    );
  }

  Future<Map<String, dynamic>> _call(
    String name,
    Map<String, dynamic> payload,
    String fallback,
  ) async {
    try {
      final result = await _functions.httpsCallable(name).call(payload);
      final data = result.data;
      return data is Map ? Map<String, dynamic>.from(data) : const {};
    } on FirebaseFunctionsException catch (e) {
      throw BookingInviteException(
        callableErrorMessage(e.code, e.message, fallback),
      );
    }
  }
}

class BookingInviteException implements Exception {
  const BookingInviteException(this.message);

  final String message;

  @override
  String toString() => message;
}
