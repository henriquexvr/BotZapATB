# ATBLoLBot

Bot de WhatsApp que monitora partidas de League of Legends e TFT dos jogadores registrados e gera mensagens de roast automáticas via IA (Google Gemini) quando detecta uma derrota.

## Comandos

| Comando | Descrição | Exemplo |
|---|---|---|
| `!player Nick#Tag` | Registra um jogador para monitoramento | `!player Faker#KR1` |
| `!roast_ultimo` | Gera "Boletim da Vergonha" com zoeiras para quem perdeu | `!roast_ultimo` |
| `!stats_10` | Mostra winrate das últimas 10 partidas por modo | `!stats_10` |
| `!meu_id` | Retorna o ID do chat/grupo | `!meu_id` |

## Como funciona o monitoramento automático

1. A cada **~10 minutos** (configurável via `POLLING_INTERVAL`), o bot verifica todos os jogadores
2. Busca a partida mais recente em **7 filas** simultaneamente
3. Compara com o último ID salvo
4. Se o ID mudou → nova partida detectada
5. Se for **derrota** → gera roast via Gemini e envia no grupo

## Quanto tempo depois de uma partida?

- **POLLING_INTERVAL padrão: 10 minutos**
- A Riot API atualiza o histórico em poucos segundos
- **Tempo médio para detectar: ~1 a 10 minutos** após o fim da partida
- No pior caso: até 10 minutos (se a partida acabou logo após um ciclo)

## Modos monitorados

| Modo | ID | Status |
|---|---|---|
| Ranked Solo/Duo | 420 | Monitorado |
| ARAM | 450 | Monitorado |
| Flex 5v5 | 440 | Monitorado |
| URF | 1900 | Monitorado |
| Arena | 1700 | Monitorado |
| TFT Normal | 1100 | Monitorado |
| TFT Ranked | 1101 | Monitorado |

## Fluxo quando detecta uma derrota

1. Busca detalhes da partida (KDA, campeão, oponente, dano, elo)
2. Envia dados para Google Gemini com prompts específicos por modo
3. IA gera roast sarcástico em PT-BR
4. Mensagem enviada automaticamente para o grupo
5. Se IA falhar → usa mensagem de fallback pré-definida

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `RIOT_API_KEY` | Sim | Chave da API Riot |
| `GEMINI_API_KEY` | Sim | Chave da API Google Gemini |
| `WHATSAPP_TARGET` | Sim | JID do grupo WhatsApp |
| `POLLING_INTERVAL` | Não | Intervalo em ms (padrão: 600000 = 10 min) |
| `PORT` | Não | Porta do servidor health check (padrão: 3000) |
| `NODE_ENV` | Não | Se `production`, usa `/app/persist` |

## Deploy no Render

O projeto já está configurado para deploy no Render via Docker:

1. Conecte o repositório GitHub no Render
2. O `render.yaml` será detectado automaticamente como Blueprint
3. Configure as variáveis de ambiente no painel do Render
4. Na primeira execução, acesse `https://SEU-APP.onrender.com/qr` para escanear o QR Code
5. Após escanear, a sessão é salva no disco persistente

## Estrutura

```
src/
  index.js    — Entry point, WhatsApp connection, comandos, polling
  riot.js     — API Riot, busca de partidas e ranks
  gemini.js   — Prompts de roast e resumos de winrate
```

## Notas importantes

- **QR Code**: acessível em `/qr` no servidor
- **Persistência**: dados salvos em `persist/data.json`, sessão WhatsApp em `persist/auth_info_baileys/`
- **Reconexão automática**: reconecta após 5 segundos se a conexão cair
- **Rank silencioso**: erros 403 na API Riot (quota) são ignorados
- **Fallback do Gemini**: se a IA falhar, retorna mensagens pré-definidas
