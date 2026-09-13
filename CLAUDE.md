# nexaGO — Contexto do Projeto

## O que é
App Flutter (mobile) para gestão e participação em torneios e ligas de esportes de quadra na areia — principalmente beach tennis e vôlei de praia. Conecta atletas, organizadores e arenas.

## Stack
- **Frontend mobile**: Flutter (Dart) — `/nexago_app/lib/`
- **Backend**: Firebase (Firestore, Auth, Cloud Functions, Storage)
- **Cloud Functions**: `/functions/`
- **Frontend web** (painel gestor/arena): `/frontend/`
- **Versão atual**: ver `version:` em `nexago_app/pubspec.yaml` (o `+N` é o build number do gate)

## Estrutura do app Flutter
```
lib/
  core/          # auth, router, theme, notifications, localização, validações
  features/
    arena/       # perfil e gestão de arena
    arenas/      # busca de arenas (atleta)
    athlete/     # perfil do atleta
    auth/        # login/cadastro
    home/        # hub principal
    organizer/   # painel do organizador de torneios
    ranking/     # ranking de jogadores
    tournaments/ # listagem e inscrição em torneios
```

## Domínio principal (Firestore)
- `arenas/{arenaId}` — quadras, comodidades, esportes (`courtTypes`, `surfaces`)
- `tournaments/{tournamentId}` — etapas, inscrições, chaves
- Ligas: estrutura a ser criada (ver `goals.md`)

## Metas ativas
Ver `goals.md` — lançamento do app + Liga nexaGO com 1ª etapa em 24/10.

## Release (loja)
Publicar o build **não basta**: o gate de atualização obrigatória lê `appConfig/appVersion` no
Firestore ao vivo. Depois que a versão estiver disponível na loja, subir o `minBuildNumber`:
```bash
cd functions && node scripts/set-min-app-version.js --project volley-track-dev-4596c --platform <ios|android> --min <build live> --yes
```
- `--min` é o **build number** (o `+N` do pubspec), não o `1.0.x`. Use o que ficou live — reenvio por rejeição da Apple bumpa o número.
- Projeto é sempre `volley-track-dev-4596c`: o app da loja aponta pro dev.
- Ordem importa: loja primeiro, número depois (iOS propaga em até ~24h). Desligar = `--min 0`, vale ao vivo.
- O gate só existe a partir do build 101; base anterior não bloqueia. Detalhes em `docs/forced-app-update.md`.

## Convenções
- Português nas strings/UI, inglês no código
- Padrão de features: cada feature tem sua própria pasta com `screens/`, `widgets/`, `providers/` (ou equivalente)
- Firestore rules em `firestore.rules`
