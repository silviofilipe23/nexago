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
