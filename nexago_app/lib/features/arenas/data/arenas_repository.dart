import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/arena_list_item.dart';

class ArenasRepository {
  ArenasRepository(this._firestore);

  final FirebaseFirestore _firestore;

  Stream<List<ArenaListItem>> watchArenas() {
    return _firestore.collection('arenas').snapshots().map((snapshot) {
      final items = snapshot.docs
          .map(ArenaListItem.fromFirestore)
          .toList(growable: false);
      items.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
      return items;
    });
  }

  Stream<ArenaListItem?> watchArena(String arenaId) {
    return _firestore.collection('arenas').doc(arenaId).snapshots().map(
          (doc) => doc.exists ? ArenaListItem.fromFirestore(doc) : null,
        );
  }
}
