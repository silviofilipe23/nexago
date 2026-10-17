import 'dart:async';
import 'dart:math';
import 'dart:typed_data';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/functions_region.dart';
import '../domain/store_customize_rules.dart';
import '../domain/store_customize_service.dart';

/// Personalização no Firebase: `checkStoreCustomName`,
/// `addStoreCustomItemToCart` (região do cliente) e o envio da imagem em
/// `store/custom-uploads/{uid}/` — a rule do Storage só deixa o dono criar.
class FirebaseStoreCustomizeService implements StoreCustomizeService {
  FirebaseStoreCustomizeService({
    FirebaseFunctions? functions,
    FirebaseStorage? storage,
  })  : _functions = functions ?? nexagoFunctions,
        _storage = storage ?? FirebaseStorage.instance;

  final FirebaseFunctions _functions;
  final FirebaseStorage _storage;

  static const String uploadPrefix = 'store/custom-uploads';

  /// Envio parado por mais que isso é cancelado de verdade (senão o SDK
  /// segue tentando por baixo por até 10 minutos).
  static const Duration _uploadTimeout = Duration(minutes: 3);

  /// Códigos sem mensagem nossa (callable fora do ar, erro interno): o texto
  /// cru ("INTERNAL", "NOT FOUND") não serve para o atleta.
  static const Set<String> _rawCodes = {
    'internal',
    'not-found',
    'unavailable',
    'deadline-exceeded',
    'unknown',
    'cancelled',
  };

  static StoreCustomizeException _mapError(FirebaseFunctionsException e) {
    final message = e.message?.trim() ?? '';
    return StoreCustomizeException(
      _rawCodes.contains(e.code) ? '' : message,
      code: e.code,
    );
  }

  @override
  Future<StoreNameCheck> checkName({
    required String productId,
    required String text,
  }) async {
    try {
      final result = await _functions
          .httpsCallable('checkStoreCustomName')
          .call<Object?>({'productId': productId, 'text': text});
      final data = result.data is Map
          ? Map<String, Object?>.from(result.data as Map)
          : const <String, Object?>{};
      if (data['ok'] == true) return const StoreNameCheck.ok();
      final problem = StoreNameProblem.from(data['problem']);
      return problem == null
          ? const StoreNameCheck.ok()
          : StoreNameCheck.problem(problem);
    } on FirebaseFunctionsException catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<StoreCustomCartResult> addToCart(
    StoreCustomCartRequest request,
  ) async {
    try {
      final result = await _functions
          .httpsCallable('addStoreCustomItemToCart')
          .call<Object?>(request.toMap());
      final data = result.data is Map
          ? Map<String, Object?>.from(result.data as Map)
          : const <String, Object?>{};
      int cents(Object? v) => v is num && v.isFinite ? v.round() : 0;
      return StoreCustomCartResult(
        lineId: data['lineId'] is String ? data['lineId'] as String : '',
        extraPriceCents: cents(data['extraPriceCents']),
        unitPriceCents: cents(data['unitPriceCents']),
        quality: StoreImageQuality.from(data['quality']),
      );
    } on FirebaseFunctionsException catch (e) {
      throw _mapError(e);
    }
  }

  @override
  Future<String> uploadImage({
    required String uid,
    required Uint8List bytes,
    required String format,
    required void Function(double progress) onProgress,
  }) async {
    final path = '$uploadPrefix/$uid/${_uploadId()}.$format';
    final task = _storage.ref(path).putData(
          bytes,
          SettableMetadata(contentType: storeImageContentType(format)),
        );
    final progress = task.snapshotEvents.listen(
      (snap) {
        if (snap.totalBytes > 0) {
          onProgress(snap.bytesTransferred / snap.totalBytes);
        }
      },
      onError: (_) {},
    );
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

final storeCustomizeServiceProvider = Provider<StoreCustomizeService>((ref) {
  return FirebaseStoreCustomizeService();
});
