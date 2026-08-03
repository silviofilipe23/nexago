import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/lgpd_term.dart';

/// Bottom sheet do termo de uso de imagem/LGPD — obrigatório antes de criar a
/// inscrição (solo/convite) ou de aceitar um convite de parceiro.
///
/// Retorna `true` se o atleta marcou o checkbox e confirmou; `false`/null caso
/// contrário (fechou ou cancelou).
Future<bool> showLgpdConsentSheet(BuildContext context) async {
  final accepted = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: context.themeColors.canvas,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (context) => const _LgpdConsentSheet(),
  );
  return accepted == true;
}

class _LgpdConsentSheet extends StatefulWidget {
  const _LgpdConsentSheet();

  @override
  State<_LgpdConsentSheet> createState() => _LgpdConsentSheetState();
}

class _LgpdConsentSheetState extends State<_LgpdConsentSheet> {
  bool _accepted = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final bottomInset = MediaQuery.of(context).padding.bottom;

    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.fromLTRB(20, 16, 20, 16 + bottomInset),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: colors.onSurfaceMuted.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              lgpdTermTitle,
              style: AppTypography.soraRegular(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: colors.onSurface,
                height: 1.25,
              ),
            ),
            const SizedBox(height: 12),
            Flexible(
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: colors.surfaceRaised,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: colors.onSurfaceMuted.withValues(alpha: 0.12),
                  ),
                ),
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      for (var i = 0; i < lgpdTermParagraphs.length; i++) ...[
                        if (i > 0) const SizedBox(height: 10),
                        Text(
                          lgpdTermParagraphs[i],
                          style: Theme.of(context)
                              .textTheme
                              .bodyMedium
                              ?.copyWith(
                                color: colors.onSurfaceMuted,
                                height: 1.45,
                              ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            InkWell(
              borderRadius: BorderRadius.circular(10),
              onTap: () => setState(() => _accepted = !_accepted),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      width: 24,
                      height: 24,
                      child: Checkbox(
                        value: _accepted,
                        activeColor: AppColors.brand,
                        onChanged: (v) =>
                            setState(() => _accepted = v == true),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        lgpdCheckboxLabel,
                        style:
                            Theme.of(context).textTheme.bodyMedium?.copyWith(
                                  color: colors.onSurface,
                                  height: 1.4,
                                ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),
            SizedBox(
              height: 50,
              child: FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brand,
                  disabledBackgroundColor:
                      colors.onSurfaceMuted.withValues(alpha: 0.15),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                onPressed: _accepted
                    ? () => Navigator.of(context).pop(true)
                    : null,
                child: const Text(
                  'Aceitar e continuar',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
            ),
            const SizedBox(height: 6),
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: Text(
                'Cancelar',
                style: TextStyle(color: colors.onSurfaceMuted),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
