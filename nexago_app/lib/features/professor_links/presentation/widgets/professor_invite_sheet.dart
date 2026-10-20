import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../application/professor_links_providers.dart';
import '../../domain/arena_professor_link.dart';
import '../../domain/professor_link_rules.dart';
import '../../domain/professor_links_repository.dart';
import 'professor_links_ui.dart';

/// M2 — folha do convite: arena, tipo, o que a arena libera e a resposta.
Future<void> showProfessorInviteSheet(
  BuildContext context,
  ArenaProfessorLink link,
) {
  return showProfessorLinksSheet<void>(
    context,
    builder: (_) => ProfessorInviteSheet(link: link),
  );
}

/// Mensagem do snackbar depois de aceitar.
String professorInviteAcceptedMessage(ArenaProfessorLink link) =>
    switch (link.type) {
      ArenaProfessorLinkType.arenaStaff =>
        'Convite aceito: agora você faz parte da equipe da ${link.arenaName}.',
      ArenaProfessorLinkType.independent =>
        'Convite aceito: agora você é professor independente na '
            '${link.arenaName}.',
    };

class ProfessorInviteSheet extends ConsumerStatefulWidget {
  const ProfessorInviteSheet({super.key, required this.link});

  final ArenaProfessorLink link;

  @override
  ConsumerState<ProfessorInviteSheet> createState() =>
      _ProfessorInviteSheetState();
}

class _ProfessorInviteSheetState extends ConsumerState<ProfessorInviteSheet> {
  /// `true` aceitando, `false` recusando, `null` parado.
  bool? _busy;
  String? _error;

  Future<void> _respond(bool accept) async {
    setState(() {
      _busy = accept;
      _error = null;
    });
    final navigator = Navigator.of(context);
    try {
      await ref
          .read(professorLinksRepositoryProvider)
          .respondToInvite(linkId: widget.link.id, accept: accept);
      if (!mounted) return;
      // O snackbar sai na tela de baixo: a folha fecha logo em seguida.
      showAppSnackBar(
        context,
        accept
            ? professorInviteAcceptedMessage(widget.link)
            : 'Convite recusado.',
      );
      navigator.pop();
    } on ProfessorLinkException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = null;
        _error = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = null;
        _error =
            'Não foi possível responder agora. Tente de novo em instantes.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final link = widget.link;
    final now = ref.watch(professorLinksClockProvider)();
    final invitedAt = link.invitedAt;
    final sentLine = [
      if (link.invitedByName != null) link.invitedByName!,
      if (invitedAt != null) professorLinkMoment(invitedAt, now),
    ].join(' · ');
    final expiry = professorInviteExpiryLine(link, now);
    final message = link.message;
    return ProfessorLinksSheetBody(
      title: 'Convite da ${link.arenaName}',
      subtitle: sentLine.isEmpty ? null : sentLine,
      children: [
        Row(
          children: [
            ProfessorArenaMark(
              name: link.arenaName,
              logoUrl: link.arenaLogoUrl,
              size: 40,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    link.arenaName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: ProfessorLinksStyle.display(
                      14,
                      weight: FontWeight.w700,
                      color: colors.onSurface,
                    ),
                  ),
                  if (link.arenaCity != null)
                    Text(
                      link.arenaCity!.toUpperCase(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: ProfessorLinksStyle.mono(
                        10,
                        weight: FontWeight.w600,
                        color: ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            ProfessorLinkTypeTag(link.type, small: true),
          ],
        ),
        if (message != null)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: ProfessorLinksStyle.soft(colors),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: ProfessorLinksStyle.line(colors)),
            ),
            child: Text(
              '“$message”',
              style: AppTypography.bodyM.copyWith(
                fontSize: 13,
                color: colors.onSurface,
              ),
            ),
          ),
        const ProfessorLinksKicker('A arena libera'),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: ProfessorLinksStyle.soft(colors),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: ProfessorLinksStyle.line(colors)),
          ),
          child: ProfessorPermissionList(
            permissions:
                professorPermissionsForType(link.permissions, link.type),
            dense: true,
          ),
        ),
        Text(
          [
            'Não é vínculo empregatício nem exclusividade. Seus outros '
                'vínculos não mudam.',
            if (expiry != null) '$expiry.',
          ].join(' '),
          style: AppTypography.bodyS.copyWith(
            fontSize: 11.5,
            color: ProfessorLinksStyle.dim(colors),
            height: 1.45,
          ),
        ),
        if (_error != null)
          Text(
            _error!,
            key: const Key('professor-invite-error'),
            style: AppTypography.bodyS.copyWith(color: AppColors.live),
          ),
        ProfessorLinksPrimaryButton(
          key: const Key('professor-invite-accept'),
          label: 'Aceitar convite',
          loading: _busy == true,
          onPressed: _busy == null ? () => _respond(true) : null,
        ),
        ProfessorLinksGhostButton(
          key: const Key('professor-invite-decline'),
          label: 'Recusar',
          loading: _busy == false,
          onPressed: _busy == null ? () => _respond(false) : null,
        ),
      ],
    );
  }
}
