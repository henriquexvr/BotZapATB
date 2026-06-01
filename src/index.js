const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  delay
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const express = require('express');
require('dotenv').config();

const { getPuuid, getLatestMatchIds, getMatchDetails, getMatchHistoryIds, getWinRateStats, getSummonerRank } = require('./riot');
const { generateRoast, generateWinRateSummary, generateMultiRoast } = require('./gemini');

// Servidor Health Check para o Render não derrubar o bot
const app = express();
const port = parseInt(process.env.PORT, 10) || 3000;
app.get('/', (req, res) => res.send('Bot is running!'));
app.get('/ping', (req, res) => res.send('pong'));
app.get('/qr', async (req, res) => {
  if (currentQR) {
    res.setHeader('Content-Type', 'text/html');
    res.send(`<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#111"><img src="data:image/png;base64,${currentQR}" /></body></html>`);
  } else {
    res.send('QR Code não disponível. Aguarde ou escaneie.');
  }
});
app.listen(port, () => console.log(`Health check server on port ${port}`));

let currentQR = null;

// Caminho para a pasta de persistência (Render Disks)
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
  const tmpPath = DATA_PATH + '.tmp.' + process.pid;
  await fs.writeJson(tmpPath, data, { spaces: 2 });
  await fs.rename(tmpPath, DATA_PATH);
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

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQR = await QRCode.toDataURL(qr, { width: 400 });
      console.log('QR Code gerado! Acesse: https://SEU-APP.onrender.com/qr');
    }

    if (connection === 'close') {
      currentQR = null;
      const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Conexão fechada. Reconectando...', shouldReconnect);
      if (shouldReconnect) setTimeout(() => connectToWhatsApp(), 5000);
    } else if (connection === 'open') {
      currentQR = null;
      console.log('WhatsApp Bot conectado (Baileys)!');
      startPolling(sock);
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message) return;

    const from = msg.key.remoteJid;
    
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
      const tagLine = parts[1];

      if (!gameName || !tagLine || gameName.length > 16 || tagLine.length > 5 || !/^[a-zA-Z0-9\u00C0-\u00FF]+$/.test(gameName) || !/^[a-zA-Z0-9\u00C0-\u00FF]+$/.test(tagLine)) {
        await sock.sendMessage(from, { text: '❌ Formato inválido! Use: !player Nick#Tag\nExemplo: !player Faker#KR1\n(Apenas letras, números e acentos, máx. 16/5 caracteres)' });
        return;
      }

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
        console.error("Erro ao processar !player:", e.message);
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

      await sock.sendMessage(from, { text: "Buscando as últimas partidas de Ranked, ARAM e TFT... 🔍" });

      const losses = [];
      const winners = [];

      for (const player of data.players) {
        try {
          const latestIds = await getLatestMatchIds(player.puuid);
          let rank = null;
          try {
            rank = await getSummonerRank(player.puuid);
          } catch (e) {
            console.log(`Não foi possível obter rank para ${player.name}, continuando sem elo.`);
          }

          for (const [queueId, matchId] of Object.entries(latestIds)) {
            const match = await getMatchDetails(matchId, player.puuid);
            if (match) {
              if (!match.win) {
                losses.push({ name: player.name, match, rank });
              } else {
                winners.push(player.name);
              }
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

    if (msgBody === '!stats_10') {
      const data = await loadData();
      if (data.players.length === 0) {
        await sock.sendMessage(from, { text: "Nenhum jogador vigiado." });
        return;
      }

      await sock.sendMessage(from, { text: "Analisando as últimas 10 partidas de todos... segura o coração! 📊" });

      for (const player of data.players) {
        try {
          const matchIds = await getMatchHistoryIds(player.puuid, 10);
          if (matchIds.length === 0) continue;

          const stats = await getWinRateStats(player.puuid, matchIds);
          if (stats) {
            const summary = await generateWinRateSummary(player.name, stats);
            await sock.sendMessage(from, { text: `📊 *Relatório de Performance: ${player.name}*\n\n${summary}` });
          }
        } catch (err) {
          console.error(`Erro no stats_10 para ${player.name}:`, err.message);
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
        const latestIds = await getLatestMatchIds(player.puuid);
        if (Object.keys(latestIds).length === 0) continue;

        if (!data.lastMatchIds[player.puuid]) {
          console.log(`Inicializando match IDs para ${player.name}:`, latestIds);
          data.lastMatchIds[player.puuid] = latestIds;
          await saveData(data);
          continue;
        }

        const lastSeen = data.lastMatchIds[player.puuid];

        if (typeof lastSeen === 'string') {
          const migrated = {};
          for (const [qId, matchId] of Object.entries(latestIds)) {
            migrated[qId] = matchId;
          }
          if (!migrated[420] && lastSeen) migrated[420] = lastSeen;
          data.lastMatchIds[player.puuid] = migrated;
        }

        const currentLastSeen = data.lastMatchIds[player.puuid];

        for (const [queueId, matchId] of Object.entries(latestIds)) {
          const previousId = currentLastSeen[queueId];

          if (!previousId) {
            console.log(`Inicializando queue ${queueId} para ${player.name}: ${matchId}`);
            currentLastSeen[queueId] = matchId;
            continue;
          }

          if (matchId !== previousId) {
            console.log(`Nova partida detectada para ${player.name} (queue ${queueId}): ${matchId}`);
            const match = await getMatchDetails(matchId, player.puuid);

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

            currentLastSeen[queueId] = matchId;
          }
        }

        data.lastMatchIds[player.puuid] = currentLastSeen;
        await saveData(data);
      } catch (err) {
        console.error(`Erro no monitoramento de ${player.name}:`, err.message);
      }
    }
  }, process.env.POLLING_INTERVAL || 600000);
}

connectToWhatsApp();