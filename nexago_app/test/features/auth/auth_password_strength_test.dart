import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/auth/domain/auth_password_strength.dart';

void main() {
  test('empty password is weak with score 0', () {
    final r = evaluatePasswordStrength('');
    expect(r.score, 0);
    expect(r.level, PasswordStrengthLevel.weak);
    expect(r.isStrongEnough, isFalse);
  });

  test('password with only length is weak', () {
    final r = evaluatePasswordStrength('12345678');
    expect(r.hasMinLength, isTrue);
    expect(r.score, 2);
    expect(r.level, PasswordStrengthLevel.medium);
  });

  test('strong password meets all criteria', () {
    final r = evaluatePasswordStrength('Abcdef1!');
    expect(r.hasMinLength, isTrue);
    expect(r.hasMixedCase, isTrue);
    expect(r.hasDigit, isTrue);
    expect(r.hasSpecial, isTrue);
    expect(r.score, 4);
    expect(r.level, PasswordStrengthLevel.strong);
    expect(r.isStrongEnough, isTrue);
    expect(r.filledSegments, 4);
  });

  test('passwordStrengthLabel', () {
    expect(passwordStrengthLabel(PasswordStrengthLevel.strong), 'FORTE');
  });
}
