import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../arena/presentation/aulas/widgets/arena_class_atoms.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../../professor_mode/presentation/availability/availability_widgets.dart';
import '../../../professor_mode/presentation/widgets/professor_students_widgets.dart';
import '../../application/center_coach_providers.dart';
import '../../application/center_management_providers.dart';
import '../../domain/center_coach.dart';
import '../../domain/center_coach_repository.dart';
import '../../domain/center_management.dart';
import '../../infrastructure/firebase_center_management_repository.dart';
import 'center_management_widgets.dart';

/// L6 · Mudar o local SÓ desta aula (gestão): locais ativos, quadra do
/// local próprio, as conferências do portal (janela do parceiro, quadra
/// livre, agenda e deslocamento do professor) e o motivo para os alunos.
/// Devolve `true` quando gravou.
Future<bool?> showCenterLocationSheet(
  BuildContext context, {
  required String centerId,
  required CenterCoachSession session,
  required int affected,
}) => showProfessorLinksSheet<bool>(
  context,
  builder: (_) => _LocationSheet(
    centerId: centerId,
    session: session,
    affected: affected,
  ),
);

class _LocationSheet extends ConsumerStatefulWidget {
  const _LocationSheet({
    required this.centerId,
    required this.session,
    required this.affected,
  });

  final String centerId;
  final CenterCoachSession session;
  final int affected;

  @override
  ConsumerState<_LocationSheet> createState() => _LocationSheetState();
}

class _LocationSheetState extends ConsumerState<_LocationSheet> {
  String? _locationId;
  String _courtId = '';
  final _reason = TextEditingController();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _courtId = widget.session.courtId;
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final s = widget.session;
    final locations = [
      for (final l
          in ref.watch(centerLocationsProvider(widget.centerId)).valueOrNull ??
              const <CenterLocation>[])
        if (l.isActive) l,
    ]..sort((a, b) {
      if (a.isPrimary != b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.name.compareTo(b.name);
    });
    final courts =
        ref.watch(centerCourtsProvider(widget.centerId)).valueOrNull ??
        const <CenterCourt>[];
    final sameDay =
        ref
            .watch(
              coachSessionsProvider((
                centerId: widget.centerId,
                fromKey: s.date,
                toKey: s.date,
              )),
            )
            .valueOrNull ??
        const <CenterCoachSession>[];
    final center = ref.watch(coachCenterProvider(widget.centerId)).valueOrNull;
    final travel =
        (centerPoliciesSnapshot(
                  center?.rawPolicies ?? const {},
                )['travelBufferMinutes']
                as num)
            .toInt();
    final target = locations
        .where((l) => l.id == (_locationId ?? s.locationId))
        .firstOrNull;
    final targetCourts = [
      for (final c in courts)
        if (target != null && c.locationId == target.id && c.isActive) c,
    ];
    final court = targetCourts.where((c) => c.id == _courtId).firstOrNull;
    final changed =
        target != null &&
        (target.id != s.locationId || (court?.id ?? '') != s.courtId);
    final checks = target == null || !changed
        ? const <CenterPlaceCheck>[]
        : centerSessionMoveChecks(
            session: s,
            location: target,
            courtId: court?.id ?? '',
            courtName: court?.name ?? '',
            sameDay: sameDay,
            travelBufferMin: travel,
          );
    final failed = checks.any((c) => !c.ok);
    final n = widget.affected;

    return ProfessorLinksSheetBody(
      key: const Key('center-location-sheet'),
      title: 'Mudar local desta aula',
      subtitle: 'Agora: ${centerPlaceLabel(s.locationName, s.courtName)}',
      children: [
        if (locations.isEmpty)
          const ProfessorMutedText(
            'O centro ainda não tem locais cadastrados. Cadastre no painel '
            'web do centro.',
          ),
        for (final l in locations)
          _LocationTile(
            key: Key('center-location-${l.id}'),
            location: l,
            selected: l.id == target?.id,
            courts: courts
                .where((c) => c.locationId == l.id && c.isActive)
                .length,
            onTap: () => setState(() {
              _locationId = l.id;
              if (!courts.any((c) => c.id == _courtId && c.locationId == l.id)) {
                _courtId = '';
              }
            }),
          ),
        if (targetCourts.isNotEmpty) ...[
          const CenterKicker('Quadra'),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final c in targetCourts)
                AvailabilityChoiceChip(
                  key: Key('center-location-court-${c.id}'),
                  label: c.name,
                  selected: c.id == _courtId,
                  onTap: () => setState(() => _courtId = c.id),
                ),
            ],
          ),
        ],
        if (checks.isNotEmpty)
          ProfessorLinksCard(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
            child: Column(
              children: [
                for (final c in checks)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          c.ok
                              ? Icons.check_circle_rounded
                              : Icons.error_rounded,
                          size: 16,
                          color: colors.readableTone(
                            c.ok ? AppColors.win : AppColors.live,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                c.label,
                                style: ProfessorLinksStyle.display(
                                  12.5,
                                  weight: FontWeight.w600,
                                  color: colors.onSurface,
                                ),
                              ),
                              Text(
                                c.detail,
                                style: AppTypography.bodyS.copyWith(
                                  fontSize: 11.5,
                                  color: ProfessorLinksStyle.dim(colors),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        CenterTextField(
          key: const Key('center-location-reason'),
          controller: _reason,
          hint: 'Motivo (aparece para os alunos)',
          onChanged: (_) => setState(() {}),
        ),
        Text(
          n == 0
              ? 'Só esta data muda; a turma segue no local padrão.'
              : '$n ${n == 1 ? 'aluno recebe' : 'alunos recebem'} o novo '
                    'endereço por push. Só esta data muda.',
          style: AppTypography.bodyS.copyWith(
            fontSize: 11.5,
            color: ProfessorLinksStyle.dim(colors),
          ),
        ),
        ProfessorLinksPrimaryButton(
          key: const Key('center-location-confirm'),
          label: target == null || !changed
              ? 'Escolha o novo local'
              : failed
              ? 'Mudar mesmo assim'
              : 'Mudar para ${target.name}',
          loading: _busy,
          onPressed: !changed || _reason.text.trim().length < 3
              ? null
              : () => _save(target, court),
        ),
      ],
    );
  }

  Future<void> _save(CenterLocation location, CenterCourt? court) async {
    setState(() => _busy = true);
    try {
      await ref
          .read(centerManagementRepositoryProvider)
          .changeSessionLocation(
            centerId: widget.centerId,
            session: widget.session,
            location: location,
            court: court,
            reason: _reason.text,
            actor: ref.read(centerActorProvider(widget.centerId)),
          );
      if (mounted) Navigator.of(context).pop(true);
    } on CenterCoachException catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        showCenterError(context, e.message);
      }
    }
  }
}

class _LocationTile extends StatelessWidget {
  const _LocationTile({
    super.key,
    required this.location,
    required this.selected,
    required this.courts,
    required this.onTap,
  });

  final CenterLocation location;
  final bool selected;
  final int courts;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final l = location;
    final tone = switch (l.type) {
      'partner' => const Color(0xFF5B9BFF),
      'adhoc' => ProfessorLinksStyle.dim(colors),
      _ => AppColors.brand,
    };
    final sub = switch (l.type) {
      'partner' => centerWindowLabel(l.windows),
      'adhoc' => l.address.isEmpty ? 'Avulso · sem quadra fixa' : l.address,
      _ => [
        if (l.address.isNotEmpty) l.address,
        if (courts > 0) '$courts ${courts == 1 ? 'quadra' : 'quadras'}',
      ].join(' · '),
    };
    return ProfessorLinksCard(
      onTap: onTap,
      padding: const EdgeInsets.all(12),
      borderColor: selected ? AppColors.brand : null,
      backgroundColor: selected
          ? AppColors.brand.withValues(alpha: 0.08)
          : ProfessorLinksStyle.soft(colors),
      child: Row(
        children: [
          Icon(Icons.place_outlined, size: 18, color: colors.readableTone(tone)),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l.name,
                  style: ProfessorLinksStyle.display(
                    13.5,
                    weight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
                if (sub.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    sub,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 11,
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
              ],
            ),
          ),
          ArenaClassTag(label: l.typeLabel, color: tone),
        ],
      ),
    );
  }
}
