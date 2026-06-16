# nexaGO — Contexto do Projeto

## O que é
App Flutter (mobile) para gestão e participação em torneios e ligas de esportes de quadra na areia — principalmente beach tennis e vôlei de praia. Conecta atletas, organizadores e arenas.

## Stack
- **Frontend mobile**: Flutter (Dart) — `/nexago_app/lib/`
- **Backend**: Firebase (Firestore, Auth, Cloud Functions, Storage)
- **Cloud Functions**: `/functions/`
- **Frontend web** (painel gestor/arena): `/frontend/`
- **Versão atual**: 1.0.2+3

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

## Convenções
- Português nas strings/UI, inglês no código
- Padrão de features: cada feature tem sua própria pasta com `screens/`, `widgets/`, `providers/` (ou equivalente)
- Firestore rules em `firestore.rules`
