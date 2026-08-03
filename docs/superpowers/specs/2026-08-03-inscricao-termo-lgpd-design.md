# Termo LGPD / uso de imagem na inscrição — design (03/08/2026)

## Problema
Torneios divulgam fotos e vídeos dos atletas. A inscrição precisa colher um aceite
explícito (uso de imagem + tratamento de dados, LGPD) e o organizador precisa ver
esse aceite na listagem de inscrições.

## Dados (doc `artifacts/{pid}/public/data/inscriptions/{id}`)
- `lgpdAcceptedUids: string[]` — uids que aceitaram o termo (arrayUnion)
- `lgpdAcceptedAt: { [uid]: Timestamp }` — data/hora do aceite por atleta (auditoria)
- `lgpdTermVersion: string` — versão do texto do termo (hoje `2026-08`)

Escrita SOMENTE pelas Cloud Functions (Admin SDK). Rules: campos LGPD entram na
lista de campos imutáveis no `allow update` de jogador.

## Backend (functions/src/tournament-partner-invite.ts)
- `registerSoloTournament`: payload ganha `lgpdAccepted?: boolean`; se true, doc
  nasce com os campos LGPD do player1.
- `sendTournamentPartnerInvite`: payload ganha `lgpdAccepted?`; grava
  `inviterLgpdAccepted/At` no doc do convite.
- `acceptTournamentPartnerInvite`: payload ganha `lgpdAccepted?`; na criação da
  inscrição da dupla (ou anexo à solo existente) grava os aceites de convidante
  (vindo do convite) e convidado.

Retrocompat: `lgpdAccepted` é OPCIONAL no servidor (apps antigos seguem
funcionando, inscrição fica sem aceite registrado). A obrigatoriedade é imposta
pelas UIs novas (checkbox obrigatório). Sem aceite ⇒ organizador vê "pendente".

## Atleta
Texto único do termo (uso de imagem/voz em fotos e vídeos para divulgação +
tratamento de dados, Lei 13.709/2018), duplicado por superfície (não há lib
compartilhada Flutter↔web).

- Portal web (frontend/projects/athlete): checkbox no passo final do shell de
  inscrição (gate dos CTAs "inscrever-se"/"convidar"), link abre dialog com o
  termo completo; aceite de convite (shell + agenda) passa por dialog de
  confirmação com o termo. Repositório envia `lgpdAccepted: true`.
- App Flutter (nexago_app): checkbox no passo `partner` do wizard (gate das
  ações registrar solo / enviar convite), bottom sheet com o termo; aceite de
  convite ganha o mesmo gate. `tournament_partner_invite_service` envia
  `lgpdAccepted: true`.

## Organizador
Status derivado por inscrição: aceito (todos os `participantUids` em
`lgpdAcceptedUids`), parcial (algum), pendente (nenhum/ausente — inclui docs
antigos).
- Portal web (frontend/projects/organizer): badge na linha da listagem de
  inscrições (`inscricoes.component.ts`), com tooltip de data.
- App Flutter: chip no `organizer_team_list_tile.dart`
  (`OrganizerCategoryTeamRow` ganha `lgpdAcceptedUids`).

## Fora de escopo
- Rejeitar inscrição sem aceite no servidor (quebraria apps antigos).
- Termo configurável por torneio; gestão de versões além da constante.
- Backfill de inscrições antigas (ficam "pendente").
