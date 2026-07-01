import 'arena_promotion.dart';

const _weekdayShortLabels = <int, String>{
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sáb',
  7: 'Dom',
};

String arenaPromotionStatusLabel(ArenaPromotion promotion) =>
    promotion.active ? 'Ativa' : 'Pausada';

String arenaPromotionDiscountLabel(ArenaPromotion promotion) {
  final fixed = promotion.fixedPricePerHourReais;
  if (fixed != null && fixed > 0) {
    final value = fixed == fixed.roundToDouble()
        ? fixed.toStringAsFixed(0)
        : fixed.toStringAsFixed(2).replaceAll('.', ',');
    return 'R\$ $value/h';
  }

  final discount = promotion.discountPercent;
  if (discount != null && discount > 0) {
    final value = discount == discount.roundToDouble()
        ? discount.toStringAsFixed(0)
        : discount.toStringAsFixed(1).replaceAll('.', ',');
    return '$value% off';
  }

  return 'Sem desconto';
}

String arenaPromotionScheduleLabel(ArenaPromotion promotion) {
  final days = _formatWeekdays(promotion.weekdays);
  final window = '${promotion.startTime}–${promotion.endTime}';
  if (days.isEmpty) return window;
  return '$days · $window';
}

String arenaPromotionSummaryLabel(ArenaPromotion promotion) {
  return '${arenaPromotionScheduleLabel(promotion)} · ${arenaPromotionDiscountLabel(promotion)}';
}

String _formatWeekdays(List<int> weekdays) {
  if (weekdays.isEmpty) return '';
  final sorted = weekdays.toSet().toList()..sort();
  if (sorted.length == 7) return 'Todos os dias';

  final runs = <List<int>>[];
  var run = <int>[sorted.first];
  for (var i = 1; i < sorted.length; i++) {
    if (sorted[i] == sorted[i - 1] + 1) {
      run.add(sorted[i]);
    } else {
      runs.add(run);
      run = <int>[sorted[i]];
    }
  }
  runs.add(run);

  return runs.map(_formatWeekdayRun).join(', ');
}

String _formatWeekdayRun(List<int> run) {
  if (run.isEmpty) return '';
  if (run.length == 1) return _weekdayShortLabels[run.first] ?? '';
  return '${_weekdayShortLabels[run.first]}–${_weekdayShortLabels[run.last]}';
}
