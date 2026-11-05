import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/blog_library.dart';
import '../domain/blog_logic.dart';
import '../domain/blog_post.dart';
import '../domain/blog_repository.dart';

/// `blogPosts` (só leitura: escrita é da callable `saveBlogPost`),
/// `blogPosts/{id}/reactions/{uid}` e `users/{uid}/blogLibrary/{postId}`.
///
/// A rule de `blogPosts` só deixa ler publicado: toda consulta filtra
/// `status == published`, senão o Firestore nega a consulta inteira.
class FirestoreBlogRepository implements BlogRepository {
  FirestoreBlogRepository(this._db);

  final FirebaseFirestore _db;

  /// Limite do `in` do Firestore.
  static const _inChunk = 30;

  CollectionReference<Map<String, dynamic>> get _posts =>
      _db.collection('blogPosts');

  @override
  Stream<List<BlogPost>> watchPublished({required int limit}) => _posts
      .where('status', isEqualTo: 'published')
      .where('channels.app', isEqualTo: true)
      .orderBy('publishAt', descending: true)
      .limit(limit)
      .snapshots()
      .map(
        (snap) => [
          for (final d in snap.docs) ?BlogPost.fromMap(d.id, d.data()),
        ],
      );

  @override
  Stream<BlogPost?> watchPost(String postId) {
    if (postId.isEmpty) return Stream.value(null);
    return _posts
        .doc(postId)
        .snapshots()
        .map(_appPost)
        .transform(
          StreamTransformer.fromHandlers(
            handleError: (error, stack, sink) {
              // Rascunho ou despublicado: a rule nega a leitura do doc.
              if (error is FirebaseException &&
                  error.code == 'permission-denied') {
                sink.add(null);
                return;
              }
              sink.addError(error, stack);
            },
          ),
        );
  }

  BlogPost? _appPost(DocumentSnapshot<Map<String, dynamic>> snap) {
    final data = snap.data();
    if (data == null || !_isAppPublished(data)) return null;
    return BlogPost.fromMap(snap.id, data);
  }

  static bool _isAppPublished(Map<String, dynamic> data) {
    final channels = data['channels'];
    return data['status'] == 'published' &&
        channels is Map &&
        channels['app'] == true;
  }

  @override
  Future<List<BlogPost>> fetchByIds(List<String> ids) async {
    final unique = ids.where((id) => id.isNotEmpty).toSet().toList();
    final chunks = [
      for (var i = 0; i < unique.length; i += _inChunk)
        unique.sublist(
          i,
          i + _inChunk > unique.length ? unique.length : i + _inChunk,
        ),
    ];
    // Lotes em paralelo: em série, cada um soma uma ida e volta.
    final snaps = await Future.wait([
      for (final chunk in chunks)
        _posts
            .where('status', isEqualTo: 'published')
            .where(FieldPath.documentId, whereIn: chunk)
            .get(),
    ]);
    final posts = [
      for (final snap in snaps)
        for (final d in snap.docs)
          if (_isAppPublished(d.data())) ?BlogPost.fromMap(d.id, d.data()),
    ]..sort(compareBlogPostsNewestFirst);
    return posts;
  }

  CollectionReference<Map<String, dynamic>> _library(String uid) =>
      _db.collection('users').doc(uid).collection('blogLibrary');

  @override
  Stream<Map<String, BlogLibraryEntry>> watchLibrary(String uid) =>
      _library(uid).snapshots().map(
        (snap) => {
          for (final d in snap.docs)
            // `updatedAt` pendente vem `null`: a ordem cai no início da
            // leitura ou no salvo.
            d.id: BlogLibraryEntry.fromMap(d.id, d.data()),
        },
      );

  @override
  Future<void> writeLibraryEntry(String uid, BlogLibraryEntry entry) =>
      _library(uid).doc(entry.postId).set({
        ...entry.toWriteMap(),
        'updatedAt': FieldValue.serverTimestamp(),
      });

  DocumentReference<Map<String, dynamic>> _reaction(
    String postId,
    String uid,
  ) => _posts.doc(postId).collection('reactions').doc(uid);

  @override
  Stream<bool> watchHelpful(String postId, String uid) =>
      _reaction(postId, uid).snapshots().map((s) => s.exists);

  @override
  Future<void> setHelpful(String postId, String uid, {required bool helpful}) =>
      helpful
      ? _reaction(
          postId,
          uid,
        ).set({'kind': 'helpful', 'createdAt': FieldValue.serverTimestamp()})
      : _reaction(postId, uid).delete();
}
