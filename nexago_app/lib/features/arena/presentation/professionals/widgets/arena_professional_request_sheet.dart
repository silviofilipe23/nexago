import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../professor_links/domain/arena_professor_link.dart';
import '../../../../professor_links/domain/professor_link_rules.dart';
import '../../../../professor_links/presentation/widgets/professor_links_ui.dart';
import '../../../domain/professionals/arena_professionals_logic.dart';
import '../../../domain/professionals/arena_professionals_providers.dart';
import '../../../domain/professionals/arena_professionals_repository.dart';
import 'arena_professionals_ui.dart';

/// Como a análise terminou: aprovado aqui, ou o gestor quer rejeitar (quem
/// abriu a folha pede a confirmação com motivo).
enum ArenaProfessorRequestOutcome { approved, reject }

/// A3 · Solicitação de vínculo: aprova com as permissões ajustadas aqui
/// (começa na proposta gravada no pedido), rejeita ou deixa para depois.
Future<ArenaProfessorRequestOutcome?> showArenaProfessorRequestSheet(
  BuildContext context, {
  required ArenaProfessorLink link,
}) =>
    showProfessorLinksSheet<ArenaProfessorRequestOutcome>(
      context,
      builder: (_) => ArenaProfessorRequestSheet(link: link),
    );

class ArenaProfessorRequestSheet extends ConsumerStatefulWidget {
  const ArenaProfessorRequestSheet({super.key, required this.link});

  /// Retrato na hora de abrir; a folha acompanha o doc ao vivo.
  final ArenaProfessorLink link;

  @override
  ConsumerState<ArenaProfessorRequestSheet> createState() =>
      _ArenaProfessorRequestSheetState();
}

class _ArenaProfessorRequestSheetState
    extends ConsumerState<ArenaProfessorRequestSheet> {
  /// Ajustes do gestor; `null` = ainda a proposta gravada no pedido.
  ArenaProfessorPermissions? _edited;
  bool _busy = false;
  String? _error;

  Future<void> _approve(ArenaProfessorLink link) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(arenaProfessionalsRepositoryProvider).approve(
            linkId: link.id,
            permissions: arenaProfessorPermissionsToSend(
              _edited ?? link.permissions,
              link.type,
            ),
          );
      if (!mounted) return;
      Navigator.of(context).pop(ArenaProfessorRequestOutcome.approved);
    } on ProfessorLinkException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = 'Não foi possível aprovar a solicitação. Tente de novo.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final now = ref.watch(arenaProfessionalsClockProvider)();
    final link =
        ref.watch(arenaProfessionalLinkProvider(widget.link.id)).valueOrNull ??
            widget.link;
    final open = link.status == ArenaProfessorLinkStatus.pending;
    final sent = arenaProfessorRequestSentLabel(link, now);
    final message = link.message;
    final permissions = _edited ?? link.permissions;

    return ProfessorLinksSheetBody(
      title: 'Solicitação de vínculo',
      subtitle: [link.professorName, if (sent != null) sent].join(' · '),
      children: [
        if (_error != null)
          ArenaProfessorErrorBanner(_error!)
        // Durante a aprovação o doc vira ACTIVE antes da callable responder:
        // não acusa "fechada" enquanto a própria aprovação está em curso.
        else if (!open && !_busy)
          ArenaProfessorErrorBanner(
            'Esta solicitação não está mais aberta '
            '(${arenaProfessorStatusLabel(effectiveProfessorLinkStatus(link, now)).toLowerCase()}).',
          ),
        Row(
          children: [
            ArenaProfessorAvatar(
              name: link.professorName,
              photoUrl: link.professorPhotoUrl,
              size: 52,
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    link.professorName,
                    style: ProfessorLinksStyle.display(
                      17,
                      weight: FontWeight.w700,
                      color: colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    arenaProfessorModalitiesLabel(link),
                    style: AppTypography.bodyS.copyWith(
                      color: ProfessorLinksStyle.dim(colors),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        ProfessorLinksCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const ProfessorLinksKicker('Quer atuar como'),
                  const SizedBox(width: 8),
                  ProfessorLinkTypeTag(link.type, small: true),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                message == null ? 'Sem mensagem.' : '“$message”',
                style: AppTypography.bodyS.copyWith(
                  fontSize: 13,
                  height: 1.5,
                  color: message == null
                      ? ProfessorLinksStyle.dim(colors)
                      : colors.onSurface,
                ),
              ),
            ],
          ),
        ),
        const ProfessorLinksKicker('Permissões ao aprovar'),
        ArenaProfessorPermissionToggles(
          type: link.type,
          permissions: permissions,
          dense: true,
          onChanged: _busy || !open
              ? null
              : (key, value) => setState(
                    () => _edited =
                        arenaProfessorPermissionsWith(permissions, key, value),
                  ),
        ),
        ProfessorLinksNote(
          'Você só vê os dados públicos do perfil. Os vínculos de '
          '${arenaProfessorFirstName(link.professorName)} com outras arenas '
          'não aparecem aqui.',
        ),
        ProfessorLinksPrimaryButton(
          key: const Key('arena-professor-approve'),
          label: 'Aprovar vínculo',
          loading: _busy,
          onPressed: open ? () => _approve(link) : null,
        ),
        Row(
          children: [
            Expanded(
              child: ProfessorLinksGhostButton(
                key: const Key('arena-professor-request-reject'),
                label: 'Rejeitar',
                color: AppColors.live,
                height: 46,
                onPressed: _busy || !open
                    ? null
                    : () => Navigator.of(context)
                        .pop(ArenaProfessorRequestOutcome.reject),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: ProfessorLinksGhostButton(
                key: const Key('arena-professor-request-later'),
                label: 'Decidir depois',
                height: 46,
                onPressed: _busy ? null : () => Navigator.of(context).pop(),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
