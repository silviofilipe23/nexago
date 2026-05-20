import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/router/routes.dart';

class AthleteSettingsPage extends ConsumerWidget {
  const AthleteSettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return CupertinoPageScaffold(
      backgroundColor: CupertinoColors.white,
      navigationBar: CupertinoNavigationBar(
        middle: const Text('Configurações'),
        leading: CupertinoNavigationBarBackButton(
          onPressed: () {
            if (context.canPop()) {
              context.pop();
            } else {
              context.go(AppRoutes.discover);
            }
          },
        ),
      ),
      child: SafeArea(
        top: true,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
          children: [
            CupertinoButton(
              padding: EdgeInsets.zero,
              onPressed: () async {
                await ref.read(authServiceProvider).signOut();
              },
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
                decoration: BoxDecoration(
                  color: const Color(0xFFF2F2F7),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFE5E5EA)),
                ),
                child: const Row(
                  children: [
                    Icon(
                      CupertinoIcons.square_arrow_right,
                      size: 20,
                      color: CupertinoColors.systemRed,
                    ),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Sair da conta',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: CupertinoColors.systemRed,
                        ),
                      ),
                    ),
                    Icon(
                      CupertinoIcons.chevron_forward,
                      size: 18,
                      color: CupertinoColors.systemGrey,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
