import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../application/professor_links_providers.dart';
import '../domain/arena_professor_link.dart';
import '../domain/professor_link_rules.dart';
import '../domain/professor_links_repository.dart';
import 'widgets/professor_invite_sheet.dart';
import 'widgets/professor_link_dialogs.dart';
import 'widgets/professor_links_ui.dart';

/// Reservar → arenas: onde a pessoa acha a página da arena para pedir vínculo.
const _findArenasLocation = '${AppRoutes.discover}?tab=reservar';

/// M1 — Minhas arenas: convites em aberto no topo e um card por arena.
class ProfessorMyArenasPage extends ConsumerStatefulWidget {
  const ProfessorMyArenasPage({super.key});

  @override
  ConsumerState<ProfessorMyArenasPage> createState() =>
      _ProfessorMyArenasPageState();
}

class _ProfessorMyArenasPageState extends ConsumerState<ProfessorMyArenasPage> {
  /// Convites sendo recusados pelo card (o card some quando o vínculo muda,
  /// por isso o estado e o snackbar ficam na página).
  final _declining = <String>{};

  Future<void> _decline(ArenaProfessorLink link) async {
    final confirmed = await confirmDeclineProfessorInvite(
      context,
      arenaName: link.arenaName,
    );
    if (!confirmed || !mounted) return;
    setState(() => _declining.add(link.id));
    try {
      await ref
          .read(professorLinksRepositoryProvider)
          .respondToInvite(linkId: link.id, accept: false);
      if (!mounted) return;
      showAppSnackBar(context, 'Convite recusado.');
    } on ProfessorLinkException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, e.message, isError: true);
    } catch (_) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível responder agora. Tente de novo em instantes.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _declining.remove(link.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final linksAsync = ref.watch(myProfessorLinksProvider);
    final now = ref.watch(professorLinksClockProvider)();
    final links = linksAsync.valueOrNull;
    return ProfessorLinksScaffold(
      title: 'Minhas arenas',
      subtitle: links == null
          ? 'ÁREA DO PROFESSOR'
          : professorLinksSummary(links, now),
      onBack: () => professorLinksBack(context, isList: true),
      trailing: ProfessorLinksRoundButton(
        key: const Key('professor-arenas-add'),
        icon: Icons.add_rounded,
        filled: true,
        semanticLabel: 'Solicitar vínculo',
        onTap: () => _showHowToRequest(context),
      ),
      body: links != null
          ? links.isEmpty
              ? _EmptyState(onFind: () => context.go(_findArenasLocation))
              : _LinksList(
                  links: links,
                  now: now,
                  declining: _declining,
                  onDecline: _decline,
                )
          : linksAsync.hasError
              ? AppErrorView(
                  title: 'Não foi possível carregar',
                  message: 'Confira sua conexão e tente de novo.',
                  onRetry: () => ref.invalidate(myProfessorLinksProvider),
                )
              : const Center(
                  child: CircularProgressIndicator(color: AppColors.brand),
                ),
    );
  }
}

class _LinksList extends StatelessWidget {
  const _LinksList({
    required this.links,
    required this.now,
    required this.declining,
    required this.onDecline,
  });

  final List<ArenaProfessorLink> links;
  final DateTime now;
  final Set<String> declining;
  final ValueChanged<ArenaProfessorLink> onDecline;

  @override
  Widget build(BuildContext context) {
    final invites = professorOpenInvites(links, now);
    final rows = professorLinkRows(links, now);
    final children = <Widget>[
      for (final invite in invites)
        _InviteCard(
          link: invite,
          now: now,
          declining: declining.contains(invite.id),
          onDecline: () => onDecline(invite),
        ),
      for (final link in rows) _ArenaRow(link: link, now: now),
      const ProfessorLinksNote(
        'Cada arena define o tipo de vínculo e as permissões só para ela. '
        'Suspensão ou encerramento numa arena não afeta as outras.',
      ),
    ];
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
      itemCount: children.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (_, i) => children[i],
    );
  }
}

/// Card azul "Novo convite" com Ver convite / Recusar.
class _InviteCard extends StatelessWidget {
  const _InviteCard({
    required this.link,
    required this.now,
    required this.declining,
    required this.onDecline,
  });

  final ArenaProfessorLink link;
  final DateTime now;
  final bool declining;
  final VoidCallback onDecline;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final expiry = professorInviteExpiryLine(link, now);
    return Container(
      key: Key('professor-invite-card-${link.id}'),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ProfessorLinksStyle.blue.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: ProfessorLinksStyle.blue.withValues(alpha: 0.4),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const ProfessorLinksKicker(
            'Novo convite',
            color: ProfessorLinksStyle.blue,
          ),
          const SizedBox(height: 6),
          Text(
            professorInviteHeadline(link),
            style: ProfessorLinksStyle.display(
              15,
              weight: FontWeight.w700,
              color: colors.onSurface,
            ),
          ),
          if (expiry != null) ...[
            const SizedBox(height: 3),
            Text(
              expiry,
              style: AppTypography.bodyS.copyWith(
                color: ProfessorLinksStyle.dim(colors),
              ),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: ProfessorLinksPrimaryButton(
                  key: Key('professor-invite-open-${link.id}'),
                  label: 'Ver convite',
                  height: 40,
                  onPressed: declining
                      ? null
                      : () => showProfessorInviteSheet(context, link),
                ),
              ),
              const SizedBox(width: 8),
              SizedBox(
                width: 104,
                child: ProfessorLinksGhostButton(
                  key: Key('professor-invite-card-decline-${link.id}'),
                  label: 'Recusar',
                  height: 40,
                  loading: declining,
                  onPressed: onDecline,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Linha de uma arena: marca, nome, status, tipo e data.
class _ArenaRow extends StatelessWidget {
  const _ArenaRow({required this.link, required this.now});

  final ArenaProfessorLink link;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final status = effectiveProfessorLinkStatus(link, now);
    final dateLine = professorLinkDateLine(link, now);
    return Opacity(
      opacity: status.isOpen ? 1 : 0.55,
      child: ProfessorLinksCard(
        key: Key('professor-link-row-${link.id}'),
        onTap: () => context.pushNamed(
          AppRouteNames.professorArenaLink,
          pathParameters: {'linkId': link.id},
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                ProfessorArenaMark(
                  name: link.arenaName,
                  logoUrl: link.arenaLogoUrl,
                  size: 42,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        link.arenaName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: ProfessorLinksStyle.display(
                          14.5,
                          weight: FontWeight.w700,
                          color: colors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 4),
                      ProfessorLinkStatusLabel(status, small: true),
                    ],
                  ),
                ),
                Icon(
                  Icons.chevron_right_rounded,
                  size: 20,
                  color: ProfessorLinksStyle.dim(colors),
                ),
              ],
            ),
            const SizedBox(height: 11),
            Row(
              children: [
                ProfessorLinkTypeTag(link.type, small: true),
                if (dateLine != null) ...[
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(
                      dateLine,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: ProfessorLinksStyle.mono(
                        10,
                        weight: FontWeight.w600,
                        color: ProfessorLinksStyle.dim(colors),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.onFind});

  final VoidCallback onFind;

  @override
  Widget build(BuildContext context) {
    return AppEmptyView(
      icon: Icons.school_outlined,
      title: 'Nenhuma arena por aqui',
      subtitle:
          'Para dar aulas numa arena, abra a página dela no app e toque em '
          '“Solicitar vínculo”. Os convites das arenas também aparecem aqui.',
      actionLabel: 'Buscar arenas',
      onAction: onFind,
    );
  }
}

/// "+" do header: o pedido nasce na página da arena — a folha explica e leva
/// à busca de arenas.
Future<void> _showHowToRequest(BuildContext context) {
  return showProfessorLinksSheet<void>(
    context,
    builder: (sheetContext) => ProfessorLinksSheetBody(
      title: 'Pedir vínculo a uma arena',
      subtitle: 'Equipe da arena ou professor independente',
      children: [
        const ProfessorLinksNote(
          'Abra a página da arena no app e toque em “Solicitar vínculo”. A '
          'arena analisa o pedido e você recebe a resposta por notificação.',
          tone: ProfessorLinksNoteTone.blue,
        ),
        const ProfessorLinksNote(
          'Foi convidado? O convite aparece aqui em Minhas arenas para você '
          'aceitar ou recusar.',
        ),
        ProfessorLinksPrimaryButton(
          key: const Key('professor-arenas-find'),
          label: 'Buscar arenas',
          onPressed: () {
            Navigator.of(sheetContext).pop();
            context.go(_findArenasLocation);
          },
        ),
      ],
    ),
  );
}
