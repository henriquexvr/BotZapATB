const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();
 
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
 
const safetySettings = [
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
];
 
const model = genAI.getGenerativeModel({ 
  model: "gemini-2.5-flash",
  safetySettings 
});

function isARAM(matchDetails) {
  return matchDetails.gameMode === 'ARAM' || matchDetails.queueId === 450;
}

function isFlex(matchDetails) {
  return matchDetails.queueId === 440;
}

function isArena(matchDetails) {
  return matchDetails.queueId === 1700;
}

function isURF(matchDetails) {
  return matchDetails.queueId === 1900;
}

function isRankedSolo(matchDetails) {
  return matchDetails.queueId === 420;
}

async function generateRoast(playerName, matchDetails, playerRank = null) {
  let contextRank = "";
  if (playerRank) {
    contextRank = `- Elo Atual (Solo/Duo): ${playerRank.tier} ${playerRank.rank} (${playerRank.lp} LP)`;
  }

  if (isARAM(matchDetails)) {
    const prompt = `
      Aja como um comentarista de ARAM extremamente sarcástico e sem dó.
      Meu amigo ${playerName} acabou de PERDER uma partida de ARAM no League of Legends.
      Detalhes da partida:
      - Modo de jogo: ARAM (All Random All Mid)
      - Campeão usado: ${matchDetails.champion}
      - Desempenho (KDA): ${matchDetails.kda}
      - Rota: ${matchDetails.lane}
      - Oponente direto: ${matchDetails.opponentChampion}
      ${contextRank}
      - Dano causado: ${matchDetails.damage}
      - Gold acumulado: ${matchDetails.gold}

      O ARAM é o modo mais fácil do League — não tem macro, não tem roaming, não tem gank, não tem draft.
      É só apertar botão e atacar no meio. SE ELE PERDEU NO ARAM, a culpa é 100% da mecânica dele.
      Zoie ele por:
      - Perder no modo onde todo mundo aleatório e só tem uma rua
      - Ter mecânica tão ruim que não consegue nem ganhar no ARAM
      - Culpar "time ruim" sendo que ele também pegou campeão aleatório
      - O oponente direto (${matchDetails.opponentChampion}) provavelmente deu um baile nele sendo que ambos estavam no mesmo modo caótico

      Crie uma mensagem curta (máximo 2-3 parágrafos) em Português para WhatsApp.
      Use gírias de LoL, seja criativo e engraçado. Comece com algo que chame a atenção de todos no grupo.
    `;

    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      console.error("Gemini ARAM Roast Error:", error.message);
      return `🚨 DERROTA (ARAM): ${playerName} de ${matchDetails.champion} (KDA: ${matchDetails.kda}). Perdeu no ARAM! Não tem desculpa, é só apertar botão!`;
    }
  }

  if (isFlex(matchDetails)) {
    const prompt = `
      Aja como um comentarista de eSports extremamente sarcástico e cruel.
      Meu amigo ${playerName} acabou de PERDER uma partida de Flex 5v5 no League of Legends.
      Detalhes da partida:
      - Modo de jogo: Flex 5v5 (time organizado)
      - Campeão usado: ${matchDetails.champion}
      - Desempenho (KDA): ${matchDetails.kda}
      - Rota: ${matchDetails.lane}
      - Oponente direto: ${matchDetails.opponentChampion}
      ${contextRank}
      - Dano causado: ${matchDetails.damage}
      - Gold acumulado: ${matchDetails.gold}

      O Flex é o modo onde você tem time organizado, comunicação, sinergia. MESMO ASSIM ELE PERDEU.
      Zoie ele por:
      - Ter um time completo e ainda assim perder — não tem desculpa de "random ruim"
      - Provavelmente é o elo hell do time, o elo mais baixo que carrega pra baixo
      - Deve ser o cara que faz o time inteiro jogar mal
      - Comunicação zero, playmakers zero, solo carry zero
      - O time organizado dele provavelmente jogava melhor sem ele

      Crie uma mensagem curta (máximo 2-3 parágrafos) em Português para WhatsApp.
      Use gírias de LoL, seja criativo e engraçado. Comece com algo que chame a atenção de todos no grupo.
    `;

    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      console.error("Gemini Flex Roast Error:", error.message);
      return `🚨 DERROTA (Flex): ${playerName} de ${matchDetails.champion} (KDA: ${matchDetails.kda}). Perdeu com time organizado! Não tem desculpa, tinha até comunicação!`;
    }
  }

  if (isArena(matchDetails)) {
    const prompt = `
      Aja como um comentarista de eSports extremamente sarcástico e sem dó.
      Meu amigo ${playerName} acabou de PERDER uma partida de Arena no League of Legends.
      Detalhes da partida:
      - Modo de jogo: Arena (2v2v2v2)
      - Campeão usado: ${matchDetails.champion}
      - Desempenho (KDA): ${matchDetails.kda}
      - Rota: ${matchDetails.lane}
      - Oponente direto: ${matchDetails.opponentChampion}
      ${contextRank}
      - Dano causado: ${matchDetails.damage}
      - Gold acumulado: ${matchDetails.gold}

      A Arena é o modo mais arcade do League — é pra se divertir, sem stress, sem ranking.
      MESMO ASSIM ELE PERDEU. Não conseguiu nem se divertir vencendo.
      Zoie ele por:
      - Perder no modo que foi feito pra ser divertido e fácil
      - Ter pegado um campeão que provavelmente é broken na Arena e ainda assim perder
      - Não conseguir ganhar nem no modo sem pressão
      - O oponente direto (${matchDetails.opponentChampion}) provavelmente estava jogando de olho fechado

      Crie uma mensagem curta (máximo 2-3 parágrafos) em Português para WhatsApp.
      Use gírias de LoL, seja criativo e engraçado. Comece com algo que chame a atenção de todos no grupo.
    `;

    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      console.error("Gemini Arena Roast Error:", error.message);
      return `🚨 DERROTA (Arena): ${playerName} de ${matchDetails.champion} (KDA: ${matchDetails.kda}). Perdeu na Arena! O cara não consegue nem se divertir vencendo!`;
    }
  }

  if (isURF(matchDetails)) {
    const prompt = `
      Aja como um comentarista de eSports extremamente sarcástico e cruel.
      Meu amigo ${playerName} acabou de PERDER uma partida de URF no League of Legends.
      Detalhes da partida:
      - Modo de jogo: URF (Ultra Rapid Fire)
      - Campeão usado: ${matchDetails.champion}
      - Desempenho (KDA): ${matchDetails.kda}
      - Rota: ${matchDetails.lane}
      - Oponente direto: ${matchDetails.opponentChampion}
      ${contextRank}
      - Dano causado: ${matchDetails.damage}
      - Gold acumulado: ${matchDetails.gold}

      URF é o modo onde TODO MUNDO é overpowered — cooldown zero, mana zero, dano absurdo.
      É o modo mais quebrado do League. E ELE PERDEU. Não tem desculpa possível.
      Zoie ele por:
      - Perder no modo onde todos os campeões são broken
      - Ter um campeão com 90% de cooldown reduction e ainda assim perder
      - Não conseguir nem no modo mais caótico e divertido do jogo
      - Deve estar culpando o "time ruim" sendo que todo mundo está overpowered igual
      - O oponente direto (${matchDetails.opponentChampion}) jogava com os pés e ainda assim ganhou

      Crie uma mensagem curta (máximo 2-3 parágrafos) em Português para WhatsApp.
      Use gírias de LoL, seja criativo e engraçado. Comece com algo que chame a atenção de todos no grupo.
    `;

    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      console.error("Gemini URF Roast Error:", error.message);
      return `🚨 DERROTA (URF): ${playerName} de ${matchDetails.champion} (KDA: ${matchDetails.kda}). Perdeu no URF! Todo mundo é broken menos ele!`;
    }
  }

  if (isRankedSolo(matchDetails)) {
    const prompt = `
      Aja como um comentarista de eSports extremamente sarcástico e engraçado.
      Meu amigo ${playerName} acabou de PERDER uma partida de League of Legends no modo Ranked (Solo/Duo).
      Detalhes humilhantes da partida:
      - Campeão usado: ${matchDetails.champion}
      - Desempenho (KDA): ${matchDetails.kda}
      - Rota: ${matchDetails.lane}
      - Oponente direto: ${matchDetails.opponentChampion}
      ${contextRank}
      - Dano causado: ${matchDetails.damage}
      - Gold acumulado: ${matchDetails.gold}

      Zoie ele por ter perdido na ranked. Use o elo dele para humilhar mais ainda.
      Mencione como o oponente direto (${matchDetails.opponentChampion}) provavelmente deu um baile nele.
      Crie uma mensagem curta (máximo 2-3 parágrafos) em Português para WhatsApp.
      Use gírias de LoL, seja criativo e engraçado. Comece com algo que chame a atenção de todos no grupo.
    `;

    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      console.error("Gemini Roast Error:", error.message);
      return `🚨 DERROTA (Ranked): ${playerName} de ${matchDetails.champion} (KDA: ${matchDetails.kda}). Contra ${matchDetails.opponentChampion}. Entregou a paçoca!`;
    }
  }

  return `🚨 DERROTA: ${playerName} perdeu uma partida no modo ${matchDetails.gameMode} (${matchDetails.champion}, KDA: ${matchDetails.kda}).`;
}
 
async function generateWinRateSummary(playerName, stats) {
  const modes = stats.modes;
  const rankedTotal = modes.RANKED.wins + modes.RANKED.losses;
  const aramTotal = modes.ARAM.wins + modes.ARAM.losses;
  const flexTotal = modes.FLEX.wins + modes.FLEX.losses;
  const arenaTotal = modes.ARENA.wins + modes.ARENA.losses;
  const urfTotal = modes.URF.wins + modes.URF.losses;

  const modeLines = [];
  if (rankedTotal > 0) modeLines.push(`- Ranked Solo/Duo: ${((modes.RANKED.wins / rankedTotal) * 100).toFixed(1)}% (${modes.RANKED.wins}V/${modes.RANKED.losses}D)`);
  if (aramTotal > 0) modeLines.push(`- ARAM: ${((modes.ARAM.wins / aramTotal) * 100).toFixed(1)}% (${modes.ARAM.wins}V/${modes.ARAM.losses}D)`);
  if (flexTotal > 0) modeLines.push(`- Flex 5v5: ${((modes.FLEX.wins / flexTotal) * 100).toFixed(1)}% (${modes.FLEX.wins}V/${modes.FLEX.losses}D)`);
  if (arenaTotal > 0) modeLines.push(`- Arena: ${((modes.ARENA.wins / arenaTotal) * 100).toFixed(1)}% (${modes.ARENA.wins}V/${modes.ARENA.losses}D)`);
  if (urfTotal > 0) modeLines.push(`- URF: ${((modes.URF.wins / urfTotal) * 100).toFixed(1)}% (${modes.URF.wins}V/${modes.URF.losses}D)`);

  const prompt = `
    Aja como um analista de LoL extremamente sarcástico e sem dó.
    Meu amigo ${playerName} jogou as últimas ${stats.total} partidas.

    Estatísticas gerais:
    - Vitórias: ${stats.wins}
    - Derrotas: ${stats.losses}
    - Winrate geral: ${stats.winRate}%
    - Taxa de DERROTA: ${(100 - parseFloat(stats.winRate)).toFixed(1)}%
    - Campeão mais jogado: ${stats.topChampion}

    Porcentagem de vitórias por modo de jogo:
    ${modeLines.join('\n')}

    Regras:
    - Compare o desempenho entre os modos. Se o winrate de um modo é muito melhor que outro, zoie a diferença
    - Se a taxa de derrota é maior que 50%, zoie MUITO — ele é o "elo hell" ambulante
    - Se perdeu mais no ARAM (que é o modo mais fácil), zoie ainda mais — não tem desculpa
    - Se perdeu no URF, zoie por ser overpowered e não conseguir ganhar
    - Se perdeu no Flex, zoie por ter time organizado e perder
    - Se perdeu no Arena, zoie por não conseguir nem se divertir
    - Use gírias de LoL e internet. Seja criativo e impiedoso
    - Termine com uma conclusão devastadora sobre o nível dele

    Crie um resumo curto (máximo 4-5 parágrafos) em Português para WhatsApp.
  `;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    let fallback = `${playerName} tem ${stats.winRate}% de winrate.\n`;
    fallback += `Taxa de derrota: ${(100 - parseFloat(stats.winRate)).toFixed(1)}%\n`;
    if (modeLines.length > 0) fallback += modeLines.join(' | ') + '\n';
    fallback += `O gráfico tá parecendo uma ladeira abaixo.`;
    return fallback;
  }
}
 
async function generateMultiRoast(playerDataList) {
  let context = "Os seguintes jogadores perderam partidas recentemente:\n\n";
 
  playerDataList.forEach(p => {
    let gameModeName = 'Ranked Solo/Duo';
    if (p.match.gameMode === 'ARAM') gameModeName = 'ARAM';
    else if (p.match.queueId === 440) gameModeName = 'Flex 5v5';
    else if (p.match.queueId === 1700) gameModeName = 'Arena';
    else if (p.match.queueId === 1900) gameModeName = 'URF';

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
    Abaixo estão detalhes de jogadores que perderam suas partidas (Ranked, ARAM, Flex, Arena ou URF).

    ${context}

    Crie uma única mensagem para WhatsApp consolidando a zoeira para todos esses jogadores.
    A mensagem deve ser um "boletim da vergonha".
    Regras especiais:
    - Se alguém perdeu no ARAM, zoie o dobro — não tem desculpa nenhuma pra perder no ARAM, é só apertar botão
    - Se alguém perdeu no URF, zoie ainda mais — todo mundo é overpowered menos ele
    - Se alguém perdeu no Arena, zoie por não conseguir nem se divertir vencendo
    - Se alguém perdeu no Flex, zoie por ter time organizado e ainda assim perder
    - Compare o desempenho entre eles, use gírias de LoL
    - Zoie o elo deles e como conseguiram perder nessas condições
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
