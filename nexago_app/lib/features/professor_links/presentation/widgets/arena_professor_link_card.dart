import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../application/professor_links_providers.dart';
import '../../domain/arena_professor_link.dart';
import '../../domain/professor_link_rules.dart';
import 'professor_invite_sheet.dart';
import 'professor_link_request_sheet.dart';
import 'professor_links_ui.dart';

/// Card "Você é professor?" no fim da página da arena (M3). Com vínculo em
/// aberto com esta arena, mostra o status e leva ao vínculo no lugar do
/// pedido. Some deslogado; arena sem gestor nem chega aqui (a página da arena
/// pré-cadastrada não abre) — e, se chegar, o servidor recusa com a copy dele.
class ArenaProfessorLinkCard extends ConsumerWidget {
  const ArenaProfessorLinkCard({
    super.key,
    required this.arenaId,
    required this.arenaName,
    this.arenaLogoUrl,
  });

  final String arenaId;
  final String arenaName;
  final String? arenaLogoUrl;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (ref.watch(professorLinksUidProvider).isEmpty) {
      return const SizedBox.shrink();
    }
    final linkAsync = ref.watch(myArenaProfessorLinkProvider(arenaId));
    // Sem piscar o "Solicitar vínculo" antes do status chegar.
    if (!linkAsync.hasValue) return const SizedBox.shrink();
    final link = linkAsync.valueOrNull;
    final now = ref.watch(professorLinksClockProvider)();
    final open = link != null && effectiveProfessorLinkStatus(link, now).isOpen;
    return Padding(
      padding: const EdgeInsets.only(top: 28),
      child: ProfessorLinksCard(
        key: const Key('arena-professor-card'),
        padding: const EdgeInsets.all(16),
        child: open
            ? _LinkStatus(link: link, now: now)
            : _RequestPrompt(
                onRequest: () => startProfessorLinkRequest(
                  context,
                  arenaId: arenaId,
                  arenaName: arenaName,
                  arenaLogoUrl: arenaLogoUrl,
                ),
              ),
      ),
    );
  }
}

class _RequestPrompt extends StatelessWidget {
  const _RequestPrompt({required this.onRequest});

  final VoidCallback onRequest;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const ProfessorLinksKicker('Você é professor?'),
        const SizedBox(height: 6),
        Text(
          'Peça vínculo para dar aulas aqui — na equipe da arena ou como '
          'independente.',
          style: AppTypography.bodyM.copyWith(
            fontSize: 13,
            color: colors.onSurface,
            height: 1.45,
          ),
        ),
        const SizedBox(height: 12),
        ProfessorLinksGhostButton(
          key: const Key('arena-professor-request'),
          label: 'Solicitar vínculo',
          height: 42,
          onPressed: onRequest,
        ),
      ],
    );
  }
}

class _LinkStatus extends StatelessWidget {
  const _LinkStatus({required this.link, required this.now});

  final ArenaProfessorLink link;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final status = effectiveProfessorLinkStatus(link, now);
    final dateLine = professorLinkDateLine(link, now);
    final invited = status == ArenaProfessorLinkStatus.invited;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const ProfessorLinksKicker('Seu vínculo de professor'),
        const SizedBox(height: 8),
        Row(
          children: [
            Flexible(child: ProfessorLinkStatusLabel(status, small: true)),
            const SizedBox(width: 8),
            ProfessorLinkTypeTag(link.type, small: true),
          ],
        ),
        if (dateLine != null) ...[
          const SizedBox(height: 6),
          Text(
            dateLine,
            style: ProfessorLinksStyle.mono(
              10,
              weight: FontWeight.w600,
              color: ProfessorLinksStyle.dim(colors),
            ),
          ),
        ],
        const SizedBox(height: 12),
        ProfessorLinksGhostButton(
          key: const Key('arena-professor-open'),
          label: invited ? 'Ver convite' : 'Ver vínculo',
          height: 42,
          onPressed: invited
              ? () => showProfessorInviteSheet(context, link)
              : () => context.pushNamed(
                    AppRouteNames.professorArenaLink,
                    pathParameters: {'linkId': link.id},
                  ),
        ),
      ],
    );
  }
}
