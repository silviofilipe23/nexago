import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/benefits_club_config.dart';
import '../domain/benefits_club_repository.dart';
import '../domain/partner.dart';

/// Vitrine (`partners`) e flag (`appConfig/benefitsClub`) direto do Firestore:
/// as rules liberam leitura para quem está logado. `benefitEvents` e
/// `partnerLeads` o app não lê nem grava — só pelas callables.
class FirestoreBenefitsClubRepository implements BenefitsClubRepository {
  FirestoreBenefitsClubRepository(this._db);

  final FirebaseFirestore _db;

  /// Teto de parceiros lidos de uma vez (a vitrine é curta; sem paginação).
  static const int partnersLimit = 100;

  @override
  Stream<List<Partner>> watchActivePartners() => _db
      .collection('partners')
      .where('active', isEqualTo: true)
      .limit(partnersLimit)
      .snapshots()
      .map(
        (snap) => List.unmodifiable(
          snap.docs.map((doc) => Partner.fromFirestore(doc.id, doc.data())),
        ),
      );

  @override
  Stream<BenefitsClubConfig> watchConfig() => _db
      .doc('appConfig/benefitsClub')
      .snapshots()
      .map((snap) => BenefitsClubConfig.fromMap(snap.data()));
}
