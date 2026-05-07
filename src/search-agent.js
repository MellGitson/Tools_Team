import 'dotenv/config';
import { runAgent } from './agent-loop.js';

// ============================================================
// OUTIL: WEB SEARCH (SearchAPI.io - DuckDuckGo Engine)
// ============================================================

const searchTool = {
  type: 'function',
  function: {
    name: 'web_search',
    description: 'Recherche des informations récentes sur le web. Utiliser pour des faits actuels, des événements récents, des prix, des données en temps réel, ou quand on n\'est pas certain d\'une information.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'La requête de recherche, en anglais pour de meilleurs résultats'
        }
      },
      required: ['query']
    }
  }
};

/**
 * Effectue une recherche web via SearchAPI.io (DuckDuckGo engine)
 * Fiable, sans blocage, avec résultats structurés
 * @param {string} query - Requête de recherche
 * @returns {Promise<Object>} Résultats formatés
 */
async function web_search({ query }) {
  try {
    const apiKey = process.env.SEARCH_API_KEY;
    
    if (!apiKey) {
      return {
        error: 'SEARCH_API_KEY not configured in .env'
      };
    }

    const params = new URLSearchParams({
      engine: 'duckduckgo',
      q: query,
      api_key: apiKey
    });

    const response = await fetch(`https://www.searchapi.io/api/v1/search?${params}`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    // 1. Priorité 1: AI Overview (réponses directes)
    if (data.ai_overview?.answer) {
      return {
        query,
        result: data.ai_overview.answer.substring(0, 500),
        source: 'SearchAPI (AI Overview)',
        url: 'N/A',
        type: 'ai_overview'
      };
    }

    // 2. Priorité 2: Knowledge Graph (résumés structurés)
    if (data.knowledge_graph) {
      const kg = data.knowledge_graph;
      let result = kg.title;
      if (kg.subtitle) result += ` - ${kg.subtitle}`;
      if (kg.description) result += `. ${kg.description.substring(0, 300)}`;

      return {
        query,
        result: result.substring(0, 500),
        source: 'SearchAPI (Knowledge Graph)',
        url: kg.website || 'N/A',
        type: 'knowledge_graph'
      };
    }

    // 3. Priorité 3: Organic Results (résultats de recherche)
    if (data.organic_results && data.organic_results.length > 0) {
      const results = data.organic_results.slice(0, 3).map(r => ({
        title: r.title,
        url: r.link,
        snippet: r.snippet
      }));

      return {
        query,
        results,
        source: 'SearchAPI (Organic Results)',
        count: results.length,
        type: 'organic'
      };
    }

    // 4. Priorité 4: Top Stories (actualités)
    if (data.top_stories && data.top_stories.length > 0) {
      const stories = data.top_stories.slice(0, 2).map(s => ({
        title: s.title,
        source: s.source,
        snippet: s.snippet
      }));

      return {
        query,
        results: stories,
        source: 'SearchAPI (Top Stories)',
        count: stories.length,
        type: 'stories'
      };
    }

    // 5. Aucun résultat
    return {
      query,
      message: `Aucun résultat trouvé pour: "${query}". Essayez une requête plus spécifique.`,
      source: 'SearchAPI',
      type: 'empty'
    };
  } catch (error) {
    return {
      error: `Erreur lors de la recherche: ${error.message}`
    };
  }
}

// ============================================================
// OUTILS EXISTANTS (Calculator + Weather)
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
          description: 'Expression mathématique à calculer (ex: "2^10" ou "15 * 24")'
        }
      },
      required: ['expression']
    }
  }
};

/**
 * Calcule une expression mathématique de manière sécurisée
 */
function calculate({ expression }) {
  try {
    // Validation basique
    const allowed = /^[0-9+\-*/().\s^]+$/;
    if (!allowed.test(expression)) {
      throw new Error('Expression invalide');
    }

    // Remplacer ^ par **
    const sanitized = expression.replace(/\^/g, '**');

    // Évaluer
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
    description: 'Récupère les données météo actuelles pour une ville. Retourne température, conditions, humidité, vent, couverture nuageuse.',
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

/**
 * Récupère la météo d'une ville via wttr.in API
 */
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

// ============================================================
// AGENT MULTI-OUTILS
// ============================================================

const tools = [calculatorTool, weatherTool, searchTool];

const toolFunctions = {
  calculate,
  get_weather,
  web_search
};

/**
 * Exécute une requête avec tous les outils disponibles
 */
async function multiToolAgent(userMessage) {
  console.log('\n🤖 AGENT MULTI-OUTILS');
  console.log('='.repeat(60));
  console.log(`📝 Message: "${userMessage}"\n`);

  try {
    const response = await runAgent(tools, toolFunctions, userMessage, 10);
    console.log(`✅ Réponse:\n${response}\n`);
    return response;
  } catch (error) {
    console.error(`❌ Erreur: ${error.message}`);
    return null;
  }
}

// ============================================================
// TESTS
// ============================================================

async function main() {
  console.log('\n🔍 TEST: WEB SEARCH + WEATHER + CALCULATOR\n');
  console.log('='.repeat(60));

  // Test 1: Question simple sur la géographie (web search)
  await multiToolAgent('Quelle est la capitale de la France ?');

  console.log('\n' + '='.repeat(60) + '\n');

  // Test 2: Question combinée (weather + calculator + web search)
  await multiToolAgent('Quelle est la météo à Paris ? Calcule 2^8 et dis-moi qui a inventé la radio.');

  console.log('\n' + '='.repeat(60) + '\n');

  // Test 3: Calcul + météo + définition
  await multiToolAgent('Quel est le résultat de (100+50)*2/3 ? Météo à Tokyo ? Qu\'est-ce que l\'intelligence artificielle ?');
}

main().catch(console.error);
