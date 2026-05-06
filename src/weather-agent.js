import 'dotenv/config';
import { runAgent } from './agent-loop.js';

// --- Outil météo ---
const weatherTool = {
  type: 'function',
  function: {
    name: 'get_weather',
    description: 'Récupère la météo actuelle pour une ville donnée. Utiliser quand on parle de météo, température, conditions climatiques.',
    parameters: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: "Le nom de la ville, en anglais de préférence (ex: 'Paris', 'London', 'Tokyo')"
        }
      },
      required: ['city']
    }
  }
};

// --- Implémentation de l'outil météo ---
/**
 * Récupère la météo actuelle pour une ville
 * Utilise l'API wttr.in (public, pas de clé requise)
 * @param {Object} params
 * @param {string} params.city - Nom de la ville
 * @returns {Promise<Object>} Données météo
 */
async function get_weather({ city }) {
  try {
    // wttr.in : API météo publique, format JSON, aucune clé requise
    const response = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);

    if (!response.ok) {
      return { error: `Impossible de récupérer la météo pour ${city}` };
    }

    const data = await response.json();

    // Vérifier que les données sont valides
    if (!data.current_condition || !data.current_condition[0]) {
      return { error: `Données météo invalides pour ${city}` };
    }

    const current = data.current_condition[0];

    return {
      city,
      temperature_c: current.temp_C,
      feels_like_c: current.FeelsLikeC,
      description: current.weatherDesc[0]?.value || 'Unknown',
      humidity: current.humidity + '%',
      wind_kmph: current.windspeedKmph,
      cloudcover: current.cloudcover + '%'
    };
  } catch (error) {
    return { error: `Erreur lors de la récupération de la météo: ${error.message}` };
  }
}

// --- Configuration des outils ---
const tools = [weatherTool];

const toolFunctions = {
  get_weather
};

// --- Fonction principale ---
async function main() {
  try {
    console.log('\n' + '='.repeat(60));
    console.log('TEST 1: Météo pour deux villes');
    console.log('='.repeat(60) + '\n');

    await runAgent(
      tools,
      toolFunctions,
      'Quelle est la météo à Paris et à Tokyo en ce moment ?'
    );

    console.log('\n' + '='.repeat(60));
    console.log('TEST 2: Météo avec question contextualisée');
    console.log('='.repeat(60) + '\n');

    await runAgent(
      tools,
      toolFunctions,
      'Il fait combien à Lyon ? Est-ce qu\'il faut un manteau ?'
    );

    console.log('\n' + '='.repeat(60));
    console.log('TEST 3: Météo pour trois villes');
    console.log('='.repeat(60) + '\n');

    await runAgent(
      tools,
      toolFunctions,
      'Compare la météo entre New York, Londres et Singapour'
    );
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

// Exécuter si c'est le fichier principal
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

// Export pour utilisation en tant que module
export { get_weather, weatherTool, tools, toolFunctions };
