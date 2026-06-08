import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../athlete_settings/athlete_settings_group.dart';

/// Card CONTA E PREFERÊNCIAS do Editar perfil.
class EditProfileAccountPrefsGroup extends StatelessWidget {
  const EditProfileAccountPrefsGroup({super.key, required this.email});

  final String? email;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final emailValue = email?.trim().isNotEmpty == true
        ? email!.trim()
        : 'Não informado';

    return DecoratedBox(
      decoration: AthleteSettingsTokens.cardDecoration(context),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AthleteSettingsTokens.cardRadius),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'E-MAIL DA CONTA',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: context.themeColors.onSurfaceMuted,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.6,
                      fontSize: 10,
                    ),
                  ),
                  SizedBox(height: 6),
                  Text(
                    emailValue,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: context.themeColors.onSurfaceMuted,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    'Vinculado à sua conta. Não pode ser alterado aqui.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: context.themeColors.onSurfaceMuted.withValues(
                        alpha: 0.75,
                      ),
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
            Divider(
              height: 1,
              color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
            ),
            // AthleteSettingsTile(
            //   icon: Icons.settings_outlined,
            //   title: 'Configurações da conta',
            //   subtitle: 'Idioma, região, pagamento',
            //   onTap: () => showAthleteSettingsComingSoon(context),
            //   showDivider: true,
            // ),
            // AthleteSettingsTile(
            //   icon: Icons.notifications_outlined,
            //   title: 'Notificações',
            //   subtitle: '4 ativas · 2 silenciadas',
            //   onTap: () => showAthleteSettingsComingSoon(context),
            //   showDivider: true,
            // ),
            // AthleteSettingsTile(
            //   icon: Icons.lock_outline_rounded,
            //   title: 'Privacidade e segurança',
            //   subtitle: 'Perfil público · 2FA ativo',
            //   onTap: () => showAthleteSettingsComingSoon(context),
            //   showDivider: false,
            // ),
          ],
        ),
      ),
    );
  }
}
