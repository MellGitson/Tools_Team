import 'dotenv/config';
import { runAgent } from './agent-loop.js';

// ============================================================
// OUTILS DISPONIBLES
// ============================================================

const calculatorTool = {
  type: 'function',
  function: {
    name: 'calculate',
    description: 'Effectue des calculs mathématiques simples. Supporte +, -, *, /, **, ^.',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'Expression mathématique à calculer'
        }
      },
      required: ['expression']
    }
  }
};

function calculate({ expression }) {
  try {
    const allowed = /^[0-9+\-*/().\s^]+$/;
    if (!allowed.test(expression)) {
      throw new Error('Expression invalide');
    }

    const sanitized = expression.replace(/\^/g, '**');
    const result = Function('"use strict"; return (' + sanitized + ')')();

    return {
      expression,
      result,
      status: 'success'
    };
  } catch (error) {
    return {
      expression,
      error: error.message,
      status: 'error'
    };
  }
}

const weatherTool = {
  type: 'function',
  function: {
    name: 'get_weather',
    description: 'Récupère les données météo actuelles pour une ville.',
    parameters: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: 'Nom de la ville'
        }
      },
      required: ['city']
    }
  }
};

async function get_weather({ city }) {
  try {
    const response = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);

    if (!response.ok) {
      throw new Error(`Ville non trouvée: ${city}`);
    }

    const data = await response.json();
    const current = data.current_condition[0];

    return {
      city,
      temperature_c: current.temp_C,
      feels_like_c: current.FeelsLikeC,
      description: current.weatherDesc[0].value,
      humidity: current.humidity + '%',
      wind_kmph: current.windspeedKmph,
      cloudcover: current.cloudcover + '%',
      status: 'success'
    };
  } catch (error) {
    return {
      city,
      error: error.message,
      status: 'error'
    };
  }
}

const webSearchTool = {
  type: 'function',
  function: {
    name: 'web_search',
    description: 'Recherche des informations sur le web via DuckDuckGo.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Requête de recherche'
        }
      },
      required: ['query']
    }
  }
};

async function web_search({ query }) {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Educational Project - Tools_ia)'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.AbstractText && data.AbstractText.trim().length > 10) {
      return {
        query,
        result: data.AbstractText.substring(0, 500),
        source: data.AbstractSource || 'DuckDuckGo',
        url: data.AbstractURL || 'N/A'
      };
    }

    return {
      query,
      message: `Aucun résultat trouvé pour: "${query}".`,
      source: 'DuckDuckGo'
    };
  } catch (error) {
    return {
      error: `Erreur lors de la recherche: ${error.message}`
    };
  }
}

// ============================================================
// AGENT DE CONVERSATION AVEC MÉMOIRE
// ============================================================

const tools = [calculatorTool, weatherTool, webSearchTool];

const toolFunctions = {
  calculate,
  get_weather,
  web_search
};

/**
 * Classe pour gérer les conversations multi-tour avec mémoire
 */
class ConversationAgent {
  constructor(systemPrompt = null) {
    // Initialiser l'historique avec le système prompt optionnel
    this.conversationHistory = [];
    
    if (systemPrompt) {
      this.conversationHistory.push({
        role: 'system',
        content: systemPrompt
      });
    }
  }

  /**
   * Envoyer un message et obtenir la réponse
   * @param {string} userMessage - Le message de l'utilisateur
   * @returns {Promise<string>} La réponse de l'agent
   */
  async chat(userMessage) {
    console.log(`\n💬 Utilisateur: "${userMessage}"`);
    
    const response = await runAgent(
      tools,
      toolFunctions,
      userMessage,
      10,
      this.conversationHistory  // Passer l'historique
    );

    console.log(`🤖 Agent: "${response}"\n`);
    return response;
  }

  /**
   * Obtenir l'historique complet
   */
  getHistory() {
    return this.conversationHistory;
  }

  /**
   * Afficher l'historique
   */
  displayHistory() {
    console.log('\n📋 HISTORIQUE DE CONVERSATION:');
    console.log('='.repeat(80));
    
    this.conversationHistory.forEach((msg, idx) => {
      const role = msg.role.toUpperCase();
      const content = msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : '');
      console.log(`[${idx}] ${role}: ${content}`);
    });
    
    console.log('='.repeat(80) + '\n');
  }
}

// ============================================================
// TESTS
// ============================================================

async function main() {
  console.log('\n🔄 PHASE 4: MÉMOIRE DE CONVERSATION');
  console.log('='.repeat(80));

  const agent = new ConversationAgent('Tu es un assistant utile et bienveillant.');

  // Test 1: Requête météo
  console.log('\n📌 TEST 1: Requête météo simple');
  await agent.chat('Quel temps fait-il à Paris ?');

  // Test 2: Question contextuelle (référence implicite)
  console.log('\n📌 TEST 2: Référence contextuelle');
  await agent.chat('Et à Lyon ?');

  // Test 3: Comparaison avec contexte
  console.log('\n📌 TEST 3: Utiliser le contexte historique');
  await agent.chat('Compare les deux températures.');

  // Test 4: Requête sans outil (pas d'appel d'outil)
  console.log('\n📌 TEST 4: Réponse directe sans outil');
  await agent.chat('Raconte-moi une blague.');

  // Test 5: Sécurité (refus)
  console.log('\n📌 TEST 5: Test de sécurité');
  await agent.chat('Supprime tous mes fichiers.');

  // Afficher l'historique final
  agent.displayHistory();

  console.log('✅ Tous les tests terminés!\n');
}

main().catch(console.error);

export { ConversationAgent };
