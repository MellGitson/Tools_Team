import 'dotenv/config';
import { runAgent } from './agent-loop.js';

// ============================================================
// OUTIL: WEB SEARCH (DuckDuckGo API)
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
 * Effectue une recherche web via DuckDuckGo API
 * @param {string} query - Requête de recherche
 * @returns {Promise<Object>} Résultats formatés
 */
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

    // 1. Vérifier d'abord AbstractText (résumé Wikipedia ou similaire)
    if (data.AbstractText && data.AbstractText.trim().length > 10) {
      return {
        query,
        result: data.AbstractText.substring(0, 500),
        source: data.AbstractSource || 'DuckDuckGo',
        url: data.AbstractURL || 'N/A'
      };
    }

    // 2. Essayer les résultats connexes (Topics)
    if (data.RelatedTopics && Array.isArray(data.RelatedTopics) && data.RelatedTopics.length > 0) {
      const results = [];
      
      for (const topic of data.RelatedTopics) {
        // Ignorer les groupes de sujets
        if (topic.Topics) continue;
        
        if (topic.Text && topic.Text.trim().length > 0) {
          results.push({
            text: topic.Text,
            url: topic.FirstURL || 'N/A'
          });
        }
        
        if (results.length >= 3) break;
      }

      if (results.length > 0) {
        return {
          query,
          results,
          source: 'DuckDuckGo Topics',
          count: results.length
        };
      }
    }

    // 3. Vérifier Definition (pour les définitions)
    if (data.Definition && data.Definition.trim().length > 0) {
      return {
        query,
        result: data.Definition,
        source: 'DuckDuckGo Definition',
        url: data.DefinitionURL || 'N/A'
      };
    }

    // 4. Aucun résultat
    return {
      query,
      message: `Aucun résultat trouvé pour: "${query}". Essayez une requête plus spécifique.`,
      source: 'DuckDuckGo'
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
