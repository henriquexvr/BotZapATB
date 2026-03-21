const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  delay
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs-extra');
const path = require('path');
const express = require('express'); // Adicionado express
require('dotenv').config();

const { getPuuid, getLatestMatchId, getMatchDetails, getMatchHistoryIds, getWinRateStats, getSummonerRank } = require('./riot');
const { generateRoast, generateWinRateSummary, generateMultiRoast } = require('./gemini');

// Servidor Health Check para o Railway não derrubar o bot
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(port, () => console.log(`Health check server on port ${port}`));

// Caminho para a pasta de persistência (Railway Volumes)
const PERSIST_PATH = process.env.NODE_ENV === 'production' ? '/app/persist' : path.join(__dirname, '../persist');
if (!fs.existsSync(PERSIST_PATH)) fs.mkdirSync(PERSIST_PATH, { recursive: true });

const DATA_PATH = path.join(PERSIST_PATH, 'data.json');

async function loadData() {
  if (await fs.pathExists(DATA_PATH)) {
    return await fs.readJson(DATA_PATH);
  }
  return { players: [], lastMatchIds: {} };
}

async function saveData(data) {
  await fs.writeJson(DATA_PATH, data, { spaces: 2 });
}

async function connectToWhatsApp() {
  const authPath = path.join(PERSIST_PATH, 'auth_info_baileys');
  const { state, saveCreds } = await useMultiFileAuthState(authPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n--- ESCANEIE O QR CODE ABAIXO ---');
      qrcode.generate(qr, { small: true }); 
      
      // Gera um link para ver o QR Code como imagem (mais fácil para logs da web)
      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qr)}&size=300x300`;
      console.log('\nOU ACESSE ESTE LINK PARA VER A IMAGEM DO QR CODE:');
      console.log(qrImageUrl);
      console.log('---------------------------------\n');
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Conexão fechada. Reconectando...', shouldReconnect);
      if (shouldReconnect) connectToWhatsApp();
    } else if (connection === 'open') {
      console.log('WhatsApp Bot conectado (Baileys)!');
      startPolling(sock);
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message) return; // Removi o check de fromMe para permitir testes do próprio número

    const from = msg.key.remoteJid;
    
    // Extrator de texto robusto
    const text = msg.message.conversation || 
                 msg.message.extendedTextMessage?.text || 
                 msg.message.imageMessage?.caption || 
                 msg.message.videoMessage?.caption || 
                 msg.message.buttonsResponseMessage?.selectedButtonId || 
                 msg.message.listResponseMessage?.singleSelectReply?.selectedRowId ||
                 '';
                 
    const msgBody = text.toLowerCase().trim();

    if (text) {
      console.log(`\n[NOVA MENSAGEM]`);
      console.log(`De: ${from}`);
      console.log(`Texto: ${text}`);
      console.log(`----------------\n`);
    }

    if (msgBody.startsWith('!player ')) {
      const input = text.replace(/!player /i, '').trim();
      const parts = input.split('#');
      const gameName = parts[0];
      const tagLine = parts[1] || 'BR1';

      try {
        await sock.sendMessage(from, { text: `Buscando jogador ${gameName}#${tagLine}...` });
        const puuid = await getPuuid(gameName, tagLine);
        
        if (puuid) {
          const data = await loadData();
          if (data.players.some(p => p.puuid === puuid)) {
            await sock.sendMessage(from, { text: `Já estou acompanhando ${gameName}#${tagLine}!` });
            return;
          }
          data.players.push({ name: gameName, tag: tagLine, puuid });
          await saveData(data);
          await sock.sendMessage(from, { text: `✅ Agora estou vigiando as derrotas de ${gameName}#${tagLine}!` });
        } else {
          await sock.sendMessage(from, { text: `❌ Não encontrei esse jogador. Verifique Nick#Tag.` });
        }
      } catch (e) {
        console.error("Erro ao processar #player:", e.message);
      }
    }
    
    if (msgBody === '!meu_id') {
      await sock.sendMessage(from, { text: `O ID desta conversa/grupo é: ${from}` });
    }

    if (msgBody === '!roast_ultimo') {
      const data = await loadData();
      if (data.players.length === 0) {
        await sock.sendMessage(from, { text: "Nenhum jogador está sendo vigiado ainda. Use !player Nick#Tag para adicionar." });
        return;
      }

      await sock.sendMessage(from, { text: "Buscando as últimas partidas de Solo/Duo... 🔍" });

      const losses = [];
      const winners = [];

      for (const player of data.players) {
        try {
          const latestMatchId = await getLatestMatchId(player.puuid);
          if (!latestMatchId) continue;

          const match = await getMatchDetails(latestMatchId, player.puuid);
          if (match) {
            // Tenta pegar o rank, mas se der erro (403), continua sem ele
            let rank = null;
            try {
              rank = await getSummonerRank(player.puuid);
            } catch (e) {
              console.log(`Não foi possível obter rank para ${player.name}, continuando sem elo.`);
            }

            if (!match.win) {
              losses.push({ name: player.name, match, rank });
            } else {
              winners.push(player.name);
            }
          }
        } catch (err) {
          console.error(`Erro no roast_ultimo para ${player.name}:`, err.message);
        }
      }

      if (losses.length > 0) {
        const roast = await generateMultiRoast(losses);
        await sock.sendMessage(from, { text: `🔥 *BOLETIM DA VERGONHA* 🔥\n\n${roast}` });
      }

      if (winners.length > 0) {
        await sock.sendMessage(from, { text: `😒 Vencedores do momento (sem graça): ${winners.join(', ')}` });
      }

      if (losses.length === 0 && winners.length === 0) {
        await sock.sendMessage(from, { text: "Não encontrei partidas recentes para ninguém." });
      }
    }

    if (msgBody === '!stats_30') {
      const data = await loadData();
      if (data.players.length === 0) {
        await sock.sendMessage(from, { text: "Nenhum jogador vigiado." });
        return;
      }

      await sock.sendMessage(from, { text: "Analisando as últimas 30 partidas de todos... segura o coração! 📊" });

      for (const player of data.players) {
        try {
          const matchIds = await getMatchHistoryIds(player.puuid, 30);
          if (matchIds.length === 0) continue;

          const stats = await getWinRateStats(player.puuid, matchIds);
          if (stats) {
            const summary = await generateWinRateSummary(player.name, stats);
            await sock.sendMessage(from, { text: `📊 *Relatório de Performance: ${player.name}*\n\n${summary}` });
          }
        } catch (err) {
          console.error(`Erro no stats_30 para ${player.name}:`, err.message);
        }
      }
    }
  });
}

async function startPolling(sock) {
  console.log('Starting match polling loop...');
  setInterval(async () => {
    const data = await loadData();
    const target = process.env.WHATSAPP_TARGET;

    if (!target || target === 'COLOCAR_ID_AQUI') {
      console.log('WHATSAPP_TARGET not set in .env.');
      return;
    }

    for (const player of data.players) {
      try {
        const latestMatchId = await getLatestMatchId(player.puuid);
        if (!latestMatchId) continue;

        // Se for a primeira vez vendo este player, apenas registra o match ID sem postar
        if (!data.lastMatchIds[player.puuid]) {
          console.log(`Inicializando match ID para ${player.name}: ${latestMatchId}`);
          data.lastMatchIds[player.puuid] = latestMatchId;
          await saveData(data);
          continue;
        }

        const lastSeen = data.lastMatchIds[player.puuid];

        if (latestMatchId !== lastSeen) {
          console.log(`Nova partida detectada para ${player.name}: ${latestMatchId}`);
          const match = await getMatchDetails(latestMatchId, player.puuid);

          if (match && !match.win) {
            console.log(`A partida foi uma DERROTA para ${player.name}. Gerando roast...`);
            let rank = null;
            try {
              rank = await getSummonerRank(player.puuid);
            } catch (e) {
              console.log("Erro ao buscar rank no polling automático.");
            }
            
            const roast = await generateRoast(player.name, match, rank);
            await sock.sendMessage(target, { text: roast });
            console.log(`Roast automático enviado para ${target}`);
          }

          // Atualiza o ID da última partida vista para não repetir
          data.lastMatchIds[player.puuid] = latestMatchId;
          await saveData(data);
        }
      } catch (err) {
        console.error(`Erro no monitoramento de ${player.name}:`, err.message);
      }
    }
  }, process.env.POLLING_INTERVAL || 600000);
}

connectToWhatsApp();