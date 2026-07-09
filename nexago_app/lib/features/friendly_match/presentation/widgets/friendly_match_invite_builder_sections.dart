import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../arenas/domain/arena_list_item.dart';
import '../../../athlete/domain/athlete_firestore_codes.dart';
import '../../domain/friendly_match_models.dart';

class InviteBuilderSectionTitle extends StatelessWidget {
  const InviteBuilderSectionTitle({
    super.key,
    required this.label,
    this.icon,
  });

  final String label;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final style = AppTypography.soraRegular(
      fontSize: 15,
      fontWeight: FontWeight.w800,
      color: context.themeColors.onSurface,
    );

    if (icon == null) {
      return Text(label, style: style);
    }

    return Row(
      children: [
        Icon(icon, size: 18, color: AppColors.brand),
        const SizedBox(width: 8),
        Text(label, style: style),
      ],
    );
  }
}

class InviteBuilderObjectivePicker extends StatelessWidget {
  const InviteBuilderObjectivePicker({
    super.key,
    required this.selected,
    required this.onSelected,
  });

  final FriendlyMatchObjective selected;
  final ValueChanged<FriendlyMatchObjective> onSelected;

  static const _options = <(FriendlyMatchObjective, IconData, String)>[
    (FriendlyMatchObjective.training, Icons.fitness_center_rounded, 'Sem placar'),
    (FriendlyMatchObjective.friendly, Icons.circle, 'Jogo casual'),
    (FriendlyMatchObjective.partner, Icons.person_add_alt_1_rounded, 'Fixa p/ torneios'),
  ];

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 0; i < _options.length; i++) ...[
          if (i > 0) const SizedBox(width: 8),
          Expanded(
            child: _ObjectiveCard(
              objective: _options[i].$1,
              icon: _options[i].$2,
              subtitle: _options[i].$3,
              selected: selected == _options[i].$1,
              onTap: () => onSelected(_options[i].$1),
            ),
          ),
        ],
      ],
    );
  }
}

class _ObjectiveCard extends StatelessWidget {
  const _ObjectiveCard({
    required this.objective,
    required this.icon,
    required this.subtitle,
    required this.selected,
    required this.onTap,
  });

  final FriendlyMatchObjective objective;
  final IconData icon;
  final String subtitle;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final iconColor =
        selected ? AppColors.brand : colors.onSurfaceMuted.withValues(alpha: 0.7);

    return Material(
      color: colors.surfaceCard,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected
                  ? AppColors.brand
                  : colors.outline.withValues(alpha: 0.2),
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                size: objective == FriendlyMatchObjective.friendly ? 14 : 20,
                color: iconColor,
              ),
              const SizedBox(height: 8),
              Text(
                objective.label,
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.soraRegular(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: selected ? colors.onSurface : colors.onSurfaceMuted,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.mono(
                  fontSize: 9,
                  fontWeight: FontWeight.w500,
                  color: colors.onSurfaceMuted,
                  height: 1.2,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class InviteBuilderSportChips extends StatelessWidget {
  const InviteBuilderSportChips({
    super.key,
    required this.sports,
    required this.selectedSport,
    required this.onSelected,
  });

  final List<String> sports;
  final String? selectedSport;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 40,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: sports.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final sport = sports[index];
          final label =
              AthleteFirestoreCodes.sportFirestoreToLabel(sport) ?? sport;
          final selected = selectedSport == sport;
          return FilterChip(
            selected: selected,
            showCheckmark: false,
            avatar: Icon(
              _sportIcon(sport),
              size: 18,
              color: selected
                  ? AppColors.black
                  : context.themeColors.onSurfaceMuted,
            ),
            label: Text(
              label,
              style: AppTypography.soraRegular(
                fontSize: 13,
                fontWeight: FontWeight.w800,
                color: selected
                    ? AppColors.black
                    : context.themeColors.onSurface,
              ),
            ),
            selectedColor: AppColors.brand,
            backgroundColor: context.themeColors.surfaceCard,
            side: BorderSide(
              color: selected
                  ? AppColors.brand
                  : context.themeColors.outline.withValues(alpha: 0.35),
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(999),
            ),
            onSelected: (_) => onSelected(sport),
          );
        },
      ),
    );
  }
}

IconData _sportIcon(String sport) {
  switch (sport.toUpperCase()) {
    case 'FUTEBOL':
      return Icons.sports_soccer_rounded;
    case 'BEACH_TENNIS':
    case 'TENIS':
      return Icons.sports_tennis_rounded;
    case 'BASQUETE':
      return Icons.sports_basketball_rounded;
    case 'VOLEI_PRAIA':
    case 'VOLEI_QUADRA':
      return Icons.sports_volleyball_rounded;
    default:
      return Icons.sports_rounded;
  }
}

class InviteBuilderDateRow extends StatelessWidget {
  const InviteBuilderDateRow({
    super.key,
    required this.days,
    required this.selectedDay,
    required this.onDaySelected,
  });

  final List<DateTime> days;
  final DateTime? selectedDay;
  final ValueChanged<DateTime> onDaySelected;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 76,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: days.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final day = days[index];
          final selected = selectedDay != null &&
              _isSameDay(day, selectedDay!);
          return _DateCard(
            day: day,
            selected: selected,
            onTap: () => onDaySelected(day),
          );
        },
      ),
    );
  }
}

class _DateCard extends StatelessWidget {
  const _DateCard({
    required this.day,
    required this.selected,
    required this.onTap,
  });

  final DateTime day;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final weekday = DateFormat('EEE', 'pt_BR')
        .format(day)
        .replaceAll('.', '')
        .toUpperCase();
    final shortWeekday =
        weekday.length > 3 ? weekday.substring(0, 3) : weekday;

    return Material(
      color: colors.surfaceCard,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: 52,
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected
                  ? AppColors.brand
                  : colors.outline.withValues(alpha: 0.2),
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                shortWeekday,
                style: AppTypography.mono(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: selected ? AppColors.brand : colors.onSurfaceMuted,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '${day.day}',
                style: AppTypography.soraRegular(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: colors.onSurface,
                ),
              ),
              if (selected) ...[
                const SizedBox(height: 4),
                Container(
                  width: 5,
                  height: 5,
                  decoration: const BoxDecoration(
                    color: AppColors.win,
                    shape: BoxShape.circle,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class InviteBuilderTimeRow extends StatelessWidget {
  const InviteBuilderTimeRow({
    super.key,
    required this.times,
    required this.selectedTime,
    required this.onTimeSelected,
  });

  final List<TimeOfDay> times;
  final TimeOfDay? selectedTime;
  final ValueChanged<TimeOfDay> onTimeSelected;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final time in times)
          _TimeChip(
            time: time,
            selected: selectedTime != null && _sameTime(time, selectedTime!),
            onTap: () => onTimeSelected(time),
          ),
      ],
    );
  }
}

class _TimeChip extends StatelessWidget {
  const _TimeChip({
    required this.time,
    required this.selected,
    required this.onTap,
  });

  final TimeOfDay time;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final label =
        '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';

    return Material(
      color: colors.surfaceCard,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: selected
                  ? AppColors.brand
                  : colors.outline.withValues(alpha: 0.2),
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Text(
            label,
            style: AppTypography.mono(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: selected ? AppColors.brand : colors.onSurfaceMuted,
            ),
          ),
        ),
      ),
    );
  }
}

enum InviteBuilderLocationMode { catalog, other }

class InviteBuilderWhereSection extends StatelessWidget {
  const InviteBuilderWhereSection({
    super.key,
    required this.mode,
    required this.onModeChanged,
    required this.onPickArena,
    this.arena,
    required this.freeTextController,
  });

  final InviteBuilderLocationMode mode;
  final ValueChanged<InviteBuilderLocationMode> onModeChanged;
  final VoidCallback onPickArena;
  final ArenaListItem? arena;
  final TextEditingController freeTextController;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            color: colors.surfaceCard,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: colors.outline.withValues(alpha: 0.15),
            ),
          ),
          child: Row(
            children: [
              Expanded(
                child: _LocationModeTab(
                  label: 'Arena do catálogo',
                  selected: mode == InviteBuilderLocationMode.catalog,
                  onTap: () => onModeChanged(InviteBuilderLocationMode.catalog),
                ),
              ),
              Expanded(
                child: _LocationModeTab(
                  label: 'Outro local',
                  selected: mode == InviteBuilderLocationMode.other,
                  onTap: () => onModeChanged(InviteBuilderLocationMode.other),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        if (mode == InviteBuilderLocationMode.catalog)
          arena == null
              ? _ArenaPickerPlaceholder(onTap: onPickArena)
              : _SelectedArenaCard(
                  arena: arena!,
                  onChange: onPickArena,
                )
        else
          TextField(
            controller: freeTextController,
            style: AppTypography.soraRegular(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: colors.onSurface,
            ),
            decoration: InputDecoration(
              hintText: 'Ex.: quadra da Praia de Camburi',
              hintStyle: TextStyle(color: colors.onSurfaceMuted),
              filled: true,
              fillColor: colors.surfaceCard,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(
                  color: colors.outline.withValues(alpha: 0.2),
                ),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(
                  color: colors.outline.withValues(alpha: 0.2),
                ),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: AppColors.brand),
              ),
            ),
          ),
      ],
    );
  }
}

class _LocationModeTab extends StatelessWidget {
  const _LocationModeTab({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Material(
      color: selected ? colors.surfaceRaised : Colors.transparent,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: selected
                ? Border.all(color: colors.outline.withValues(alpha: 0.25))
                : null,
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: AppTypography.soraRegular(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: selected ? colors.onSurface : colors.onSurfaceMuted,
            ),
          ),
        ),
      ),
    );
  }
}

class _ArenaPickerPlaceholder extends StatelessWidget {
  const _ArenaPickerPlaceholder({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: _InviteBuilderDashedBorder(
          color: colors.outline.withValues(alpha: 0.35),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 28),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.add_rounded,
                  size: 18,
                  color: colors.onSurfaceMuted,
                ),
                const SizedBox(width: 6),
                Text(
                  'Escolher arena do catálogo',
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: colors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SelectedArenaCard extends StatelessWidget {
  const _SelectedArenaCard({
    required this.arena,
    required this.onChange,
  });

  final ArenaListItem arena;
  final VoidCallback onChange;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final imageUrl = arena.coverUrl ?? arena.logoUrl;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.outline.withValues(alpha: 0.15)),
      ),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: SizedBox(
              width: 52,
              height: 52,
              child: imageUrl != null && imageUrl.isNotEmpty
                  ? CachedNetworkImage(
                      imageUrl: imageUrl,
                      fit: BoxFit.cover,
                      errorWidget: (_, __, ___) =>
                          _ArenaImagePlaceholder(colors: colors),
                    )
                  : _ArenaImagePlaceholder(colors: colors),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  arena.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  arena.locationLabel,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.mono(
                    fontSize: 11,
                    color: colors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: onChange,
            child: Text(
              'Trocar',
              style: AppTypography.soraRegular(
                fontSize: 13,
                fontWeight: FontWeight.w800,
                color: AppColors.brand,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ArenaImagePlaceholder extends StatelessWidget {
  const _ArenaImagePlaceholder({required this.colors});

  final AppThemeColors colors;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: colors.surfaceRaised,
      child: Icon(
        Icons.stadium_outlined,
        color: colors.onSurfaceMuted.withValues(alpha: 0.5),
      ),
    );
  }
}

class InviteBuilderSendButton extends StatelessWidget {
  const InviteBuilderSendButton({
    super.key,
    required this.onPressed,
    this.busy = false,
  });

  final VoidCallback? onPressed;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: FilledButton(
        onPressed: busy ? null : onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.brand,
          foregroundColor: AppColors.black,
          padding: const EdgeInsets.symmetric(vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        child: busy
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: AppColors.black,
                ),
              )
            : Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    'Enviar convite',
                    style: AppTypography.soraRegular(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: AppColors.black,
                    ),
                  ),
                  const SizedBox(width: 6),
                  const Icon(Icons.arrow_forward_rounded, size: 18),
                ],
              ),
      ),
    );
  }
}

class _InviteBuilderDashedBorder extends StatelessWidget {
  const _InviteBuilderDashedBorder({
    required this.child,
    required this.color,
  });

  final Widget child;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _DashedBorderPainter(color: color, radius: 14),
      child: child,
    );
  }
}

class _DashedBorderPainter extends CustomPainter {
  _DashedBorderPainter({required this.color, required this.radius});

  final Color color;
  final double radius;

  @override
  void paint(Canvas canvas, Size size) {
    final rrect = RRect.fromRectAndRadius(
      Offset.zero & size,
      Radius.circular(radius),
    );
    final path = Path()..addRRect(rrect);
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;

    for (final metric in path.computeMetrics()) {
      var distance = 0.0;
      const dash = 6.0;
      const gap = 4.0;
      while (distance < metric.length) {
        final next = math.min(distance + dash, metric.length);
        canvas.drawPath(metric.extractPath(distance, next), paint);
        distance += dash + gap;
      }
    }
  }

  @override
  bool shouldRepaint(covariant _DashedBorderPainter oldDelegate) =>
      oldDelegate.color != color || oldDelegate.radius != radius;
}

bool _isSameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

bool _sameTime(TimeOfDay a, TimeOfDay b) =>
    a.hour == b.hour && a.minute == b.minute;

List<DateTime> inviteBuilderDayOptions({DateTime? now, int count = 14}) {
  final reference = now ?? DateTime.now();
  final today = DateTime(reference.year, reference.month, reference.day);
  return List.generate(count, (index) => today.add(Duration(days: index)));
}

List<TimeOfDay> inviteBuilderTimeOptions(TimeOfDay? selected) {
  const defaultHours = [18, 19, 20];
  final hours = <int>{...defaultHours};
  if (selected != null) hours.add(selected.hour);
  final sorted = hours.toList()..sort();
  return sorted
      .map((hour) => TimeOfDay(hour: hour, minute: selected?.minute ?? 0))
      .toList();
}
