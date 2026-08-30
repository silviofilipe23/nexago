# Inscrições

## Estados
- Pendente
- Confirmada
- Lista de Espera
- Cancelada

Estados conceituais/de exibição, não um campo `status` persistido no documento de inscrição:
"Pendente"/"Confirmada" derivam do estado do pagamento e "Lista de Espera" de campos próprios da
vaga; "Cancelada" não é um valor gravado — a inscrição cancelada é excluída (o doc deixa de
existir, ver `## Regras` abaixo).

## Regras
- Inscrição só é confirmada após validação do pagamento.
- Categoria lotada gera lista de espera.
- **A primeira inscrição ativa do atleta num esporte tranca o nível declarado dele naquele esporte** (`sportOnboarding.levelLocked.{SPORT_CODE}`, gravado só pelo backend) — a partir daí ele só pode subir de nível. Entrar na lista de espera também tranca. Detalhe completo em [Nível → Calibração de nível](levels.md#calibração-de-nível-janela-de-correção).
- **Cancelar a inscrição nunca destrava o nível.** A coleção de inscrições não tem campo de status persistido: cancelamento (pelo atleta, pelo organizador, ou por pedido de cancelamento aprovado) é sempre exclusão do documento — o lock, uma vez gravado, nunca é desfeito.

## Substituição de atleta

Uma dupla/equipe inscrita pode trocar um atleta ATÉ a publicação das chaves da
categoria (`tournaments/{id}.categoryOps[categoryId].bracketStatus` em
`published`/`completed` bloqueia; `draft` não). A troca é por CONVITE
(`tournamentRegistrationInvites` com `isSubstitutionInvite: true`): o
substituto precisa aceitar — o aceite colhe LGPD, uniforme e dispara a trava de
nível dele. O gate é checado no envio e re-checado dentro da transação do
aceite (o convite vive 48h).

- Dupla: qualquer membro troca a própria vaga ou a do parceiro. Equipe (trio+):
  só o capitão, nunca a si mesmo (`captainUid` não muda).
- Pagamento fica intacto: a vaga paga segue paga e o substituto herda o status
  (`sharePaidUids`/`organizerConfirmedShareUids` trocam out→in). Acerto entre
  atletas é fora da plataforma. PIX aberto de quem sai é cancelado.
- `teamId` NUNCA muda; `participantUids`/`memberUids` trocam preservando o
  índice (slots de uniforme da dupla dependem da ordem).
- Trilha em `substitutionHistory` na inscrição (imutável para o cliente).
- Organizador não aprova; é notificado (`tournament_substitution_completed`).
- `generateCategoryBracket` marca `stale` (`bracket_published`) os convites de
  substituição pendentes da categoria.
