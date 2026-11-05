import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/errors/friendly_error_message.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../application/blog_providers.dart';
import '../../domain/blog_notify_prefs.dart';
import '../../domain/blog_post.dart';

/// Avisos do blog por categoria: a linha com switch no fim da leitura e o card
/// "Avisos do blog" de Salvos e lendo, com a folha de ajuste. Com o push
/// desligado nas Configurações o servidor não manda nada do blog: em vez de um
/// switch que não faz efeito, a dica e o atalho para as preferências.

void _openNotificationSettings(BuildContext context) =>
    context.pushNamed(AppRouteNames.athleteNotificationSettings);

Future<void> _setCategory(
  BuildContext context,
  WidgetRef ref,
  BlogCategory category,
  bool on,
) async {
  try {
    await ref
        .read(blogNotifyPrefsControllerProvider)
        .setCategory(category, on: on);
  } catch (e) {
    if (!context.mounted) return;
    showAppSnackBar(
      context,
      friendlyErrorMessage(
        e,
        action: 'Não foi possível salvar o aviso',
        logReason: 'blog_notify_prefs',
      ),
      isError: true,
    );
  }
}

Widget _switch({
  required Key key,
  required bool value,
  required ValueChanged<bool>? onChanged,
}) => Switch.adaptive(
  key: key,
  value: value,
  onChanged: onChanged,
  activeTrackColor: AppColors.brand.withValues(alpha: 0.55),
  activeThumbColor: AppColors.brand,
);

/// "Avisar posts de Torneios · Você recebe um push quando sair o próximo".
/// Some enquanto os avisos carregam e em post de categoria desconhecida.
class BlogNotifyCategoryRow extends ConsumerWidget {
  const BlogNotifyCategoryRow({super.key, required this.category});

  final BlogCategory? category;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final category = this.category;
    final prefs = ref.watch(blogNotifyPrefsProvider).valueOrNull;
    if (category == null || prefs == null) return const SizedBox.shrink();
    final pushOff = ref.watch(blogPushChannelOnProvider) == false;
    final colors = context.themeColors;
    final on = prefs.isOn(category);

    return Container(
      key: const Key('blog-notify-row'),
      padding: const EdgeInsets.only(top: 12),
      decoration: BoxDecoration(
        border: Border(
          top: BorderSide(color: colors.onSurface.withValues(alpha: 0.08)),
        ),
      ),
      child: Row(
        children: [
          Icon(
            pushOff
                ? Icons.notifications_off_outlined
                : Icons.notifications_none_rounded,
            size: 18,
            color: pushOff ? colors.onSurfaceMuted : colors.brandText,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Avisar posts de ${category.label}',
                  style: AppTypography.soraRegular(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: colors.onSurface,
                  ),
                ),
                Text(
                  pushOff
                      ? 'O push está desligado nas notificações do app.'
                      : 'Você recebe um push quando sair o próximo',
                  style: AppTypography.soraRegular(
                    fontSize: 12,
                    fontWeight: FontWeight.w400,
                    color: colors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          if (pushOff)
            _LinkButton(
              key: const Key('blog-notify-open-settings'),
              label: 'Ativar',
              onTap: () => _openNotificationSettings(context),
            )
          else
            _switch(
              key: const Key('blog-notify-switch'),
              value: on,
              onChanged: (v) => _setCategory(context, ref, category, v),
            ),
        ],
      ),
    );
  }
}

/// Card de Salvos e lendo: "Avisos do blog · Torneios e Treino ligados ·
/// Ajustar". Some enquanto os avisos carregam.
class BlogNotifyCard extends ConsumerWidget {
  const BlogNotifyCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = ref.watch(blogNotifyPrefsProvider).valueOrNull;
    if (prefs == null) return const SizedBox.shrink();
    final pushOff = ref.watch(blogPushChannelOnProvider) == false;
    final colors = context.themeColors;
    const radius = BorderRadius.all(Radius.circular(16));

    return Material(
      color: AppColors.brand.withValues(alpha: 0.06),
      shape: RoundedRectangleBorder(
        borderRadius: radius,
        side: BorderSide(color: AppColors.brand.withValues(alpha: 0.3)),
      ),
      child: InkWell(
        key: const Key('blog-notify-card'),
        borderRadius: radius,
        onTap: () => pushOff
            ? _openNotificationSettings(context)
            : showBlogNotifySheet(context),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              Icon(
                pushOff
                    ? Icons.notifications_off_outlined
                    : Icons.notifications_none_rounded,
                size: 20,
                color: colors.brandText,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Avisos do blog',
                      style: AppTypography.soraRegular(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w600,
                        color: colors.onSurface,
                      ),
                    ),
                    Text(
                      pushOff
                          ? 'Push desligado nas notificações do app'
                          : blogNotifySummary(prefs),
                      style: AppTypography.soraRegular(
                        fontSize: 12,
                        fontWeight: FontWeight.w400,
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(
                pushOff ? 'Ativar' : 'Ajustar',
                style: AppTypography.soraRegular(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: colors.brandText,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Folha com um switch por categoria.
Future<void> showBlogNotifySheet(BuildContext context) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: context.themeColors.surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * 0.9,
      ),
      builder: (_) => const _BlogNotifySheet(),
    );

class _BlogNotifySheet extends ConsumerWidget {
  const _BlogNotifySheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final prefs =
        ref.watch(blogNotifyPrefsProvider).valueOrNull ?? BlogNotifyPrefs.allOn;
    final pushOff = ref.watch(blogPushChannelOnProvider) == false;

    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
        20,
        12,
        20,
        MediaQuery.paddingOf(context).bottom + 20,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: colors.onSurface.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'Avisos do blog',
            style: AppTypography.soraRegular(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: colors.onSurface,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Escolha de quais categorias você quer um push quando sair post '
            'novo.',
            style: AppTypography.soraRegular(
              fontSize: 13,
              fontWeight: FontWeight.w400,
              height: 1.4,
              color: colors.onSurfaceMuted,
            ),
          ),
          if (pushOff) ...[
            const SizedBox(height: 14),
            Container(
              key: const Key('blog-notify-push-off'),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: colors.surfaceRaised,
                borderRadius: const BorderRadius.all(Radius.circular(14)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'O push está desligado nas notificações do app. Ligue lá '
                    'para receber os avisos do blog.',
                    style: AppTypography.soraRegular(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      height: 1.4,
                      color: colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 6),
                  _LinkButton(
                    key: const Key('blog-notify-sheet-open-settings'),
                    label: 'Abrir notificações',
                    onTap: () {
                      // A folha sai da pilha: o router vem antes do pop.
                      final router = GoRouter.of(context);
                      Navigator.of(context).pop();
                      router.pushNamed(
                        AppRouteNames.athleteNotificationSettings,
                      );
                    },
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 8),
          for (final c in BlogCategory.values)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      c.label,
                      style: AppTypography.soraRegular(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: pushOff
                            ? colors.onSurfaceMuted
                            : colors.onSurface,
                      ),
                    ),
                  ),
                  _switch(
                    key: Key('blog-notify-sheet-${c.key}'),
                    value: prefs.isOn(c),
                    onChanged: pushOff
                        ? null
                        : (v) => _setCategory(context, ref, c, v),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _LinkButton extends StatelessWidget {
  const _LinkButton({super.key, required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return TextButton(
      onPressed: onTap,
      style: TextButton.styleFrom(
        foregroundColor: colors.brandText,
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        minimumSize: const Size(44, 36),
      ),
      child: Text(
        label,
        style: AppTypography.soraRegular(
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: colors.brandText,
        ),
      ),
    );
  }
}
