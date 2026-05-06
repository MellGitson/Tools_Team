import readline from 'node:readline';
import dotenv from 'dotenv';
import { exportStatisticsPDF } from './pdf-export.js';

dotenv.config();

// Phase 4: Configuration multi-provider
const PROVIDERS = {
  mistral: {
    url: 'https://api.mistral.ai/v1/chat/completions',
    apiKey: process.env.MISTRAL_API_KEY,
    model: 'mistral-small-latest',
    name: 'Mistral'
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    apiKey: process.env.GROQ_API_KEY,
    model: 'llama-3.3-70b-versatile',
    name: 'Groq'
  },
  huggingface: {
    url: 'https://api-inference.huggingface.co/models/meta-llama/Llama-2-7b-chat-hf/v1/chat/completions',
    apiKey: process.env.HUGGINGFACE_TOKEN,
    model: 'meta-llama/Llama-2-7b-chat-hf',
    name: 'HuggingFace'
  }
};

let currentProvider = 'mistral';

// Phase 5: Limite de messages avant compression
const MAX_HISTORY = 20;  // Nombre maximal de messages avant compression

// Métriques: Pricing par provider ($/1M tokens)
const PRICING = {
  mistral: {
    input: 0.14,    // $0.14 per 1M input tokens
    output: 0.42,   // $0.42 per 1M output tokens
    name: 'Mistral'
  },
  groq: {
    input: 0.00,    // Groq: généralement gratuit
    output: 0.00,
    name: 'Groq'
  },
  huggingface: {
    input: 0.00,    // Varie selon le modèle, usage gratuit limité
    output: 0.00,
    name: 'HuggingFace'
  }
};

// Métriques de session
let sessionMetrics = {
  totalTokens: 0,
  totalCost: 0,
  requestCount: 0
};

// Historique détaillé des requêtes (pour PDF)
let requestHistory = [];

// Heure de démarrage de la session
const sessionStartTime = Date.now();

// Historique côté client
const history = [
  {
    role: 'system',
    content: 'Tu es un assistant utile et concis. Tu te souviens de tout ce qui a été dit dans cette conversation.'
  }
];

// Phase 4: Appel avec streaming et provider configurable
async function chatStream(userMessage) {
  const provider = PROVIDERS[currentProvider];
  const startTime = Date.now();  // Mesurer la latence
  
  // Ajouter le message user à history
  history.push({
    role: 'user',
    content: userMessage
  });

  const response = await fetch(provider.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`
    },
    body: JSON.stringify({
      model: provider.model,
      messages: history,
      temperature: 0.7,
      stream: true
    })
  });

  if (!response.ok) {
    throw new Error(`${provider.name} API error: ${response.status} ${response.statusText}`);
  }

  // Lire le stream et accumuler la réponse
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullMessage = '';
  let promptTokens = 0;
  let completionTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          
          // Extraire les tokens si disponibles
          if (parsed.usage) {
            promptTokens = parsed.usage.prompt_tokens || 0;
            completionTokens = parsed.usage.completion_tokens || 0;
          }
          
          const token = parsed.choices[0].delta.content;
          if (token) {
            fullMessage += token;
            process.stdout.write(token);
          }
        } catch (e) {
          // Ignorer les erreurs de parse
        }
      }
    }
  }

  // Ajouter la réponse complète à l'historique
  history.push({
    role: 'assistant',
    content: fullMessage
  });

  // Mesurer la latence et calculer les coûts
  const endTime = Date.now();
  const duration = endTime - startTime;
  const totalTokens = promptTokens + completionTokens;
  
  // Calculer le coût basé sur les pricing
  const pricing = PRICING[currentProvider];
  const cost = (promptTokens * pricing.input / 1000000) + (completionTokens * pricing.output / 1000000);
  
  // Mettre à jour les métriques de session
  sessionMetrics.totalTokens += totalTokens;
  sessionMetrics.totalCost += cost;
  sessionMetrics.requestCount += 1;

  // Enregistrer dans l'historique des requests (pour PDF)
  requestHistory.push({
    requestNumber: sessionMetrics.requestCount,
    userMessage: userMessage,
    assistantResponse: fullMessage,
    provider: currentProvider,
    timestamp: new Date(),
    duration,
    promptTokens,
    completionTokens,
    totalTokens,
    cost
  });

  // Afficher les métriques
  printMetrics({ duration, promptTokens, completionTokens, totalTokens, cost });

  // Phase 5: Compresser l'historique si trop long
  await compressHistory();

  return fullMessage;
}

// Afficher l'historique compressé
function printHistory() {
  console.log('\n📋 Historique:');
  history.forEach((msg, idx) => {
    const preview = msg.content.substring(0, 80).replace(/\n/g, ' ');
    console.log(`  [${idx}] ${msg.role}: ${preview}${msg.content.length > 80 ? '...' : ''}`);
  });
  console.log();
}

// Afficher les métriques de session
function printMetrics(requestMetrics) {
  const { duration, promptTokens, completionTokens, totalTokens, cost } = requestMetrics;
  
  console.log(`\n📊 Métriques:`);
  console.log(`  ⏱️  Latence: ${duration.toFixed(2)}ms`);
  console.log(`  🔤 Tokens: ${promptTokens} (input) + ${completionTokens} (output) = ${totalTokens} (total)`);
  console.log(`  💰 Coût: $${cost.toFixed(6)} (session total: $${sessionMetrics.totalCost.toFixed(6)})`);
}

// Phase 6: Résumer la conversation (commande /resume)
async function resume() {
  if (history.length <= 1) {
    console.log('\n📌 Aucune conversation à résumer.\n');
    return;
  }

  const conversationText = history
    .slice(1)  // Ignorer le system prompt
    .map(m => `${m.role}: ${m.content}`)
    .join('\n\n');

  const provider = PROVIDERS[currentProvider];
  const summaryPrompt = `Résume cette conversation en 5 bullet points maximum. Sois concis et pour chaque point commence par un verbe:\n\n${conversationText}`;

  try {
    console.log('\n⏳ Génération du résumé...');
    const response = await fetch(provider.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: 'user', content: summaryPrompt }
        ],
        temperature: 0.3,
        stream: false
      })
    });

    if (response.ok) {
      const data = await response.json();
      const summary = data.choices[0].message.content;
      console.log('\n📋 Résumé de la conversation:');
      console.log(summary);
      console.log();
    } else {
      console.log(`❌ Erreur: ${response.status}\n`);
    }
  } catch (e) {
    console.error(`❌ Erreur résumé: ${e.message}\n`);
  }
}

// Phase 7: Traduire la dernière réponse (commande /translate)
async function translate(language) {
  // Trouver le dernier message assistant
  const lastAssistantMsg = [...history].reverse().find(m => m.role === 'assistant');
  
  if (!lastAssistantMsg) {
    console.log('\n📌 Aucune réponse de l\'assistant à traduire.\n');
    return;
  }

  const provider = PROVIDERS[currentProvider];
  const translatePrompt = `Traduis exactement ce texte en ${language}. Préserve tous les formats (markdown, code, etc.). Aucune explication, seulement la traduction:\n\n${lastAssistantMsg.content}`;

  try {
    console.log('\n⏳ Traduction en cours...');
    const response = await fetch(provider.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: 'user', content: translatePrompt }
        ],
        temperature: 0.1,  // Très bas pour fidélité
        stream: false
      })
    });

    if (response.ok) {
      const data = await response.json();
      const translation = data.choices[0].message.content;
      console.log(`\n🌐 Traduction en ${language}:`);
      console.log(translation);
      console.log();
    } else {
      console.log(`❌ Erreur: ${response.status}\n`);
    }
  } catch (e) {
    console.error(`❌ Erreur traduction: ${e.message}\n`);
  }
}

// Phase 4: Changer le provider actif
function switchProvider(name) {
  const providerName = name.toLowerCase();
  
  if (!PROVIDERS[providerName]) {
    const available = Object.keys(PROVIDERS).join(', ');
    console.log(`❌ Provider '${providerName}' introuvable. Disponibles: ${available}\n`);
    return false;
  }

  if (!PROVIDERS[providerName].apiKey) {
    console.log(`❌ Clé API manquante pour ${PROVIDERS[providerName].name}\n`);
    return false;
  }

  currentProvider = providerName;
  console.log(`✅ Switched to ${PROVIDERS[providerName].name}\n`);
  return true;
}

// Phase 5: Compression automatique du contexte
async function compressHistory() {
  // Si historique trop long, résumer les anciens messages
  if (history.length <= MAX_HISTORY) {
    return;  // Rien à faire
  }

  console.log(`\n⚠️ Contexte compressé (${history.length} → ${MAX_HISTORY} messages)...`);

  // Garder le system prompt [0]
  // Résumer les messages [1] à [history.length - 10]
  // Garder les 10 derniers messages pour contexte frais
  const keepLast = 10;
  const endCompress = history.length - keepLast;
  const messagesToCompress = history.slice(1, endCompress);

  // Créer un résumé des messages compressés
  const conversationText = messagesToCompress
    .map(m => `${m.role}: ${m.content}`)
    .join('\n\n');

  const provider = PROVIDERS[currentProvider];
  const summaryPrompt = `Résume en 2-3 phrases clés les points importants de cette conversation. Sois concis:\n\n${conversationText}`;

  try {
    const response = await fetch(provider.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: 'user', content: summaryPrompt }
        ],
        temperature: 0.3,  // Bas pour un résumé déterministe
        stream: false
      })
    });

    if (response.ok) {
      const data = await response.json();
      const summary = data.choices[0].message.content;

      // Remplacer l'historique compressé par le résumé
      history.splice(1, messagesToCompress.length, {
        role: 'assistant',
        content: `[Contexte résumé] ${summary}`
      });
    }
  } catch (e) {
    console.error(`⚠️ Erreur compression: ${e.message}`);
  }
}

function question(prompt) {
  return new Promise(resolve => {
    rl.question(prompt, resolve);
  });
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main() {
  console.log('Chatbot CLI - Phase 7 (/translate command). (Ctrl+C pour quitter)\n');
  console.log('Commandes spéciales:');
  console.log('  /history            - Afficher l\'historique');
  console.log('  /resume             - Résumer la conversation');
  console.log('  /translate LANG     - Traduire la dernière réponse (ex: /translate english)');
  console.log('  /metrics            - Afficher les métriques de session');
  console.log('  /export             - Exporter les statistiques en PDF');
  console.log('  /provider           - Afficher le provider actuel');
  console.log('  /provider NAME      - Changer de provider (mistral, groq, huggingface)\n');
  console.log(`Note: Compression auto quand historique > ${MAX_HISTORY} messages\n`);

  while (true) {
    const input = await question('Vous : ');
    
    if (!input.trim()) {
      continue;
    }

    // Commande /history
    if (input.trim() === '/history') {
      printHistory();
      continue;
    }

    // Commande /metrics
    if (input.trim() === '/metrics') {
      console.log('\n📊 Métriques de session:');
      console.log(`  Requêtes: ${sessionMetrics.requestCount}`);
      console.log(`  Tokens totaux: ${sessionMetrics.totalTokens}`);
      console.log(`  Coût total: $${sessionMetrics.totalCost.toFixed(6)}\n`);
      continue;
    }

    // Phase 6: Commande /resume
    if (input.trim() === '/resume') {
      await resume();
      continue;
    }

    // Phase 7: Commande /translate
    if (input.trim().startsWith('/translate ')) {
      const language = input.trim().slice(11).trim();
      await translate(language);
      continue;
    }

    // Phase 9: Commande /export - Exporter les statistiques en PDF
    if (input.trim() === '/export') {
      try {
        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `chatbot-stats-${timestamp}.pdf`;
        
        console.log('\n📄 Génération du rapport PDF...');
        
        // Créer l'objet statistiques
        const avgTokensPerRequest = sessionMetrics.requestCount > 0 
          ? Math.round(sessionMetrics.totalTokens / sessionMetrics.requestCount)
          : 0;
        
        const avgCostPerRequest = sessionMetrics.requestCount > 0
          ? sessionMetrics.totalCost / sessionMetrics.requestCount
          : 0;

        const totalDuration = requestHistory
          .reduce((sum, req) => sum + req.duration, 0);
        
        const avgDuration = sessionMetrics.requestCount > 0 
          ? Math.round(totalDuration / sessionMetrics.requestCount)
          : 0;

        const stats = {
          sessionStart: sessionStartTime,
          sessionDuration: Date.now() - sessionStartTime,
          totalRequests: sessionMetrics.requestCount,
          totalTokens: sessionMetrics.totalTokens,
          totalCost: sessionMetrics.totalCost,
          avgTokensPerRequest,
          avgCostPerRequest,
          avgDuration,
          totalDuration,
          requestHistory: requestHistory,
          currentProvider
        };

        // Exporter le PDF
        await exportStatisticsPDF(stats, filename);
        
        console.log(`✅ Rapport généré: ${filename}\n`);
      } catch (error) {
        console.error(`❌ Erreur lors de l'export: ${error.message}\n`);
      }
      continue;
    }

    // Commande /provider
    if (input.trim() === '/provider') {
      console.log(`\n📌 Provider actuel: ${PROVIDERS[currentProvider].name}\n`);
      continue;
    }

    // Phase 4: Changer le provider
    if (input.trim().startsWith('/provider ')) {
      const providerName = input.trim().slice(9).trim();
      switchProvider(providerName);
      continue;
    }

    try {
      await chatStream(input);
      console.log('\n');
    } catch (error) {
      console.error(`Erreur : ${error.message}\n`);
    }
  }
}

main().catch(console.error);
