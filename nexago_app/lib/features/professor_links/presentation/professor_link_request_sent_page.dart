import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../application/professor_links_providers.dart';
import '../domain/arena_professor_link.dart';
import '../domain/professor_link_rules.dart';
import '../domain/professor_links_repository.dart';
import 'widgets/professor_link_dialogs.dart';
import 'widgets/professor_links_ui.dart';

/// M4 — "Solicitação enviada". Lê o vínculo ao vivo: se a arena responder com
/// a tela aberta, o status muda aqui mesmo.
class ProfessorLinkRequestSentPage extends ConsumerStatefulWidget {
  const ProfessorLinkRequestSentPage({super.key, required this.linkId});

  final String linkId;

  @override
  ConsumerState<ProfessorLinkRequestSentPage> createState() =>
      _ProfessorLinkRequestSentPageState();
}

class _ProfessorLinkRequestSentPageState
    extends ConsumerState<ProfessorLinkRequestSentPage> {
  bool _canceling = false;

  Future<void> _cancel(ArenaProfessorLink link) async {
    final confirmed = await confirmCancelProfessorRequest(
      context,
      arenaName: link.arenaName,
    );
    if (!confirmed || !mounted) return;
    setState(() => _canceling = true);
    try {
      await ref.read(professorLinksRepositoryProvider).cancelRequest(link.id);
      if (!mounted) return;
      showAppSnackBar(context, 'Solicitação cancelada.');
      professorLinksBack(context);
    } on ProfessorLinkException catch (e) {
      if (!mounted) return;
      setState(() => _canceling = false);
      showAppSnackBar(context, e.message, isError: true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _canceling = false);
      showAppSnackBar(
        context,
        'Não foi possível cancelar agora. Tente de novo em instantes.',
        isError: true,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final now = ref.watch(professorLinksClockProvider)();
    final link = ref.watch(professorLinkProvider(widget.linkId)).valueOrNull;
    final status = link == null
        ? ArenaProfessorLinkStatus.pending
        : effectiveProfessorLinkStatus(link, now);
    final arenaName = link?.arenaName ?? 'arena';
    final dateLine = link == null ? null : professorLinkDateLine(link, now);
    final cardNote = switch (status) {
      ArenaProfessorLinkStatus.pending =>
        'Sem permissões até a aprovação: você ainda não pode reservar quadras '
            'aqui.',
      ArenaProfessorLinkStatus.active =>
        'Aprovado: suas permissões nesta arena já valem.',
      _ => null,
    };

    return Scaffold(
      backgroundColor: colors.canvas,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Align(
                alignment: Alignment.centerLeft,
                child: ProfessorLinksRoundButton(
                  icon: Icons.close_rounded,
                  semanticLabel: 'Fechar',
                  onTap: () => professorLinksBack(context),
                ),
              ),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.only(top: 48, bottom: 16),
                  child: Column(
                    children: [
                      Container(
                        width: 76,
                        height: 76,
                        decoration: BoxDecoration(
                          color: AppColors.pending.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(24),
                          border: Border.all(
                            color: AppColors.pending.withValues(alpha: 0.4),
                          ),
                        ),
                        child: Icon(
                          Icons.send_rounded,
                          size: 30,
                          color: colors.pending,
                        ),
                      ),
                      const SizedBox(height: 22),
                      Text(
                        'Solicitação enviada',
                        textAlign: TextAlign.center,
                        style: ProfessorLinksStyle.display(
                          24,
                          color: colors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'A $arenaName vai analisar seu pedido. Você recebe uma '
                        'notificação com a resposta.',
                        textAlign: TextAlign.center,
                        style: AppTypography.bodyM.copyWith(
                          color: ProfessorLinksStyle.mute(colors),
                          height: 1.5,
                        ),
                      ),
                      const SizedBox(height: 26),
                      ProfessorLinksCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                ProfessorArenaMark(
                                  name: link?.arenaName ?? 'Arena',
                                  logoUrl: link?.arenaLogoUrl,
                                  size: 40,
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        link?.arenaName ?? 'Arena',
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: ProfessorLinksStyle.display(
                                          14,
                                          weight: FontWeight.w700,
                                          color: colors.onSurface,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      ProfessorLinkStatusLabel(
                                        status,
                                        small: true,
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                            if (link != null) ...[
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  ProfessorLinkTypeTag(link.type, small: true),
                                  if (dateLine != null) ...[
                                    const SizedBox(width: 8),
                                    Flexible(
                                      child: Text(
                                        dateLine,
                                        style: ProfessorLinksStyle.mono(
                                          10,
                                          weight: FontWeight.w600,
                                          color: ProfessorLinksStyle.dim(
                                            colors,
                                          ),
                                        ),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ],
                            if (cardNote != null) ...[
                              const SizedBox(height: 12),
                              Divider(
                                height: 1,
                                color: ProfessorLinksStyle.line(colors),
                              ),
                              const SizedBox(height: 12),
                              Text(
                                cardNote,
                                style: AppTypography.bodyS.copyWith(
                                  fontSize: 11.5,
                                  color: ProfessorLinksStyle.dim(colors),
                                  height: 1.45,
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
              ProfessorLinksPrimaryButton(
                key: const Key('professor-sent-my-arenas'),
                label: 'Ver minhas arenas',
                onPressed: () =>
                    context.pushReplacementNamed(AppRouteNames.professorArenas),
              ),
              if (link != null && status == ArenaProfessorLinkStatus.pending)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: TextButton(
                    key: const Key('professor-sent-cancel'),
                    onPressed: _canceling ? null : () => _cancel(link),
                    style: TextButton.styleFrom(
                      foregroundColor: ProfessorLinksStyle.dim(colors),
                      textStyle: AppTypography.soraRegular(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    child: Text(
                      _canceling ? 'Cancelando…' : 'Cancelar solicitação',
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
