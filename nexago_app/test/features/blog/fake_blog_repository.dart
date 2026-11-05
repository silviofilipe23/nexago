import 'dart:async';

import 'package:nexago_app/features/blog/domain/blog_comment.dart';
import 'package:nexago_app/features/blog/domain/blog_library.dart';
import 'package:nexago_app/features/blog/domain/blog_notify_prefs.dart';
import 'package:nexago_app/features/blog/domain/blog_post.dart';
import 'package:nexago_app/features/blog/domain/blog_repository.dart';

/// Repositório em memória: o stream da biblioteca reflete cada gravação.
class FakeBlogRepository implements BlogRepository {
  FakeBlogRepository(this.posts, {Map<String, BlogLibraryEntry>? library})
    : library = {...?library};

  final List<BlogPost> posts;
  final Map<String, BlogLibraryEntry> library;
  final _listeners = <StreamController<Map<String, BlogLibraryEntry>>>[];
  final writes = <BlogLibraryEntry>[];
  final helpfulCalls = <bool>[];

  @override
  Stream<List<BlogPost>> watchPublished({required int limit}) =>
      Stream.value(posts.take(limit).toList());

  @override
  Stream<BlogPost?> watchPost(String postId) =>
      Stream.value(posts.where((p) => p.id == postId).firstOrNull);

  @override
  Future<List<BlogPost>> fetchByIds(List<String> ids) async =>
      posts.where((p) => ids.contains(p.id)).toList();

  @override
  Stream<Map<String, BlogLibraryEntry>> watchLibrary(String uid) {
    late final StreamController<Map<String, BlogLibraryEntry>> c;
    c = StreamController(
      onListen: () => c.add(Map.of(library)),
      onCancel: () => _listeners.remove(c),
    );
    _listeners.add(c);
    return c.stream;
  }

  @override
  Future<void> writeLibraryEntry(String uid, BlogLibraryEntry entry) async {
    writes.add(entry);
    library[entry.postId] = entry;
    for (final c in [..._listeners]) {
      c.add(Map.of(library));
    }
  }

  @override
  Stream<bool> watchHelpful(String postId, String uid) => Stream.value(false);

  @override
  Future<void> setHelpful(
    String postId,
    String uid, {
    required bool helpful,
  }) async {
    helpfulCalls.add(helpful);
  }

  BlogNotifyPrefs notifyPrefs = BlogNotifyPrefs.allOn;
  final notifyWrites = <BlogNotifyPrefs>[];
  final _prefsListeners = <StreamController<BlogNotifyPrefs>>[];

  @override
  Stream<BlogNotifyPrefs> watchNotifyPrefs(String uid) {
    late final StreamController<BlogNotifyPrefs> c;
    c = StreamController(
      onListen: () => c.add(notifyPrefs),
      onCancel: () => _prefsListeners.remove(c),
    );
    _prefsListeners.add(c);
    return c.stream;
  }

  @override
  Future<void> writeNotifyPrefs(String uid, BlogNotifyPrefs prefs) async {
    notifyWrites.add(prefs);
    notifyPrefs = prefs;
    for (final c in [..._prefsListeners]) {
      c.add(prefs);
    }
  }

  final reads = <Map<String, Object>>[];

  @override
  Future<void> recordRead(Map<String, Object> payload) async {
    reads.add(payload);
  }

  /// Comentários por post (aprovados e de qualquer autor).
  final comments = <String, List<BlogComment>>{};
  final postedComments =
      <({String postId, String text, BlogCommentKind kind})>[];
  final deletedComments = <String>[];

  /// Erro da próxima chamada a [postComment] (ex.: pendentes demais).
  Object? postCommentError;
  final _commentListeners =
      <({String postId, String? uid, StreamController<List<BlogComment>> c})>[];

  List<BlogComment> _visible(String postId, String? uid) => [
    for (final c in comments[postId] ?? const <BlogComment>[])
      if (uid == null ? c.status == BlogCommentStatus.approved : c.uid == uid)
        c,
  ];

  Stream<List<BlogComment>> _watch(String postId, String? uid) {
    final c = StreamController<List<BlogComment>>();
    final entry = (postId: postId, uid: uid, c: c);
    c.onListen = () => c.add(_visible(postId, uid));
    c.onCancel = () => _commentListeners.remove(entry);
    _commentListeners.add(entry);
    return c.stream;
  }

  void _emitComments(String postId) {
    for (final l in [..._commentListeners]) {
      if (l.postId == postId) l.c.add(_visible(postId, l.uid));
    }
  }

  @override
  Stream<List<BlogComment>> watchApprovedComments(
    String postId, {
    required int limit,
  }) => _watch(postId, null).map((l) => l.take(limit).toList());

  @override
  Stream<List<BlogComment>> watchOwnComments(String postId, String uid) =>
      _watch(postId, uid);

  @override
  Future<String> postComment(
    String postId, {
    required String text,
    required BlogCommentKind kind,
  }) async {
    final error = postCommentError;
    if (error != null) {
      postCommentError = null;
      throw error;
    }
    postedComments.add((postId: postId, text: text, kind: kind));
    final id = 'novo-${postedComments.length}';
    (comments[postId] ??= []).insert(
      0,
      BlogComment(
        id: id,
        uid: 'u1',
        authorName: 'Você',
        text: text,
        kind: kind,
        status: BlogCommentStatus.pending,
        createdAt: DateTime.now(),
      ),
    );
    _emitComments(postId);
    return id;
  }

  @override
  Future<void> deleteComment(String postId, String commentId) async {
    deletedComments.add(commentId);
    comments[postId]?.removeWhere((c) => c.id == commentId);
    _emitComments(postId);
  }
}
