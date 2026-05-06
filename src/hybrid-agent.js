import dotenv from 'dotenv';
import { rag_search, ragToolDefinition } from './rag-search-tool.js';

dotenv.config();

/**
 * PHASE 9: Agent hybride avec 4 outils
 * - calculate: Calculs mathématiques
 * - get_weather: Météo en temps réel
 * - web_search: Recherche web (DuckDuckGo)
 * - rag_search: Recherche corpus privé (Pinecone)
 */

// ============================================================
// OUTIL 1: CALCULATE
// ============================================================

const calculateTool = {
  type: 'function',
  function: {
    name: 'calculate',
    description:
      'Évalue une expression mathématique. Supporter les opérations: +, -, *, /, %, Math.pow, Math.sqrt, Math.sin, Math.cos, Math.tan, Math.log, Math.abs, Math.PI, etc.',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description:
            'Expression mathématique à évaluer (ex: "2 + 2", "Math.sqrt(16)", "Math.pow(2,8)")',
        },
      },
      required: ['expression'],
    },
  },
};

async function calculate({ expression }) {
  try {
    // Sécurité: vérifier que seules les opérations mathématiques sont présentes
    const validPattern = /^[0-9+\-*/%().,\s]+$|Math\.(pow|sqrt|sin|cos|tan|log|abs|PI|E|ceil|floor|round)/g;
    if (!validPattern.test(expression.replace(/Math\.[a-zA-Z]+/g, ''))) {
      return { error: 'Expression contient des caractères non autorisés', expression };
    }

    // Créer un contexte sûr pour eval
    const context = {
      Math,
      result: null,
    };

    // Évaluer l'expression dans le contexte
    // eslint-disable-next-line no-eval
    const result = Function('"use strict"; return (' + expression + ')')();

    return {
      expression,
      result: result,
      type: typeof result,
      status: 'success',
    };
  } catch (error) {
    return {
      error: `Erreur de calcul: ${error.message}`,
      expression,
      status: 'error',
    };
  }
}

// ============================================================
// OUTIL 2: GET_WEATHER
// ============================================================

const getWeatherTool = {
  type: 'function',
  function: {
    name: 'get_weather',
    description:
      'Récupère la météo actuelle et prévisions pour une ville spécifique via wttr.in (service en temps réel).',
    parameters: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: 'Nom de la ville (ex: "Paris", "Lyon", "Marseille")',
        },
        days: {
          type: 'number',
          description: 'Nombre de jours de prévision (1-3, défaut: 1)',
        },
      },
      required: ['city'],
    },
  },
};

async function get_weather({ city, days = 1 }) {
  try {
    const response = await fetch(
      `https://wttr.in/${city}?format=j1&lang=fr`,
      {
        headers: {
          'User-Agent': 'Tools_ia-hybrid-agent',
        },
      }
    );

    if (!response.ok) {
      return {
        error: `Ville non trouvée: ${city}`,
        status: response.status,
      };
    }

    const data = await response.json();
    const current = data.current_condition[0];
    const forecast = data.weather.slice(0, days);

    const result = {
      city,
      current: {
        temperature: `${current.temp_C}°C`,
        description: current.weatherDesc[0].value,
        humidity: `${current.humidity}%`,
        wind: `${current.windspeedKmph} km/h`,
        updated_at: new Date().toLocaleString('fr-FR'),
      },
      forecast: forecast.map((day) => ({
        date: day.date,
        max_temp: `${day.maxtempC}°C`,
        min_temp: `${day.mintempC}°C`,
        description: day.weatherDesc[0].value,
      })),
      status: 'success',
    };

    return result;
  } catch (error) {
    return {
      error: `Erreur météo: ${error.message}`,
      city,
      status: 'error',
    };
  }
}

// ============================================================
// OUTIL 3: WEB_SEARCH
// ============================================================

const webSearchTool = {
  type: 'function',
  function: {
    name: 'web_search',
    description:
      'Recherche des informations récentes sur le web via DuckDuckGo. Utiliser pour des questions d\'actualité, d\'événements récents, ou d\'informations générales.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Requête de recherche',
        },
        max_results: {
          type: 'number',
          description: 'Nombre de résultats (défaut: 3)',
        },
      },
      required: ['query'],
    },
  },
};

async function web_search({ query, max_results = 3 }) {
  try {
    // Utiliser l'API DuckDuckGo
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&pretty=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Tools_ia-hybrid-agent',
      },
    });

    if (!response.ok) {
      return {
        error: `Erreur DuckDuckGo: ${response.status}`,
        query,
      };
    }

    const data = await response.json();

    // Extraire les résultats
    const results = [];

    // Abstract Results
    if (data.AbstractText) {
      results.push({
        type: 'abstract',
        title: data.Heading || 'Résumé',
        content: data.AbstractText,
        url: data.AbstractURL,
      });
    }

    // Related Topics
    if (data.RelatedTopics && data.RelatedTopics.length > 0) {
      data.RelatedTopics.slice(0, max_results - results.length).forEach((topic) => {
        if (topic.Text) {
          results.push({
            type: 'related',
            title: topic.Text.split(' - ')[0],
            content: topic.Text,
            url: topic.FirstURL,
          });
        }
      });
    }

    return {
      query,
      results: results.slice(0, max_results),
      status: 'success',
      source: 'DuckDuckGo',
    };
  } catch (error) {
    return {
      error: `Erreur web_search: ${error.message}`,
      query,
      status: 'error',
    };
  }
}

// ============================================================
// AGENT HYBRIDE J3
// ============================================================

/**
 * Exécute l'agent hybride avec les 4 outils
 * @param {string} question - Question utilisateur
 * @returns {Promise<Object>} - Réponse du modèle avec tools appelés
 */
async function runHybridAgent(question) {
  const apiKey = process.env.MISTRAL_API_KEY;

  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY non configuré');
  }

  try {
    console.log('\n🤖 PHASE 9: Agent Hybride J3');
    console.log('='.repeat(80));
    console.log(`\n❓ Question: ${question}\n`);

    // Définir les outils disponibles
    const tools = [calculateTool, getWeatherTool, webSearchTool, ragToolDefinition];

    // Première requête au modèle pour voir quels outils il veut appeler
    console.log('⏳ Étape 1: Envoi de la question au LLM...');
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages: [
          {
            role: 'user',
            content: question,
          },
        ],
        tools: tools,
        tool_choice: 'auto',
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Erreur Mistral ${response.status}: ${error}`);
    }

    const data = await response.json();
    const assistantMessage = data.choices[0]?.message;

    // Afficher ce que le modèle veut faire
    console.log('✅ Réponse du modèle reçue\n');

    // Collectionner les appels d'outils
    const toolCalls = [];
    const toolResults = [];

    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      console.log('🔧 Outils à appeler:');
      console.log('─'.repeat(80));

      // Traiter chaque appel d'outil
      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);

        console.log(`\n📌 ${toolName}:`);
        console.log(`   Arguments: ${JSON.stringify(toolArgs)}`);

        toolCalls.push({
          name: toolName,
          args: toolArgs,
        });

        // Exécuter l'outil
        let toolResult;
        try {
          if (toolName === 'calculate') {
            toolResult = await calculate(toolArgs);
          } else if (toolName === 'get_weather') {
            toolResult = await get_weather(toolArgs);
          } else if (toolName === 'web_search') {
            toolResult = await web_search(toolArgs);
          } else if (toolName === 'rag_search') {
            toolResult = await rag_search(toolArgs.query);
          } else {
            toolResult = { error: `Outil inconnu: ${toolName}` };
          }
        } catch (error) {
          toolResult = { error: error.message };
        }

        console.log(`   ✅ Résultat: ${JSON.stringify(toolResult).substring(0, 200)}...`);

        toolResults.push({
          tool_call_id: toolCall.id,
          name: toolName,
          result: toolResult,
        });
      }

      console.log('\n');

      // Deuxième appel au modèle avec les résultats des outils
      console.log('⏳ Étape 2: Envoi des résultats au LLM pour formulation finale...');

      const messages = [
        {
          role: 'user',
          content: question,
        },
        {
          role: 'assistant',
          content: assistantMessage.content || '',
          tool_calls: assistantMessage.tool_calls,
        },
      ];

      // Ajouter les résultats des outils
      for (const toolResult of toolResults) {
        messages.push({
          role: 'tool',
          tool_call_id: toolResult.tool_call_id,
          name: toolResult.name,
          content: JSON.stringify(toolResult.result),
        });
      }

      const finalResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'mistral-small-latest',
          messages: messages,
          temperature: 0.3,
        }),
      });

      if (!finalResponse.ok) {
        const error = await finalResponse.text();
        throw new Error(`Erreur Mistral (réponse finale) ${finalResponse.status}: ${error}`);
      }

      const finalData = await finalResponse.json();
      const finalText = finalData.choices[0]?.message?.content || 'Pas de réponse';

      console.log('✅ Réponse finale générée\n');
      console.log('💬 RÉPONSE FINALE:');
      console.log('─'.repeat(80));
      console.log(finalText);
      console.log('');

      return {
        question,
        tools_called: toolCalls,
        response: finalText,
        status: 'success',
      };
    } else {
      // Le modèle n'a pas appelé d'outil, il répond directement
      console.log('💬 Réponse directe du modèle (aucun outil nécessaire):');
      console.log('─'.repeat(80));
      console.log(assistantMessage.content);
      console.log('');

      return {
        question,
        tools_called: [],
        response: assistantMessage.content,
        status: 'direct_response',
      };
    }
  } catch (error) {
    throw new Error(`Erreur agent hybride: ${error.message}`);
  }
}

/**
 * Test complet Phase 9
 */
async function testPhase9() {
  console.log('\n🔥 PHASE 9: Agent Hybride - Jonction des deux tracks');
  console.log('='.repeat(80));

  const testQuestions = [
    'Qu\'est-ce que l\'intelligence artificielle?', // → rag_search
    'Quel temps fait-il à Lyon?', // → get_weather
    'Combien font 2^8?', // → calculate
    'Qui a gagné la Coupe du Monde 2022?', // → web_search
    'Une question qui n\'est nulle part', // → web_search ou direct
  ];

  for (const question of testQuestions) {
    try {
      await runHybridAgent(question);
      console.log('\n' + '='.repeat(80) + '\n');
    } catch (error) {
      console.error(`❌ Erreur pour "${question}": ${error.message}\n`);
    }
  }
}

export { runHybridAgent, calculate, get_weather, web_search, testPhase9 };

// Exécuter si c'est le fichier principal
if (import.meta.url === `file://${process.argv[1]}`) {
  testPhase9().catch((error) => {
    console.error('❌ Erreur Phase 9:', error.message);
    process.exit(1);
  });
}
