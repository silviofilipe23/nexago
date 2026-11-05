import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/firebase/firebase_providers.dart';
import '../../../core/observability/flow_error_log.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../../home_banners/domain/home_banner.dart';
import '../../store/application/store_providers.dart';
import '../domain/blog_comment.dart';
import '../domain/blog_library.dart';
import '../domain/blog_logic.dart';
import '../domain/blog_notify_prefs.dart';
import '../domain/blog_post.dart';
import '../domain/blog_read_session.dart';
import '../domain/blog_repository.dart';
import '../infrastructure/firestore_blog_repository.dart';

final blogRepositoryProvider = Provider<BlogRepository>((ref) {
  return FirestoreBlogRepository(ref.watch(firestoreProvider));
});

final _blogUidProvider = Provider<String>((ref) {
  return ref.watch(authProvider).valueOrNull?.uid.trim() ?? '';
});

/// Quantos posts o feed carrega (o blog é pequeno; sem paginação na fase 1).
const blogFeedLimit = 60;

/// Quantos a seção "Do blog" da Início mostra.
const blogHomeLimit = 3;

/// O feed: publicados para o app, do mais novo para o mais antigo.
final blogFeedProvider = StreamProvider.autoDispose<List<BlogPost>>((ref) {
  return ref.watch(blogRepositoryProvider).watchPublished(limit: blogFeedLimit);
});

/// Os mais recentes, para a seção "Do blog" da Início.
final blogHomePostsProvider = StreamProvider.autoDispose<List<BlogPost>>((ref) {
  return ref.watch(blogRepositoryProvider).watchPublished(limit: blogHomeLimit);
});

/// Um post; `null` = não existe ou não está mais publicado no app.
final blogPostProvider = StreamProvider.autoDispose.family<BlogPost?, String>((
  ref,
  postId,
) {
  return ref.watch(blogRepositoryProvider).watchPost(postId);
});

/// Salvos e progresso do atleta, por id do post. Fica viva: o controller lê o
/// estado atual antes de cada gravação (a rule exige o doc inteiro).
final blogLibraryProvider = StreamProvider<Map<String, BlogLibraryEntry>>((
  ref,
) {
  final uid = ref.watch(_blogUidProvider);
  // Sem sessão fica carregando: um mapa vazio aqui faria o controller gravar
  // por cima do que o atleta já salvou.
  if (uid.isEmpty) return const Stream.empty();
  return ref.watch(blogRepositoryProvider).watchLibrary(uid);
});

/// Chave estável (ids ordenados) dos posts que a tela de Salvos precisa —
/// mudar só o progresso não refaz a busca. `null` enquanto carrega.
final _blogLibraryIdsKeyProvider = Provider.autoDispose<String?>((ref) {
  final library = ref.watch(blogLibraryProvider).valueOrNull;
  return library == null ? null : blogLibraryIdsKey(library);
});

final _blogLibraryPostsProvider = FutureProvider.autoDispose<List<BlogPost>>((
  ref,
) async {
  final key = ref.watch(_blogLibraryIdsKeyProvider);
  // Biblioteca carregando: segue carregando (sem piscar a tela de vazio).
  if (key == null) return Completer<List<BlogPost>>().future;
  if (key.isEmpty) return const [];
  return ref.watch(blogRepositoryProvider).fetchByIds(key.split(','));
});

/// A tela de Salvos e lendo: pela metade, salvos e lidos.
final blogLibraryViewProvider =
    Provider.autoDispose<AsyncValue<BlogLibraryView>>((ref) {
      final library = ref.watch(blogLibraryProvider);
      final posts = ref.watch(_blogLibraryPostsProvider);
      if (library.hasError) {
        return AsyncError(library.error!, library.stackTrace!);
      }
      if (posts.hasError) return AsyncError(posts.error!, posts.stackTrace!);
      final entries = library.valueOrNull;
      final found = posts.valueOrNull;
      if (entries == null || found == null) return const AsyncLoading();
      return AsyncData(buildBlogLibraryView(entries, found));
    });

/// O atleta marcou "Ajudou" no post?
final blogHelpfulProvider = StreamProvider.autoDispose.family<bool, String>((
  ref,
  postId,
) {
  final uid = ref.watch(_blogUidProvider);
  if (uid.isEmpty) return Stream.value(false);
  return ref.watch(blogRepositoryProvider).watchHelpful(postId, uid);
});

/// A chamada do post vale para este build e este atleta? A Loja desligada não
/// tem aba: o botão abriria o lugar errado.
final blogCtaAvailableProvider = Provider.autoDispose.family<bool, String>((
  ref,
  destinationKey,
) {
  if (destinationKey != HomeBannerDestination.loja.key) return true;
  return ref.watch(storeEnabledProvider);
});

final blogLibraryControllerProvider = Provider<BlogLibraryController>((ref) {
  return BlogLibraryController(ref);
});

/// Gravações em `users/{uid}/blogLibrary/{postId}`. Cada uma parte do estado
/// atual e manda o doc inteiro (a rule exige todas as chaves).
///
/// O estado atual é o último doc que este aparelho gravou, enquanto o stream
/// não traz um mais novo confirmado pelo servidor: duas gravações seguidas
/// (abrir + rolar, salvar logo depois de abrir) não se atropelam, e não é
/// preciso esperar a confirmação — offline ela não chega.
class BlogLibraryController {
  BlogLibraryController(this._ref);

  final Ref _ref;
  final _written = <String, ({BlogLibraryEntry entry, DateTime at})>{};

  DateTime _now() => DateTime.now();

  /// O uid da sessão; logo depois de abrir o app, espera o Auth responder.
  Future<String> _uid() async {
    final uid = _ref.read(_blogUidProvider);
    if (uid.isNotEmpty) return uid;
    final user = await _ref.read(authProvider.future);
    return user?.uid.trim() ?? '';
  }

  /// O estado atual do post na biblioteca de [uid] (doc novo se não há).
  Future<({String uid, BlogLibraryEntry entry})?> _current(
    String postId,
  ) async {
    final uid = await _uid();
    if (uid.isEmpty || postId.isEmpty) return null;
    final library = await _ref.read(blogLibraryProvider.future);
    final remote = library[postId];
    final local = _written['$uid/$postId'];
    final remoteAt = remote?.updatedAt;
    final useRemote =
        local == null ||
        (remote != null && remoteAt != null && remoteAt.isAfter(local.at));
    return (
      uid: uid,
      entry: useRemote
          ? remote ?? BlogLibraryEntry(postId: postId)
          : local.entry,
    );
  }

  /// Grava sem esperar o servidor; a falha (ex.: rule) vai ao Crashlytics e
  /// o stream devolve o estado de verdade.
  void _write(String uid, BlogLibraryEntry entry) {
    _written['$uid/${entry.postId}'] = (entry: entry, at: _now());
    unawaited(
      _ref
          .read(blogRepositoryProvider)
          .writeLibraryEntry(uid, entry)
          .catchError(
            (Object e, StackTrace st) =>
                recordFlowError('blog_library_write', e, st),
          ),
    );
  }

  /// Salva ou tira dos salvos; devolve o estado novo.
  Future<bool> toggleSaved(String postId) async {
    final current = await _current(postId);
    if (current == null) throw StateError('Sem sessão.');
    final next = current.entry.withSaved(!current.entry.saved, _now());
    _write(current.uid, next);
    return next.saved;
  }

  /// Abriu o post: grava o início da leitura uma vez só.
  Future<void> markOpened(String postId) async {
    final current = await _current(postId);
    if (current == null || current.entry.readStartedAt != null) return;
    _write(current.uid, current.entry.withOpened(_now()));
  }

  /// Leu até [progress] (0..1). Só grava quando avança.
  Future<void> reportProgress(String postId, double progress) async {
    final current = await _current(postId);
    if (current == null) return;
    final before = current.entry;
    final next = before.withProgress(progress, _now());
    if (next.progress <= before.progress &&
        next.finishedAt == before.finishedAt &&
        next.readStartedAt == before.readStartedAt) {
      return;
    }
    _write(current.uid, next);
  }

  /// "Ajudou" do atleta: cria ou apaga a própria reação.
  Future<void> setHelpful(String postId, {required bool helpful}) async {
    final uid = await _uid();
    if (uid.isEmpty || postId.isEmpty) return;
    await _ref
        .read(blogRepositoryProvider)
        .setHelpful(postId, uid, helpful: helpful);
  }
}

/// Avisos do blog por categoria (`blogNotifyPrefs/{uid}`). Sem sessão fica
/// carregando, pelo mesmo motivo da biblioteca.
final blogNotifyPrefsProvider = StreamProvider<BlogNotifyPrefs>((ref) {
  final uid = ref.watch(_blogUidProvider);
  if (uid.isEmpty) return const Stream.empty();
  return ref.watch(blogRepositoryProvider).watchNotifyPrefs(uid);
});

/// Push ligado nas Configurações (`notificationPreferences.channels.push`)?
/// `null` enquanto o perfil carrega. Desligado, o servidor não manda nenhum
/// push do blog — os switches por categoria não teriam efeito.
final blogPushChannelOnProvider = Provider.autoDispose<bool?>((ref) {
  final profile = ref.watch(athleteProfileProvider).valueOrNull;
  return profile?.notificationPreferences.channels.push;
});

final blogNotifyPrefsControllerProvider = Provider<BlogNotifyPrefsController>(
  (ref) => BlogNotifyPrefsController(ref),
);

/// Liga e desliga categorias. Como na biblioteca, parte do último doc que o
/// aparelho gravou até o stream trazer um mais novo do servidor, e não espera
/// a confirmação (offline ela não chega).
class BlogNotifyPrefsController {
  BlogNotifyPrefsController(this._ref);

  final Ref _ref;
  ({String uid, BlogNotifyPrefs prefs, DateTime at})? _written;

  Future<BlogNotifyPrefs?> setCategory(
    String categoryKey, {
    required bool on,
  }) async {
    var uid = _ref.read(_blogUidProvider);
    if (uid.isEmpty) {
      uid = (await _ref.read(authProvider.future))?.uid.trim() ?? '';
    }
    if (uid.isEmpty) return null;
    final remote = await _ref.read(blogNotifyPrefsProvider.future);
    final local = _written;
    final remoteAt = remote.updatedAt;
    final useRemote =
        local == null ||
        local.uid != uid ||
        (remoteAt != null && remoteAt.isAfter(local.at));
    final current = useRemote ? remote : local.prefs;
    final next = current.withCategory(categoryKey, on: on);
    _written = (uid: uid, prefs: next, at: DateTime.now());
    unawaited(
      _ref
          .read(blogRepositoryProvider)
          .writeNotifyPrefs(uid, next)
          .catchError(
            (Object e, StackTrace st) =>
                recordFlowError('blog_notify_prefs_write', e, st),
          ),
    );
    return next;
  }
}

/// Relógio das sessões de leitura (o teste troca por um controlável).
final blogReadClockProvider = Provider<DateTime Function()>(
  (ref) => DateTime.now,
);

final blogReadRecorderProvider = Provider<BlogReadRecorder>(
  (ref) => BlogReadRecorder(ref),
);

/// Grava a sessão de leitura em `blogReads` ao fechar. Sem esperar o servidor
/// (offline o SDK enfileira) e sem quebrar a tela se falhar.
class BlogReadRecorder {
  BlogReadRecorder(this._ref);

  final Ref _ref;

  /// Fecha [session] e grava se valer (logado, categoria conhecida, ≥ 5 s).
  /// Sessão já fechada não grava de novo.
  void record(BlogReadSession session) {
    final payload = session.close(uid: _ref.read(_blogUidProvider));
    if (payload == null) return;
    try {
      unawaited(
        _ref
            .read(blogRepositoryProvider)
            .recordRead(payload)
            .catchError(
              (Object e, StackTrace st) =>
                  recordFlowError('blog_read_write', e, st),
            ),
      );
    } catch (e, st) {
      recordFlowError('blog_read_write', e, st);
    }
  }
}

/// uid da sessão ("" sem login): os comentários só existem com sessão (a rule
/// exige auth), e o "Apagar" só aparece no próprio.
final blogSessionUidProvider = Provider<String>(
  (ref) => ref.watch(_blogUidProvider),
);

/// Quantos aprovados por página ("Ver mais" pede outra).
const blogCommentsPageSize = 30;

/// Aprovados do post, do mais novo, até `limit`.
final blogApprovedCommentsProvider = StreamProvider.autoDispose
    .family<List<BlogComment>, ({String postId, int limit})>((ref, args) {
      if (ref.watch(_blogUidProvider).isEmpty) return const Stream.empty();
      return ref
          .watch(blogRepositoryProvider)
          .watchApprovedComments(args.postId, limit: args.limit);
    });

/// Os do atleta no post, em qualquer status (pendente/recusado só ele vê).
final blogOwnCommentsProvider = StreamProvider.autoDispose
    .family<List<BlogComment>, String>((ref, postId) {
      final uid = ref.watch(_blogUidProvider);
      if (uid.isEmpty) return const Stream.empty();
      return ref.watch(blogRepositoryProvider).watchOwnComments(postId, uid);
    });

final blogCommentsControllerProvider = Provider<BlogCommentsController>(
  (ref) => BlogCommentsController(ref),
);

/// Envia (callable `postBlogComment`) e apaga o próprio comentário. Os dois
/// esperam o servidor: a tela mostra o erro (pendentes demais, post fora do
/// ar) em vez de fingir que deu certo.
class BlogCommentsController {
  BlogCommentsController(this._ref);

  final Ref _ref;

  Future<String> post(
    String postId, {
    required String text,
    required BlogCommentKind kind,
  }) => _ref
      .read(blogRepositoryProvider)
      .postComment(postId, text: text.trim(), kind: kind);

  Future<void> delete(String postId, String commentId) =>
      _ref.read(blogRepositoryProvider).deleteComment(postId, commentId);
}

final _blogCategoriesStreamProvider = StreamProvider<BlogTaxonomy>((ref) {
  return ref.watch(blogRepositoryProvider).watchCategories();
});

/// Lista efetiva de categorias (padrões ⊕ `blogCategories`). Carregando ou
/// com falha de leitura: só as 6 de origem, nunca vazio.
final blogTaxonomyProvider = Provider<BlogTaxonomy>((ref) {
  return ref.watch(_blogCategoriesStreamProvider).valueOrNull ??
      BlogTaxonomy.defaults;
});
