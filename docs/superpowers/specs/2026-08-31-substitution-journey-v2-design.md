# Jornada de substituição v2 (app) — Design

Data: 2026-08-31 · Status: aprovado em chat ("pode seguir pra implementação direto" — gate de revisão da spec dispensado pelo dono)
Base: feature do PR #359 (substituição até a publicação das chaves). Mockups do dono guiam o visual; as REGRAS abaixo prevalecem onde o mockup divergir.

## Decisões (Q&A)

1. **Gate inalterado**: troca permitida até `bracketStatus published` da categoria. A caixa "Regras deste torneio" exibe essa regra (sem data de prazo); o countdown da tela de acompanhamento usa o `expiresAt` do convite (TTL 48h). Sem aprovação manual pós-prazo.
2. **Motivo persistido**: `reason` (`lesao|imprevisto|trabalho|viagem|outro`) e `reasonNote` (≤300) opcionais no envio; entram no doc do convite, no `substitutionHistory` e no corpo da notificação ao organizador no aceite.
3. **Sugestões simples**: "Suas últimas duplas" = `RecentPartnersRepository.loadRecentPartners` filtrado (gênero da categoria; exclui membros). SEM "% match" e SEM contagens.
4. **Tela pendente**: timeline (createdAt ✓ → aguardando aceite), "visualizado há X" via callable `markSubstitutionInviteViewed` (invitee grava `viewedAt` 1x), countdown do TTL, "Lembrar" = callable `resendSubstitutionInvite` (inviter, rate-limit 6h via `lastReminderAt`) + share sheet (`share_plus`) com mensagem e link do convite. **WhatsApp SEM telefone do banco** (share sheet; o usuário escolhe o contato). "Cancelar troca" = `cancelInvite` existente.
5. **Entrega**: mesma branch/PR #359. Portal do atleta inalterado nesta fase. Bottom-sheet atual é aposentado em favor do wizard em rotas.

## Telas (Flutter, feature tournaments)

1. **Detalhe da inscrição** `/torneios/:id/inscricao/:registrationId/detalhe` — card confirmado (avatares, "R$ X pagos", status da chave), card evento (data · arena · categoria), seção "PRECISA MUDAR ALGUMA COISA?": card Substituir (só com `substitutionReplaceableUids` não-vazio; vira "Substituição em curso →" quando há convite de substituição pendente da inscrição) + card Cancelar (fluxo existente). Entrada: card confirmado da aba Minha Inscrição navega para cá.
2. **Wizard 1 — Quem não vai poder jogar?** — radios com avatar/papel; chips de motivo + texto opcional; caixa de regras (publicação das chaves + nível compatível com a categoria). CTA "Escolher o substituto →".
3. **Wizard 2 — Quem entra no lugar** — header "Saindo: {nome} · {motivo}"; busca; "Suas últimas duplas"; aviso âmbar do pagamento; CTA "Pedir substituição por {nome}" → envia e navega ao acompanhamento.
4. **Substituição em curso** `/torneios/:id/substituicao/:inviteId` — watchInvite ao vivo; "X sai, Y entra"; timeline com viewedAt; barra countdown "VAGA RESERVADA" até expiresAt com copy honesta; card "Acerto do valor" (só com pagamento); ações Lembrar (push + share) e Cancelar troca. `accepted` → tela de sucesso; `declined|expired|stale|cancelled` → estado terminal com "Tentar com outro atleta".
5. **Sucesso — Dupla/Equipe atualizada** — "Y é sua nova dupla", cards inscrição/pagamento, linhas "X saiu · motivo · registrado com o organizador" / "Y entrou · dentro da categoria {nome}", CTA "Ver inscrição" → detalhe.

## Fora de escopo

Deadline configurável; aprovação manual pós-prazo; % match/contagens; portal com a jornada; telefone atleta-a-atleta; "Nível 4.3" numérico no sucesso.
