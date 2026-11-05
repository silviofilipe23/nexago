import 'dart:async';

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
}
