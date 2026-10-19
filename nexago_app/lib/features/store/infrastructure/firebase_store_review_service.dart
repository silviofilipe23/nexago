import 'dart:async';
import 'dart:math';
import 'dart:typed_data';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/functions_region.dart';
import '../domain/store_review_models.dart';
import '../domain/store_review_rules.dart';
import '../domain/store_review_service.dart';

/// Avaliação no Firebase: `submitStoreOrderReview` na região do cliente
/// (`nexagoFunctions`, como as outras callables da Loja) e as fotos em
/// `store/review-uploads/{uid}/` — a rule do Storage só deixa o dono criar,
/// sem sobrescrever.
class FirebaseStoreReviewService implements StoreReviewService {
  FirebaseStoreReviewService({
    FirebaseFunctions? functions,
    FirebaseStorage? storage,
  }) : _functions = functions ?? nexagoFunctions,
       _storage = storage;

  final FirebaseFunctions _functions;
  final FirebaseStorage? _storage;

  static const String uploadPrefix = 'store/review-uploads';

  /// Envio parado por mais que isso é cancelado de verdade (senão o SDK
  /// segue tentando por baixo por até 10 minutos).
  static const Duration _uploadTimeout = Duration(minutes: 3);

  @override
  Future<StoreReviewSubmitResult> submit(
    StoreReviewSubmission submission,
  ) async {
    try {
      final result = await _functions
          .httpsCallable('submitStoreOrderReview')
          .call<Object?>(submission.toMap());
      final data = result.data is Map
          ? Map<String, Object?>.from(result.data as Map)
          : const <String, Object?>{};
      final until = data['editableUntil'];
      return StoreReviewSubmitResult(
        created: data['created'] == true,
        editableUntil: until is String ? DateTime.tryParse(until) : null,
      );
    } on FirebaseFunctionsException catch (e) {
      throw StoreReviewException(
        storeReviewErrorMessage(e.code, e.message),
        code: e.code,
      );
    } catch (_) {
      // Sem rede ou resposta inesperada: a mensagem genérica.
      throw StoreReviewException(storeReviewErrorMessage('unknown', null));
    }
  }

  @override
  Future<String> uploadPhoto({
    required String uid,
    required Uint8List bytes,
    required String contentType,
    required void Function(double progress) onProgress,
  }) async {
    final storage = _storage ?? FirebaseStorage.instance;
    final path =
        '$uploadPrefix/$uid/${_uploadId()}.${storeReviewPhotoExtension(contentType)}';
    final task = storage
        .ref(path)
        .putData(bytes, SettableMetadata(contentType: contentType));
    final progress = task.snapshotEvents.listen((snap) {
      if (snap.totalBytes > 0) {
        onProgress(snap.bytesTransferred / snap.totalBytes);
      }
    }, onError: (_) {});
    try {
      await task.timeout(_uploadTimeout);
    } on TimeoutException {
      unawaited(task.cancel());
      rethrow;
    } finally {
      unawaited(progress.cancel());
    }
    onProgress(1);
    return path;
  }

  /// Cada envio é um arquivo novo (a rule não deixa sobrescrever).
  static String _uploadId() {
    final random = Random.secure();
    return [
      for (var i = 0; i < 16; i++)
        random.nextInt(256).toRadixString(16).padLeft(2, '0'),
    ].join();
  }
}

final storeReviewServiceProvider = Provider<StoreReviewService>((ref) {
  return FirebaseStoreReviewService();
});
