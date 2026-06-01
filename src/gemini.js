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

function isTFT(matchDetails) {
  return matchDetails.gameMode === 'TFT' || matchDetails.queueId === 1100 || matchDetails.queueId === 1101;
}

function isARAM(matchDetails) {
  return matchDetails.gameMode === 'ARAM' || matchDetails.queueId === 450;
}

async function generateRoast(playerName, matchDetails, playerRank = null) {
  let contextRank = "";
  if (playerRank) {
    const queueLabel = playerRank.queueType === 'RANKED_TFT' ? 'TFT' : 'Solo/Duo';
    contextRank = `- Elo Atual (${queueLabel}): ${playerRank.tier} ${playerRank.rank} (${playerRank.lp} LP)`;
  }

  if (isTFT(matchDetails)) {
    const placement = matchDetails.placement;
    const augmentsList = matchDetails.augments?.length > 0 ? matchDetails.augments.join(', ') : 'Nenhum';
    const traitsList = matchDetails.traits?.length > 0 ? matchDetails.traits.join(', ') : 'Nenhuma';
    const unitsList = matchDetails.units?.length > 0 ? matchDetails.units.join(', ') : 'Nenhum';

    const prompt = `
      Aja como um comentarista de TFT extremamente sarcástico e cruel.
      Meu amigo ${playerName} acabou de jogar uma partida de Teamfight Tactics e ficou em ${placement}º lugar!
      Detalhes da partida:
      - Posição final: ${placement}º lugar
      - Augments escolhidos: ${augmentsList}
      - Traits ativos: ${traitsList}
      - Units no time: ${unitsList}
      - Dano total causado: ${matchDetails.totalDamage}
      - Gold sobrando: ${matchDetails.goldLeft}
      ${contextRank}

      Zoie MUITO ele por ter ficado em ${placement}º lugar. Temas para usar:
      - Ficou em Top ${placement} = ${placement >= 7 ? 'vergonha total, não serviu pra nada' : 'ainda assim é ruim'}
      - Provavelmente forçou uma composição que não funcionou e não soube ser flexível
      - Os augments que ele escolheu devem ser uma piada, não soube buildar nada
      - Deve estar culpando o RNG (sorte) ao invés de admitir que é ruim
      - Perdeu pra gente que jogava no celular no banheiro
      - Se for 8º lugar, zoie ainda mais — é o pior resultado possível

      Crie uma mensagem curta (máximo 2-3 parágrafos) em Português para WhatsApp.
      Use gírias de TFT e internet. Seja criativo e impiedoso. Comece com algo impactante.
    `;

    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      console.error("Gemini TFT Roast Error:", error.message);
      return `🎮 TOP ${placement} (${playerName}): Ficou em ${placement}º lugar de TFT! Units: ${unitsList}. O cara é o rei do bottom 4!`;
    }
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

  // Ranked (Solo/Duo)
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
 
async function generateWinRateSummary(playerName, stats) {
  const prompt = `
    Aja como um analista de LoL sincero e sarcástico.
    Meu amigo ${playerName} jogou as últimas ${stats.total} partidas (Ranked, ARAM e TFT combinados).
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
  let context = "Os seguintes jogadores perderam partidas recentemente:\n\n";
 
  playerDataList.forEach(p => {
    let gameModeName = 'Ranked';
    if (p.match.gameMode === 'ARAM') gameModeName = 'ARAM';
    else if (p.match.gameMode === 'TFT') gameModeName = `TFT (Top ${p.match.placement || '?'})`;

    context += `- Jogador: ${p.name}\n`;
    context += `  Modo: ${gameModeName}\n`;
    context += `  Elo: ${p.rank ? `${p.rank.tier} ${p.rank.rank} (${p.rank.lp} LP)` : 'Unranked'}\n`;

    if (p.match.gameMode === 'TFT') {
      context += `  Posição: ${p.match.placement}º lugar\n`;
      context += `  Units: ${p.match.units?.join(', ') || 'N/A'}\n`;
      context += `  Augments: ${p.match.augments?.join(', ') || 'N/A'}\n`;
      context += `  Traits: ${p.match.traits?.join(', ') || 'N/A'}\n\n`;
    } else {
      context += `  Campeão: ${p.match.champion}\n`;
      context += `  KDA: ${p.match.kda}\n`;
      context += `  Oponente: ${p.match.opponentChampion}\n`;
      context += `  Dano causado: ${p.match.damage}\n\n`;
    }
  });
 
  const prompt = `
    Aja como um comentarista de eSports extremamente sarcástico, ácido e engraçado.
    Abaixo estão detalhes de jogadores que perderam suas partidas (Ranked, ARAM ou TFT).
    
    ${context}
 
    Crie uma única mensagem para WhatsApp consolidando a zoeira para todos esses jogadores. 
    A mensagem deve ser um "boletim da vergonha".
    Regras especiais:
    - Se alguém perdeu no ARAM, zoie o dobro — não tem desculpa nenhuma pra perder no ARAM, é só apertar botão
    - Se alguém ficou em Top 8 no TFT, zoie ainda mais — é o pior resultado, ficou em último
    - Se alguém ficou entre 5º e 8º no TFT, zoie por estar no "bottom 4"
    - Compare o desempenho entre eles, use gírias de LoL e TFT
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
