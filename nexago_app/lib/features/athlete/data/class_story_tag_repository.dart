import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../domain/agenda/class_story_tag.dart';

/// O story do treino em que o aluno foi marcado (`classStoryTags`, a rule só
/// deixa o próprio aluno ler). `null` = não existe mais (o professor tirou a
/// marcação) ou não é dele.
abstract class ClassStoryTagRepository {
  Future<ClassStoryTag?> fetch(String tagId);
}

class FirestoreClassStoryTagRepository implements ClassStoryTagRepository {
  FirestoreClassStoryTagRepository(this._firestore);

  final FirebaseFirestore _firestore;

  @override
  Future<ClassStoryTag?> fetch(String tagId) async {
    if (tagId.trim().isEmpty) return null;
    try {
      final snap =
          await _firestore.collection('classStoryTags').doc(tagId).get();
      final data = snap.data();
      return data == null ? null : ClassStoryTag.fromMap(snap.id, data);
    } on FirebaseException catch (e) {
      if (e.code == 'permission-denied' || e.code == 'not-found') return null;
      rethrow;
    }
  }
}

final classStoryTagRepositoryProvider = Provider<ClassStoryTagRepository>(
  (ref) => FirestoreClassStoryTagRepository(ref.watch(firestoreProvider)),
);

final classStoryTagProvider =
    FutureProvider.autoDispose.family<ClassStoryTag?, String>(
  (ref, tagId) => ref.watch(classStoryTagRepositoryProvider).fetch(tagId),
);
