import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme_colors.dart';
import 'schedule_plan_ui.dart';

/// Folha de autorização do débito automático: mostra o texto exato que será
/// gravado como prova. Devolve `true` ao autorizar.
Future<bool?> showScheduleAutopayConsentSheet(
  BuildContext context, {
  required String consentText,
}) {
  return showScheduleSheet<bool>(
    context,
    builder: (sheetContext) => SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            const ScheduleSheetHeader(title: 'Autorizar débito automático'),
            const SizedBox(height: 12),
            Text(
              consentText,
              key: const Key('schedule-autopay-consent-text'),
              style: TextStyle(
                fontSize: 14,
                height: 1.5,
                color: sheetContext.themeColors.onSurface,
              ),
            ),
            const SizedBox(height: 18),
            SchedulePrimaryButton(
              key: const Key('schedule-autopay-authorize'),
              label: 'Autorizar',
              icon: null,
              onPressed: () => Navigator.of(sheetContext).pop(true),
            ),
            const SizedBox(height: 6),
            TextButton(
              onPressed: () => Navigator.of(sheetContext).pop(false),
              child: const Text('Agora não'),
            ),
          ],
        ),
      ),
    ),
  );
}
