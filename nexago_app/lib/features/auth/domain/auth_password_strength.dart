/// Nível de força da senha (chips do cadastro).
enum PasswordStrengthLevel { weak, medium, strong }

/// Resultado da avaliação de senha para UI e validação.
class PasswordStrengthResult {
  const PasswordStrengthResult({
    required this.hasMinLength,
    required this.hasMixedCase,
    required this.hasDigit,
    required this.hasSpecial,
    required this.score,
    required this.level,
  });

  final bool hasMinLength;
  final bool hasMixedCase;
  final bool hasDigit;
  final bool hasSpecial;

  /// 0–4 critérios atendidos.
  final int score;
  final PasswordStrengthLevel level;

  bool get isStrongEnough => score >= 4;

  int get filledSegments => score.clamp(0, 4);
}

final _specialCharPattern = RegExp(r'[@#\$%^&*!?.,;:\-_+=\[\]{}|\\/`~]');

PasswordStrengthResult evaluatePasswordStrength(String password) {
  final hasMinLength = password.length >= 8;
  final hasLower = password.contains(RegExp(r'[a-z]'));
  final hasUpper = password.contains(RegExp(r'[A-Z]'));
  final hasMixedCase = hasLower && hasUpper;
  final hasDigit = password.contains(RegExp(r'[0-9]'));
  final hasSpecial = _specialCharPattern.hasMatch(password);

  final score = [
    hasMinLength,
    hasMixedCase,
    hasDigit,
    hasSpecial,
  ].where((ok) => ok).length;

  final level = switch (score) {
    <= 1 => PasswordStrengthLevel.weak,
    2 || 3 => PasswordStrengthLevel.medium,
    _ => PasswordStrengthLevel.strong,
  };

  return PasswordStrengthResult(
    hasMinLength: hasMinLength,
    hasMixedCase: hasMixedCase,
    hasDigit: hasDigit,
    hasSpecial: hasSpecial,
    score: score,
    level: level,
  );
}

String passwordStrengthLabel(PasswordStrengthLevel level) {
  return switch (level) {
    PasswordStrengthLevel.weak => 'FRACA',
    PasswordStrengthLevel.medium => 'MÉDIA',
    PasswordStrengthLevel.strong => 'FORTE',
  };
}
