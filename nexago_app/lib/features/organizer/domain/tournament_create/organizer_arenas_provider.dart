import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class OrganizerArenaOption {
  const OrganizerArenaOption({
    required this.id,
    required this.name,
    required this.address,
    required this.city,
    required this.state,
  });

  final String id;
  final String name;
  final String address;
  final String city;
  final String state;
}

final organizerArenaOptionsProvider =
    FutureProvider.autoDispose<List<OrganizerArenaOption>>((ref) async {
  final snap = await FirebaseFirestore.instance
      .collection('arenas')
      .orderBy('name')
      .limit(30)
      .get();

  return snap.docs.map((doc) {
    final data = doc.data();
    return OrganizerArenaOption(
      id: doc.id,
      name: (data['name'] as String?)?.trim() ?? 'Arena',
      address: (data['address'] as String?)?.trim() ??
          (data['street'] as String?)?.trim() ??
          '',
      city: (data['city'] as String?)?.trim() ?? '',
      state: (data['state'] as String?)?.trim() ??
          (data['uf'] as String?)?.trim() ??
          '',
    );
  }).toList();
});
