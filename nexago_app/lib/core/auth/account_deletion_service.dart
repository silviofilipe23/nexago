import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Chama a Cloud Function `deleteOwnAccount`, que apaga os dados pessoais do
/// usuário e remove a conta de autenticação (LGPD + App Store 5.1.1(v)).
class AccountDeletionService {
  AccountDeletionService({FirebaseFunctions? functions})
      : _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFunctions _functions;

  Future<void> deleteOwnAccount() async {
    await _functions.httpsCallable('deleteOwnAccount').call<void>();
  }
}

final accountDeletionServiceProvider = Provider<AccountDeletionService>(
  (ref) => AccountDeletionService(),
);
