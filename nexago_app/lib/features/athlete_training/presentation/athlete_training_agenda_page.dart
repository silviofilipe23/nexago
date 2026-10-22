import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/time/nexago_event_timezone.dart';
import '../../athlete/domain/agenda/athlete_agenda_providers.dart';
import '../../professor_links/application/professor_links_providers.dart';
import '../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../application/athlete_training_providers.dart';
import '../domain/athlete_training.dart';
import 'widgets/training_origin_widgets.dart';
import 'widgets/training_widgets.dart';

/// O2 · Agenda de treinos — particulares, turmas da arena e aulas do centro
/// na mesma semana, com um ponto da cor da origem em cada dia.
class AthleteTrainingAgendaPage extends ConsumerStatefulWidget {
  const AthleteTrainingAgendaPage({super.key});

  @override
  ConsumerState<AthleteTrainingAgendaPage> createState() =>
      _AthleteTrainingAgendaPageState();
}

class _AthleteTrainingAgendaPageState
    extends ConsumerState<AthleteTrainingAgendaPage> {
  /// Semanas a partir de hoje (0 = esta). A janela da agenda vai a ~3.
  static const _maxWeek = 2;

  int _week = 0;
  String? _day;
  TrainingOrigin? _origin;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final now = ref.watch(professorLinksClockProvider)();
    final todayKey = nexagoEventDayKey(now);
    final trainings = ref.watch(athleteTrainingsProvider);
    final days = trainingWeekKeys(_shift(todayKey, _week * 7));
    final all = trainings ?? const <TrainingSession>[];
    final inWeek = [
      for (final t in all)
        if (days.contains(t.dateKey) && !t.isCanceled) t,
    ];
    final origins = trainingOriginsOf(all);
    final list = [
      for (final t in inWeek)
        if (trainingMatchesOrigin(t, _origin) &&
            (_day == null || t.dateKey == _day))
          t,
    ];
    final range = days.isEmpty
        ? ''
        : '${_dayMonth(days.first)} – ${_dayMonth(days.last)}';

    return ProfessorLinksScaffold(
      title: 'Agenda de treinos',
      subtitle: origins.length > 1 ? '$range · TODAS AS ORIGENS' : range,
      onBack: () => popOrGo(context, AppRoutes.athleteTrainings),
      body: RefreshIndicator(
        color: AppColors.brand,
        onRefresh: () async {
          ref.invalidate(myClassAgendaProvider);
          refreshAthleteTrainingCenters(ref);
          await ref.read(myClassAgendaProvider.future);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            Row(
              children: [
                _WeekArrow(
                  key: const Key('training-agenda-prev'),
                  icon: Icons.chevron_left_rounded,
                  onTap: _week == 0
                      ? null
                      : () => setState(() {
                          _week--;
                          _day = null;
                        }),
                ),
                const SizedBox(width: 4),
                for (final d in days) ...[
                  Expanded(
                    child: _DayCell(
                      key: Key('training-agenda-day-$d'),
                      dateKey: d,
                      isToday: d == todayKey,
                      selected: _day == d,
                      dots: [
                        for (final t in inWeek)
                          if (t.dateKey == d) trainingOriginColor(t.origin),
                      ],
                      onTap: () => setState(() => _day = _day == d ? null : d),
                    ),
                  ),
                  if (d != days.last) const SizedBox(width: 4),
                ],
                const SizedBox(width: 4),
                _WeekArrow(
                  key: const Key('training-agenda-next'),
                  icon: Icons.chevron_right_rounded,
                  onTap: _week >= _maxWeek
                      ? null
                      : () => setState(() {
                          _week++;
                          _day = null;
                        }),
                ),
              ],
            ),
            if (origins.length > 1) ...[
              const SizedBox(height: 12),
              TrainingOriginFilter(
                origins: origins,
                selected: _origin,
                onChanged: (o) => setState(() => _origin = o),
              ),
              const SizedBox(height: 10),
              TrainingStatRow(
                children: [
                  for (final o in origins)
                    TrainingStatTile(
                      key: Key('training-agenda-count-${o.name}'),
                      value: '${inWeek.where((t) => t.origin == o).length}',
                      label: switch (o) {
                        TrainingOrigin.private => 'particular',
                        TrainingOrigin.arena => 'na arena',
                        TrainingOrigin.center => 'no centro',
                      },
                      color: trainingOriginColor(o),
                    ),
                ],
              ),
            ],
            const SizedBox(height: 14),
            if (trainings == null)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Center(
                  child: CircularProgressIndicator(color: AppColors.brand),
                ),
              )
            else if (list.isEmpty)
              Container(
                key: const Key('training-agenda-empty'),
                padding: const EdgeInsets.symmetric(
                  vertical: 28,
                  horizontal: 16,
                ),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: ProfessorLinksStyle.line2(colors)),
                ),
                child: Text(
                  _day == null
                      ? 'Nenhum treino nesta semana'
                      : 'Nenhum treino neste dia',
                  textAlign: TextAlign.center,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 12.5,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              )
            else
              for (final t in list) ...[
                TrainingRow(
                  key: Key('training-agenda-row-${t.id}'),
                  training: t,
                  highlight: t.dateKey == todayKey,
                  showOrigin: origins.length > 1,
                  onTap: () => openTraining(context, t),
                ),
                const SizedBox(height: 8),
              ],
            if (origins.length > 1) ...[
              const SizedBox(height: 6),
              Text(
                'Aulas particulares, turmas da arena e do centro na mesma '
                'agenda. Quem cobra e onde acontece aparecem em cada aula.',
                style: AppTypography.bodyS.copyWith(
                  fontSize: 11.5,
                  height: 1.45,
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _WeekArrow extends StatelessWidget {
  const _WeekArrow({super.key, required this.icon, this.onTap});

  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return SizedBox(
      width: 22,
      child: IconButton(
        padding: EdgeInsets.zero,
        constraints: const BoxConstraints(minWidth: 22, minHeight: 44),
        iconSize: 20,
        onPressed: onTap,
        icon: Icon(
          icon,
          color: onTap == null
              ? ProfessorLinksStyle.line2(colors)
              : ProfessorLinksStyle.mute(colors),
        ),
      ),
    );
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({
    super.key,
    required this.dateKey,
    required this.isToday,
    required this.selected,
    required this.dots,
    required this.onTap,
  });

  final String dateKey;
  final bool isToday;
  final bool selected;
  final List<Color> dots;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final parts = trainingWeekdayDay(dateKey).split(' ');
    return Material(
      color: selected ? colors.surfaceRaised : colors.surfaceCard,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(13),
        side: BorderSide(
          color: selected
              ? ProfessorLinksStyle.line2(colors)
              : ProfessorLinksStyle.line(colors),
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(0, 8, 0, 9),
          child: Column(
            children: [
              Text(
                parts.first,
                style: ProfessorLinksStyle.mono(
                  8.5,
                  color: isToday
                      ? colors.brandText
                      : ProfessorLinksStyle.dim(colors),
                ),
              ),
              const SizedBox(height: 2),
              Text(
                parts.length > 1 ? parts[1] : '',
                style: ProfessorLinksStyle.display(
                  16,
                  weight: FontWeight.w700,
                  color: dots.isEmpty
                      ? ProfessorLinksStyle.dim(colors)
                      : colors.onSurface,
                ),
              ),
              const SizedBox(height: 5),
              SizedBox(
                height: 5,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    for (final (i, c) in dots.take(3).indexed) ...[
                      if (i > 0) const SizedBox(width: 3),
                      Container(
                        width: 5,
                        height: 5,
                        decoration: BoxDecoration(
                          color: c,
                          shape: BoxShape.circle,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// [dateKey] + [days] dias.
String _shift(String dateKey, int days) {
  final d = DateTime.tryParse(dateKey);
  if (d == null || days == 0) return dateKey;
  final t = DateTime.utc(d.year, d.month, d.day + days);
  return '${t.year}-${t.month.toString().padLeft(2, '0')}-'
      '${t.day.toString().padLeft(2, '0')}';
}

/// "22 OUT".
String _dayMonth(String dateKey) {
  final d = DateTime.tryParse(dateKey);
  if (d == null) return dateKey;
  const months = [
    'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', //
    'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ',
  ];
  return '${d.day} ${months[d.month - 1]}';
}
