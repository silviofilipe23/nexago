import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/phone_verification/domain/phone_verification_models.dart';

void main() {
  group('toE164Br', () {
    test('adds +55 to 10 and 11 digit numbers', () {
      expect(toE164Br('(62) 99999-9999'), '+5562999999999');
      expect(toE164Br('62999999999'), '+5562999999999');
      // Fixo, 10 dígitos.
      expect(toE164Br('(62) 3333-4444'), '+556233334444');
    });

    test('keeps numbers that already carry the country code', () {
      expect(toE164Br('+55 62 99999-9999'), '+5562999999999');
      expect(toE164Br('5562999999999'), '+5562999999999');
      expect(toE164Br('556233334444'), '+556233334444');
    });

    test('rejects what Phone Auth would reject anyway', () {
      expect(toE164Br(''), isNull);
      expect(toE164Br('123'), isNull);
      expect(toE164Br('629999999999999'), isNull);
      // 12–13 dígitos que não começam com 55 não são BR.
      expect(toE164Br('149999999999'), isNull);
    });
  });

  group('phoneLinkMethod', () {
    test('links when the account has no phone credential yet', () {
      expect(
        phoneLinkMethod(['password', 'google.com']),
        PhoneLinkMethod.link,
      );
      expect(phoneLinkMethod(const []), PhoneLinkMethod.link);
    });

    test('updates when a phone credential is already linked', () {
      // `linkWithCredential` devolveria `provider-already-linked` aqui.
      expect(
        phoneLinkMethod(['password', 'phone']),
        PhoneLinkMethod.update,
      );
    });
  });
}
