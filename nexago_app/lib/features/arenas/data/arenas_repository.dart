import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/arena_list_item.dart';

class ArenasRepository {
  ArenasRepository(this._firestore);

  final FirebaseFirestore _firestore;

  Stream<List<ArenaListItem>> _watchArenas() {
    return _firestore.collection('arenas').snapshots().map((snapshot) {
      final items = snapshot.docs
          .map(ArenaListItem.fromFirestore)
          .toList(growable: false);
      items.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
      return items;
    });
  }

  /// Arenas parceiras — as que têm quadra, preço e reserva de verdade.
  ///
  /// É o leitor padrão: qualquer tela que ofereça reservar, favoritar, avaliar
  /// ou marcar jogo tem de usar este. Arena de pré-cadastro (`unclaimed`) não
  /// tem dono nem quadra, e oferecê-la nesses fluxos leva o atleta para uma
  /// tela vazia.
  Stream<List<ArenaListItem>> watchPartnerArenas() {
    return _watchArenas().map(
      (items) =>
          items.where((a) => !a.isUnclaimed).toList(growable: false),
    );
  }

  /// Parceiras + pré-cadastradas. Só a busca do atleta usa: é lá que o
  /// pré-cadastro existe para ser descoberto e receber o clique de contato.
  Stream<List<ArenaListItem>> watchArenasIncludingUnclaimed() {
    return _watchArenas();
  }

  Stream<ArenaListItem?> watchArena(String arenaId) {
    return _firestore.collection('arenas').doc(arenaId).snapshots().map(
          (doc) => doc.exists ? ArenaListItem.fromFirestore(doc) : null,
        );
  }
}
