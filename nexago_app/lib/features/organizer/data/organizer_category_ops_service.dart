import 'package:cloud_functions/cloud_functions.dart';

class OrganizerCategoryOpsService {
  OrganizerCategoryOpsService({FirebaseFunctions? functions})
      : _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFunctions _functions;

  Future<void> generateCategoryBracket({
    required String tournamentId,
    required String categoryId,
    required String format,
    List<String>? seeds,
    List<Map<String, dynamic>>? groupsPreview,
    Map<String, dynamic>? bracketConfig,
    bool force = false,
  }) async {
    final callable = _functions.httpsCallable('generateCategoryBracket');
    await callable.call({
      'tournamentId': tournamentId.trim(),
      'categoryId': categoryId.trim(),
      'format': format.trim(),
      if (seeds != null) 'seeds': seeds,
      if (groupsPreview != null) 'groupsPreview': groupsPreview,
      if (bracketConfig != null) 'bracketConfig': bracketConfig,
      if (force) 'force': true,
    });
  }

  Future<void> confirmRegistrationPayment({
    required String registrationId,
  }) async {
    final callable =
        _functions.httpsCallable('organizerConfirmRegistrationPayment');
    await callable.call({'registrationId': registrationId.trim()});
  }

  Future<void> moveToWaitlist({required String registrationId}) async {
    final callable = _functions.httpsCallable('organizerMoveToWaitlist');
    await callable.call({'registrationId': registrationId.trim()});
  }

  Future<void> removeFromCategory({required String registrationId}) async {
    final callable = _functions.httpsCallable('organizerRemoveFromCategory');
    await callable.call({'registrationId': registrationId.trim()});
  }

  Future<Map<String, dynamic>> sendCategoryCommunication({
    required String tournamentId,
    required String categoryId,
    required String message,
    required String audience,
    bool sendPush = true,
  }) async {
    final callable = _functions.httpsCallable('sendCategoryCommunication');
    final result = await callable.call({
      'tournamentId': tournamentId.trim(),
      'categoryId': categoryId.trim(),
      'message': message.trim(),
      'audience': audience.trim(),
      'sendPush': sendPush,
    });
    return Map<String, dynamic>.from(result.data as Map? ?? {});
  }

  Future<void> resendRegistrationPayment({
    required String registrationId,
  }) async {
    final callable = _functions.httpsCallable('resendRegistrationPayment');
    await callable.call({'registrationId': registrationId.trim()});
  }
}
