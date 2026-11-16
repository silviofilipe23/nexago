import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';

import '../../../core/firebase/functions_region.dart';
import '../domain/benefit_event.dart';
import '../domain/benefits_club_repository.dart';
import '../domain/my_benefits.dart';
import '../domain/partner_lead.dart';

/// `platform` dos eventos e do lead (o backend aceita ios/android/web/unknown).
String benefitsPlatform() {
  if (kIsWeb) return 'web';
  return switch (defaultTargetPlatform) {
    TargetPlatform.iOS => 'ios',
    TargetPlatform.android => 'android',
    _ => 'unknown',
  };
}

/// Callables do clube (southamerica-east1): `trackBenefitEvent`,
/// `submitPartnerLead`, `claimBenefit`, `getMyBenefits` e `answerBenefitUse`.
class CallableBenefitsClubService implements BenefitsClubService {
  CallableBenefitsClubService({FirebaseFunctions? functions})
    : _functionsOverride = functions;

  final FirebaseFunctions? _functionsOverride;

  FirebaseFunctions get _functions => _functionsOverride ?? nexagoFunctions;

  static const String _surface = 'app';

  @override
  Future<void> trackEvent({
    required BenefitEventType type,
    required BenefitSource source,
    String? partnerId,
  }) async {
    await _functions.httpsCallable('trackBenefitEvent').call(<String, dynamic>{
      'type': type.key,
      if (partnerId != null) 'partnerId': partnerId,
      'source': source.key,
      'surface': _surface,
      'platform': benefitsPlatform(),
    });
  }

  @override
  Future<String> submitLead(PartnerLeadSubmission lead) async {
    final result = await _functions
        .httpsCallable('submitPartnerLead')
        .call(<String, dynamic>{
          'partnerId': lead.partnerId,
          'name': lead.name,
          'whatsapp': lead.whatsapp,
          'neighborhood': lead.neighborhood,
          'cep': lead.cep,
          'consent': true,
          'source': lead.source.key,
          'surface': _surface,
          'platform': benefitsPlatform(),
        });
    final data = result.data;
    final message = data is Map ? data['successMessage'] : null;
    return message is String ? message.trim() : '';
  }

  @override
  Future<String?> claimBenefit({
    required String partnerId,
    required BenefitSource source,
  }) async {
    final result = await _functions
        .httpsCallable('claimBenefit')
        .call(<String, dynamic>{
          'partnerId': partnerId,
          'source': source.key,
          'surface': _surface,
          'platform': benefitsPlatform(),
        });
    final data = result.data;
    final coupon = data is Map ? data['coupon'] : null;
    return coupon is String && coupon.trim().isNotEmpty ? coupon.trim() : null;
  }

  @override
  Future<MyBenefits> getMyBenefits() async {
    final result = await _functions.httpsCallable('getMyBenefits').call();
    return MyBenefits.fromMap(result.data);
  }

  @override
  Future<void> answerBenefitUse({
    required String partnerId,
    required bool used,
  }) async {
    await _functions.httpsCallable('answerBenefitUse').call(<String, dynamic>{
      'partnerId': partnerId,
      'used': used,
    });
  }
}
