import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/time/nexago_event_timezone.dart';
import '../../../arena/domain/aulas/arena_class_logic.dart';
import '../../../athlete_training/domain/athlete_training.dart'
    show trainingWeekdayDay;
import '../../../athlete_training/domain/training_plans.dart'
    show ArenaPlanSlot, arenaPlanScheduleLabel;
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../domain/center_coach.dart';

/// Peças do App do Professor do CT (protótipo `ct-app.jsx`).

Color centerMarkColor(CenterMark m) => switch (m) {
  CenterMark.present => AppColors.win,
  CenterMark.excused => AppColors.pending,
  CenterMark.absent => AppColors.live,
};

/// "CT Maré Alta · PROFESSOR ⌄" — toca para trocar de centro.
class CenterCoachCenterChip extends StatelessWidget {
  const CenterCoachCenterChip({
    super.key,
    required this.name,
    required this.role,
    required this.canSwitch,
    this.onTap,
  });

  final String name;
  final String role;
  final bool canSwitch;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Align(
      alignment: Alignment.centerLeft,
      child: Material(
        color: colors.surfaceRaised,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(11),
          side: BorderSide(color: ProfessorLinksStyle.line(colors)),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(5, 5, 10, 5),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                CenterCoachMark(name: name, size: 24),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ProfessorLinksStyle.display(
                      12.5,
                      weight: FontWeight.w600,
                      color: colors.onSurface,
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  '· ${role.toUpperCase()}',
                  style: ProfessorLinksStyle.mono(
                    9,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
                if (canSwitch) ...[
                  const SizedBox(width: 4),
                  Icon(
                    Icons.unfold_more_rounded,
                    size: 15,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Iniciais do centro num quadrado laranja.
class CenterCoachMark extends StatelessWidget {
  const CenterCoachMark({super.key, required this.name, this.size = 40});

  final String name;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(size * 0.3),
        gradient: const LinearGradient(
          colors: [Color(0xFFFF6A1A), Color(0xFFB93A0A)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Text(
        arenaClassInitials(name),
        style: ProfessorLinksStyle.display(size * 0.34, color: Colors.white),
      ),
    );
  }
}

/// Opção da troca de centro (P2).
class CenterCoachCenterOption extends StatelessWidget {
  const CenterCoachCenterOption({
    super.key,
    required this.membership,
    required this.selected,
    required this.onTap,
  });

  final CenterMembership membership;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ProfessorLinksCard(
      onTap: onTap,
      borderColor: selected ? AppColors.brand.withValues(alpha: 0.4) : null,
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          CenterCoachMark(name: membership.centerName),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  membership.centerName,
                  style: ProfessorLinksStyle.display(
                    14.5,
                    weight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  membership.roleLabel,
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 11.5,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ],
            ),
          ),
          if (selected)
            Icon(Icons.check_rounded, size: 18, color: colors.brandText),
        ],
      ),
    );
  }
}

/// Dia da semana na faixa da agenda.
class CenterCoachDayCell extends StatelessWidget {
  const CenterCoachDayCell({
    super.key,
    required this.dateKey,
    required this.selected,
    required this.isToday,
    required this.count,
    required this.onTap,
  });

  final String dateKey;
  final bool selected;
  final bool isToday;
  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final parts = trainingWeekdayDay(dateKey).split(' ');
    final fg = selected ? ProfessorLinksStyle.onBrand : colors.onSurface;
    return Material(
      color: selected ? AppColors.brand : colors.surfaceRaised,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(
          color: selected
              ? Colors.transparent
              : ProfessorLinksStyle.line(colors),
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Column(
            children: [
              Text(
                parts.first.isEmpty ? '' : parts.first.substring(0, 1),
                style: ProfessorLinksStyle.mono(
                  9.5,
                  color: selected
                      ? fg
                      : isToday
                      ? colors.brandText
                      : ProfessorLinksStyle.dim(colors),
                ),
              ),
              const SizedBox(height: 2),
              Text(
                parts.length > 1 ? parts[1] : '',
                style: ProfessorLinksStyle.display(
                  15,
                  weight: FontWeight.w700,
                  color: fg,
                ),
              ),
              const SizedBox(height: 4),
              Container(
                width: 5,
                height: 5,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: count == 0
                      ? Colors.transparent
                      : selected
                      ? fg
                      : AppColors.brand,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// "Próxima aula · em 1h20" com "Abrir chamada" (P1).
class CenterCoachNextCard extends StatelessWidget {
  const CenterCoachNextCard({
    super.key,
    required this.session,
    required this.now,
    required this.canCall,
    required this.onOpen,
  });

  final CenterCoachSession session;
  final DateTime now;
  final bool canCall;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final s = session;
    final local = toNexagoEventLocal(now);
    final start = _minutes(s.startTime);
    final nowMin = local.hour * 60 + local.minute;
    final kicker = start == null
        ? 'Próxima aula'
        : start > nowMin
        ? 'Próxima aula · em ${_duration(start - nowMin)}'
        : 'Aula em andamento · chamada aberta';
    final notGoing = s.rsvps.values.where((r) => r == 'not_going').length;
    final makeups = s.makeupStudentIds.length;
    final note = [
      if (notGoing > 0)
        notGoing == 1
            ? '1 aluno avisou falta'
            : '$notGoing alunos avisaram falta',
      if (makeups > 0)
        makeups == 1
            ? '1 entra com reposição'
            : '$makeups entram com reposição',
    ].join(' · ');
    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        color: colors.surfaceCard,
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.brand.withValues(alpha: 0.18), colors.surfaceCard],
          stops: const [0, 0.62],
        ),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.28)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            kicker.toUpperCase(),
            style: ProfessorLinksStyle.mono(9.5, color: colors.brandText),
          ),
          const SizedBox(height: 7),
          Text(
            s.className,
            style: ProfessorLinksStyle.display(21, color: colors.onSurface),
          ),
          const SizedBox(height: 3),
          Text(
            [
              s.startTime,
              s.placeLabel,
            ].where((x) => x.isNotEmpty).join(' · ').toUpperCase(),
            style: ProfessorLinksStyle.mono(
              10.5,
              color: ProfessorLinksStyle.mute(colors),
            ),
          ),
          if (s.changed && s.changeReason.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              'Alterada nesta data: ${s.changeReason}',
              style: AppTypography.bodyS.copyWith(
                fontSize: 12,
                color: colors.readableTone(AppColors.pending),
              ),
            ),
          ],
          if (note.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              '$note.',
              style: AppTypography.bodyS.copyWith(
                fontSize: 12,
                height: 1.45,
                color: ProfessorLinksStyle.mute(colors),
              ),
            ),
          ],
          const SizedBox(height: 14),
          ProfessorLinksPrimaryButton(
            key: const Key('center-coach-open-call'),
            label: canCall ? 'Abrir chamada' : 'Ver aula',
            height: 44,
            onPressed: onOpen,
          ),
        ],
      ),
    );
  }
}

/// Linha da aula na agenda (P1): horário, turma, local e situação.
class CenterCoachSessionRow extends StatelessWidget {
  const CenterCoachSessionRow({
    super.key,
    required this.session,
    required this.isPast,
    required this.onTap,
    this.showPlace = false,
  });

  final CenterCoachSession session;
  final bool isPast;
  final bool showPlace;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final s = session;
    final counts = s.attendance.values;
    final present = counts.where((m) => m == CenterMark.present).length;
    final (status, statusColor) = s.isCancelled
        ? (
            'Cancelada pelo centro${s.changeReason.isEmpty ? '' : ' · ${s.changeReason}'}',
            AppColors.live,
          )
        : s.isDone
        ? (
            '$present/${counts.length} presentes · finalizada',
            ProfessorLinksStyle.dim(colors),
          )
        : isPast
        ? ('Chamada não finalizada', AppColors.pending)
        : s.changed
        ? (
            'Alterada nesta data${s.changeReason.isEmpty ? '' : ' · ${s.changeReason}'}',
            AppColors.pending,
          )
        : (
            s.makeupStudentIds.isEmpty
                ? 'Marcada'
                : 'Marcada · ${s.makeupStudentIds.length} reposição',
            AppColors.win,
          );
    return Opacity(
      opacity: s.isDone ? 0.6 : 1,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 46,
            child: Padding(
              padding: const EdgeInsets.only(top: 13),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    s.startTime,
                    style: ProfessorLinksStyle.mono(
                      13,
                      color: colors.onSurface,
                    ),
                  ),
                  Text(
                    s.endTime,
                    style: ProfessorLinksStyle.mono(
                      9.5,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: ProfessorLinksCard(
              onTap: onTap,
              borderColor: s.isCancelled
                  ? AppColors.live.withValues(alpha: 0.4)
                  : null,
              backgroundColor: s.isCancelled ? Colors.transparent : null,
              padding: const EdgeInsets.all(13),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    s.className,
                    style:
                        ProfessorLinksStyle.display(
                          14.5,
                          weight: FontWeight.w700,
                          color: colors.onSurface,
                        ).copyWith(
                          decoration: s.isCancelled
                              ? TextDecoration.lineThrough
                              : null,
                        ),
                  ),
                  if (s.placeLabel.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        if (showPlace) ...[
                          Icon(
                            Icons.place_outlined,
                            size: 13,
                            color: colors.readableTone(
                              ProfessorLinksStyle.blue,
                            ),
                          ),
                          const SizedBox(width: 4),
                        ],
                        Expanded(
                          child: Text(
                            s.placeLabel,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.bodyS.copyWith(
                              fontSize: 11.5,
                              color: showPlace
                                  ? colors.readableTone(
                                      ProfessorLinksStyle.blue,
                                    )
                                  : ProfessorLinksStyle.dim(colors),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 7),
                  Text(
                    status,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: ProfessorLinksStyle.mono(
                      10,
                      color: colors.readableTone(statusColor),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Turma do professor (abre o histórico, P8).
class CenterCoachClassRow extends StatelessWidget {
  const CenterCoachClassRow({
    super.key,
    required this.cls,
    required this.onTap,
  });

  final CenterCoachClass cls;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final c = cls;
    return ProfessorLinksCard(
      onTap: onTap,
      padding: const EdgeInsets.all(13),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  c.name,
                  style: ProfessorLinksStyle.display(
                    14,
                    weight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  [
                    coachClassScheduleLabel(c),
                    if (c.locationName.isNotEmpty) c.locationName,
                  ].where((x) => x.isNotEmpty).join(' · '),
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 11.5,
                    color: ProfessorLinksStyle.dim(colors),
                  ),
                ),
              ],
            ),
          ),
          Text(
            '${c.seatsTaken}/${c.capacity}',
            style: ProfessorLinksStyle.mono(
              11,
              color: ProfessorLinksStyle.mute(colors),
            ),
          ),
          const SizedBox(width: 6),
          Icon(
            Icons.chevron_right_rounded,
            size: 18,
            color: ProfessorLinksStyle.dim(colors),
          ),
        ],
      ),
    );
  }
}

/// "Ter e Qui · 19:00".
String coachClassScheduleLabel(CenterCoachClass c) => arenaPlanScheduleLabel([
  for (final w in c.weekdays)
    ArenaPlanSlot(className: c.name, weekday: w, startTime: c.startTime),
]);

/// P9 · Acesso ao centro encerrado.
class CenterCoachRevokedCard extends StatelessWidget {
  const CenterCoachRevokedCard({
    super.key,
    required this.centerName,
    this.onOther,
  });

  final String centerName;
  final VoidCallback? onOther;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: ProfessorLinksStyle.line2(colors)),
      ),
      child: Column(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: AppColors.live.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: AppColors.live.withValues(alpha: 0.4)),
            ),
            child: Icon(
              Icons.lock_outline_rounded,
              size: 24,
              color: colors.readableTone(AppColors.live),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'Seu acesso a este centro foi encerrado',
            textAlign: TextAlign.center,
            style: ProfessorLinksStyle.display(19, color: colors.onSurface),
          ),
          const SizedBox(height: 8),
          Text(
            'O $centerName removeu seu vínculo de professor. Chamadas que você '
            'já registrou continuam no histórico do centro.',
            textAlign: TextAlign.center,
            style: AppTypography.bodyS.copyWith(
              fontSize: 13,
              height: 1.5,
              color: ProfessorLinksStyle.mute(colors),
            ),
          ),
          if (onOther != null) ...[
            const SizedBox(height: 18),
            ProfessorLinksPrimaryButton(
              key: const Key('center-coach-revoked-other'),
              label: 'Ir para meus centros',
              height: 46,
              onPressed: onOther,
            ),
          ],
        ],
      ),
    );
  }
}

/// Botões P · J · F da chamada.
class CenterMarkButtons extends StatelessWidget {
  const CenterMarkButtons({
    super.key,
    required this.studentId,
    required this.mark,
    required this.onChanged,
  });

  final String studentId;
  final CenterMark? mark;

  /// `null` = só leitura.
  final ValueChanged<CenterMark>? onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final m in CenterMark.values) ...[
          if (m != CenterMark.present) const SizedBox(width: 5),
          Semantics(
            button: onChanged != null,
            selected: mark == m,
            label: centerMarkLabel(m),
            child: Material(
              color: mark == m
                  ? centerMarkColor(m).withValues(alpha: 0.16)
                  : Colors.transparent,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(11),
                side: BorderSide(
                  color: mark == m
                      ? centerMarkColor(m).withValues(alpha: 0.55)
                      : ProfessorLinksStyle.line2(colors),
                ),
              ),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                key: Key('center-mark-$studentId-${centerMarkValue(m)}'),
                onTap: onChanged == null ? null : () => onChanged!(m),
                child: SizedBox(
                  width: 40,
                  height: 40,
                  child: Center(
                    child: Text(
                      centerMarkLetter(m),
                      style: ProfessorLinksStyle.display(
                        13,
                        weight: FontWeight.w700,
                        color: mark == m
                            ? colors.readableTone(centerMarkColor(m))
                            : ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

int? _minutes(String hm) {
  final p = hm.split(':');
  if (p.length < 2) return null;
  final h = int.tryParse(p[0]), m = int.tryParse(p[1]);
  return h == null || m == null ? null : h * 60 + m;
}

String _duration(int minutes) {
  if (minutes < 60) return '${minutes}min';
  final h = minutes ~/ 60, m = minutes % 60;
  return m == 0 ? '${h}h' : '${h}h${m.toString().padLeft(2, '0')}';
}
