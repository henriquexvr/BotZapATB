const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();
 
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
 
const safetySettings = [
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
];
 
const model = genAI.getGenerativeModel({ 
  model: "gemini-2.5-flash",
  safetySettings 
});
 
async function generateRoast(playerName, matchDetails, playerRank = null) {
  let contextRank = "";
  if (playerRank) {
    contextRank = `- Elo Atual do Jogador: ${playerRank.tier} ${playerRank.rank} (${playerRank.lp} LP)`;
  }
 
  const gameModeName = matchDetails.gameMode === 'ARAM' ? 'ARAM' : 'Solo/Duo';
  const aramExtra = matchDetails.gameMode === 'ARAM'
    ? 'No ARAM não tem desculpa nenhuma — é só apertar e atacar. Como ele conseguiu perder assim?'
    : `Se o elo dele for mencionado, use isso para humilhar mais ainda.`;
 
  const prompt = `
    Aja como um comentarista de eSports extremamente sarcástico e engraçado.
    Meu amigo ${playerName} acabou de PERDER uma partida de League of Legends no modo ${gameModeName}.
    Detalhes humilhantes da partida:
    - Modo de jogo: ${gameModeName}
    - Campeão usado: ${matchDetails.champion}
    - Desempenho (KDA): ${matchDetails.kda}
    - Rota: ${matchDetails.lane}
    - Oponente direto: ${matchDetails.opponentChampion}
    ${contextRank}
    - Dano causado: ${matchDetails.damage}
    - Gold acumulado: ${matchDetails.gold}
 
    Crie uma mensagem curta (máximo 2-3 parágrafos) em Português para enviar no WhatsApp, 
    zoando muito ele pela derrota. ${aramExtra}
    Mencione como o oponente direto (${matchDetails.opponentChampion}) provavelmente deu um baile nele. 
    Use gírias de LoL, seja criativo e engraçado. Comece com algo que chame a atenção de todos no grupo.
  `;
 
  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error("Gemini Roast Error:", error.message);
    return `🚨 DERROTA (${gameModeName}): ${playerName} de ${matchDetails.champion} (KDA: ${matchDetails.kda}). Contra ${matchDetails.opponentChampion}. Entregou a paçoca!`;
  }
}
 
async function generateWinRateSummary(playerName, stats) {
  const prompt = `
    Aja como um analista de LoL sincero e sarcástico.
    Meu amigo ${playerName} jogou as últimas ${stats.total} partidas (Solo/Duo e ARAM combinados).
    Estatísticas:
    - Vitórias: ${stats.wins}
    - Derrotas: ${stats.losses}
    - Winrate: ${stats.winRate}%
    - Campeão mais jogado: ${stats.topChampion}
 
    Crie um resumo curto em Português para WhatsApp comentando se ele está carregando ou se ele é o "elo hell" ambulante.
  `;
 
  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    return `${playerName} tem ${stats.winRate}% de winrate. O gráfico tá parecendo uma ladeira abaixo.`;
  }
}
 
async function generateMultiRoast(playerDataList) {
  let context = "Os seguintes jogadores perderam partidas recentemente (Solo/Duo ou ARAM):\n\n";
 
  playerDataList.forEach(p => {
    const gameModeName = p.match.gameMode === 'ARAM' ? 'ARAM' : 'Solo/Duo';
    context += `- Jogador: ${p.name}\n`;
    context += `  Modo: ${gameModeName}\n`;
    context += `  Elo: ${p.rank ? `${p.rank.tier} ${p.rank.rank} (${p.rank.lp} LP)` : 'Unranked'}\n`;
    context += `  Campeão: ${p.match.champion}\n`;
    context += `  KDA: ${p.match.kda}\n`;
    context += `  Oponente: ${p.match.opponentChampion}\n`;
    context += `  Dano causado: ${p.match.damage}\n\n`;
  });
 
  const prompt = `
    Aja como um comentarista de eSports extremamente sarcástico, ácido e engraçado.
    Abaixo estão detalhes de jogadores que perderam suas partidas (Solo/Duo ou ARAM).
    
    ${context}
 
    Crie uma única mensagem para WhatsApp consolidando a zoeira para todos esses jogadores. 
    A mensagem deve ser um "boletim da vergonha". 
    Se alguém perdeu no ARAM, zoie o dobro — não tem desculpa nenhuma pra perder no ARAM.
    Zoie o elo deles e como conseguiram perder nessas condições. 
    Seja criativo, use gírias de LoL, compare o desempenho entre eles.
    A mensagem deve ser impactante e curta.
  `;
 
  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error("Gemini MultiRoast Error:", error.message);
    return "O Boletim da Vergonha de hoje está tão pesado que a IA entrou em greve. Vocês são ruins demais!";
  }
}
 
module.exports = { generateRoast, generateWinRateSummary, generateMultiRoast };