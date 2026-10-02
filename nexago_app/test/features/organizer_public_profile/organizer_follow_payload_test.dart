import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer_public_profile/data/organizer_public_profile_repository.dart';

void main() {
  test('doc de seguidor tem exatamente userId, organizerId e followedAt', () {
    final data = organizerFollowerDocData(
      followerId: 'atleta-1',
      organizerId: 'org-1',
    );
    // A rule de criação recusa qualquer chave a mais.
    expect(data.keys.toSet(), {'userId', 'organizerId', 'followedAt'});
    expect(data['userId'], 'atleta-1');
    expect(data['organizerId'], 'org-1');
    // `followedAt == request.time` na rule: só o serverTimestamp passa.
    expect(data['followedAt'], FieldValue.serverTimestamp());
  });

  test('coleções do contrato da fase 1', () {
    expect(kOrganizerPublicProfilesCollection, 'organizerPublicProfiles');
    expect(kOrganizerFollowersSubcollection, 'followers');
  });
}
