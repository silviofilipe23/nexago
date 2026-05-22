import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/profile_completion_models.dart';

void main() {
  test('profile step event ids are stable', () {
    expect(ProfileCompletionStep.photo.id, 'photo');
    expect(
      'profile_step_${ProfileCompletionStep.goals.id}',
      'profile_step_goals',
    );
  });

  test('total profile completion XP is 150', () {
    final total = ProfileCompletionStep.values
        .fold<int>(0, (sum, s) => sum + s.xpReward);
    expect(total, 150);
  });
}
