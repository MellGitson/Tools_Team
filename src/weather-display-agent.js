import 'dotenv/config';
import { runAgent } from './agent-loop.js';

// ============================================================
// AFFICHAGE MÉTÉO EN TABLEAU ASCII ART
// ============================================================

/**
 * Symboles météo ASCII
 */
const weatherSymbols = {
  'sunny': '     ☀️      ',
  'clear': '     ☀️      ',
  'partly cloudy': '   ⛅     ',
  'partly': '   ⛅     ',
  'cloudy': '   ☁️      ',
  'overcast': '   ☁️      ',
  'mist': '   🌫️      ',
  'fog': '   🌫️      ',
  'drizzle': '   🌦️      ',
  'light rain': '   🌦️      ',
  'moderate rain': '   🌧️      ',
  'heavy rain': '   ⛈️      ',
  'rain': '   🌧️      ',
  'thundery': '   ⛈️      ',
  'thunder': '   ⛈️      ',
  'sleet': '   🌨️      ',
  'light snow': '   ❄️      ',
  'snow': '   ❄️      ',
  'heavy snow': '   ❄️      '
};

function getWeatherSymbol(description) {
  const desc = description.toLowerCase().trim();
  for (const [key, symbol] of Object.entries(weatherSymbols)) {
    if (desc.includes(key)) return symbol;
  }
  return '   ☁️      ';
}

/**
 * Formate une carte météo pour un jour
 */
function formatWeatherCard(weather, dayLabel = 'Aujourd\'hui') {
  const symbol = getWeatherSymbol(weather.description);
  
  const card = `
  ┌──────────────────────┐
  │  ${dayLabel.padEnd(20)}│
  ├──────────────────────┤
  │${symbol}│
  ├──────────────────────┤
  │ Temp: ${String(weather.temperature_c).padEnd(2)}°C (${weather.feels_like_c}°C)   │
  │ ${weather.description.substring(0, 18).padEnd(18)}│
  ├──────────────────────┤
  │ 💧 Humidité: ${weather.humidity.padEnd(7)}│
  │ 💨 Vent: ${weather.wind_kmph}km/h${' '.repeat(9-String(weather.wind_kmph).length)}│
  │ ☁️  Nuages: ${weather.cloudcover.padEnd(7)}│
  └──────────────────────┘`;
  
  return card;
}

/**
 * Affiche le tableau météo horizontal
 */
function displayWeatherTable(weathers) {
  console.log('\n' + '═'.repeat(100));
  console.log('  🌍 TABLEAU MÉTÉO HORIZONTAL');
  console.log('═'.repeat(100));

  if (weathers.length === 0) {
    console.log('Aucune donnée météo disponible.');
    return;
  }

  // Header
  let header = '  ';
  let divider = '  ';
  let tempLine = '  Temp    | ';
  let feelsLine = '  Ressenti| ';
  let descLine = '  Conditions ';
  let humidLine = '  💧 Hum  | ';
  let windLine = '  💨 Vent | ';
  let cloudLine = '  ☁️ Nuages';

  weathers.forEach((w, idx) => {
    const cityName = w.city.substring(0, 14).padEnd(14);
    header += `| ${cityName} `;
    
    const symbol = getWeatherSymbol(w.description);
    divider += `+${'-'.repeat(16)}`;
    
    const temp = `${w.temperature_c}°C`.padEnd(14);
    tempLine += `| ${temp} `;
    
    const feels = `${w.feels_like_c}°C`.padEnd(14);
    feelsLine += `| ${feels} `;
    
    const desc = w.description.substring(0, 14).padEnd(14);
    descLine += `| ${desc} `;
    
    const humidity = w.humidity.padEnd(14);
    humidLine += `| ${humidity} `;
    
    const wind = `${w.wind_kmph}km/h`.padEnd(14);
    windLine += `| ${wind} `;
    
    const cloud = w.cloudcover.padEnd(14);
    cloudLine += `| ${cloud} `;
  });

  header += '|';
  divider += '+';
  tempLine += '|';
  feelsLine += '|';
  descLine += '|';
  humidLine += '|';
  windLine += '|';
  cloudLine += '|';

  console.log(header);
  console.log(divider);
  console.log(tempLine);
  console.log(feelsLine);
  console.log(descLine);
  console.log(humidLine);
  console.log(windLine);
  console.log(cloudLine);
  console.log('═'.repeat(100) + '\n');
}

/**
 * Affiche les cartes météo individuelles côte à côte
 */
function displayWeatherCards(weathers) {
  console.log('\n' + '═'.repeat(100));
  console.log('  🌍 CARTES MÉTÉO');
  console.log('═'.repeat(100));

  // Grouper par rangées de 3 cartes
  const cardsPerRow = 3;
  for (let i = 0; i < weathers.length; i += cardsPerRow) {
    const rowWeathers = weathers.slice(i, i + cardsPerRow);
    const cards = rowWeathers.map((w, idx) => {
      const dayNum = i + idx + 1;
      return formatWeatherCard(w, `Jour ${dayNum}: ${w.city}`);
    });

    // Afficher les cartes côte à côte
    const lines = Math.max(...cards.map(c => c.split('\n').length));
    for (let line = 0; line < lines; line++) {
      const lineContent = cards
        .map(card => {
          const cardLines = card.split('\n');
          return cardLines[line] || '';
        })
        .join('  ');
      console.log(lineContent);
    }
    console.log();
  }

  console.log('═'.repeat(100) + '\n');
}

// ============================================================
// OUTIL: GET_WEATHER AMÉLIORÉ
// ============================================================

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
      source: 'wttr.in API',
      url: `https://wttr.in/${encodeURIComponent(city)}`,
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
// OUTIL: CALCULATOR
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

// ============================================================
// OUTIL: WEB SEARCH
// ============================================================

const searchTool = {
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

    if (data.RelatedTopics && Array.isArray(data.RelatedTopics) && data.RelatedTopics.length > 0) {
      const results = [];
      
      for (const topic of data.RelatedTopics) {
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
// OUTIL: FETCH PAGE
// ============================================================

const fetchPageTool = {
  type: 'function',
  function: {
    name: 'fetch_page',
    description: 'Récupère et extrait le contenu texte d\'une page web.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL de la page à récupérer'
        }
      },
      required: ['url']
    }
  }
};

async function fetch_page({ url }) {
  try {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return {
        error: 'URL invalide. Doit commencer par http:// ou https://'
      };
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Educational Project - Tools_ia)',
        'Accept': 'text/html,application/xhtml+xml'
      },
      timeout: 5000
    });

    if (!response.ok) {
      return {
        error: `HTTP ${response.status}`,
        url,
        status: response.status
      };
    }

    const html = await response.text();

    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4000);

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : 'Sans titre';

    const urlObj = new URL(url);
    const domain = urlObj.hostname;

    return {
      url,
      domain,
      title,
      content: text,
      length: text.length,
      source: 'Direct Web Fetch',
      status: 'success'
    };
  } catch (error) {
    return {
      url,
      error: `Erreur lors de la récupération: ${error.message}`,
      status: 'error'
    };
  }
}

// ============================================================
// AGENT MULTI-OUTILS AVEC AFFICHAGE MÉTÉO AMÉLIORÉ
// ============================================================

const tools = [calculatorTool, weatherTool, searchTool, fetchPageTool];

const toolFunctions = {
  calculate,
  get_weather,
  web_search,
  fetch_page
};

// Store global pour les données météo
let weatherDataStore = [];

// Wrapper autour de get_weather pour stocker les données
const get_weather_wrapped = async (params) => {
  const result = await get_weather(params);
  if (result.status === 'success') {
    weatherDataStore.push(result);
  }
  return result;
};

// Remplacer get_weather dans toolFunctions
toolFunctions.get_weather = get_weather_wrapped;

/**
 * Exécute une requête avec tous les outils disponibles
 */
async function multiToolAgentWithWeatherDisplay(userMessage) {
  weatherDataStore = []; // Réinitialiser
  
  console.log('\n🤖 AGENT MULTI-OUTILS');
  console.log('='.repeat(100));
  console.log(`📝 Message: "${userMessage}"\n`);

  try {
    const response = await runAgent(tools, toolFunctions, userMessage, 10);
    
    // Afficher les données météo si disponibles
    if (weatherDataStore.length > 0) {
      console.log('\n📊 AFFICHAGE DES DONNÉES MÉTÉO:\n');
      displayWeatherTable(weatherDataStore);
      console.log('\n📇 CARTES MÉTÉO:\n');
      displayWeatherCards(weatherDataStore);
    }
    
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
  console.log('\n🔧 TEST: AGENT MULTI-OUTILS AVEC AFFICHAGE MÉTÉO\n');

  // Test 1: Météo simple
  await multiToolAgentWithWeatherDisplay('Quelle est la météo à Paris ?');

  console.log('\n' + '='.repeat(100) + '\n');

  // Test 2: Plusieurs villes
  await multiToolAgentWithWeatherDisplay('Quelle est la météo à Paris, Tokyo et New York ?');

  console.log('\n' + '='.repeat(100) + '\n');

  // Test 3: Combinaison
  await multiToolAgentWithWeatherDisplay('Donne-moi la météo à Berlin et à Sydney, calcule 2^10.');
}

main().catch(console.error);

export { displayWeatherTable, displayWeatherCards, formatWeatherCard };
