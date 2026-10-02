import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../organizer_public_profile/presentation/organizer_public_profile_page.dart';
import '../../domain/public_profile/organizer_profile_editor_providers.dart';

/// "Ver meu perfil" (`/organizer/perfil-publico/visualizar`): a mesma tela que o atleta vê, em
/// modo dono. Mora sob `/organizer` porque o guard de papel devolve o organizador à home em
/// qualquer rota `/competir/**`.
class OrganizerOwnPublicProfilePage extends ConsumerWidget {
  const OrganizerOwnPublicProfilePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final uid = ref.watch(organizerEditorUidProvider);
    return OrganizerPublicProfilePage(organizerId: uid, ownerPreview: true);
  }
}
