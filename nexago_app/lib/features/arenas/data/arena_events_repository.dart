import 'package:cloud_firestore/cloud_firestore.dart';

import '../../organizer_public_profile/data/organizer_event_mapper.dart';
import '../../organizer_public_profile/domain/organizer_event.dart';

/// Torneios e etapas de liga que acontecem na arena (`tournaments.arenaId` é
/// o local do evento; quem organiza é sempre um organizador).
class ArenaEventsRepository {
  ArenaEventsRepository(this._firestore);

  final FirebaseFirestore _firestore;

  /// Eventos listados na arena. Rascunho, cancelado e "por link" ficam de
  /// fora pela mesma regra do perfil do organizador.
  Stream<List<OrganizerEvent>> watchEvents(String arenaId) {
    final id = arenaId.trim();
    if (id.isEmpty) return Stream.value(const []);
    return _firestore
        .collection('tournaments')
        .where('arenaId', isEqualTo: id)
        .snapshots()
        .map(
          (snap) => [
            for (final doc in snap.docs)
              if (organizerEventFromMap(doc.id, doc.data()) case final event?)
                event,
          ],
        );
  }
}
