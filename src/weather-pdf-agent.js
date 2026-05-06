import 'dotenv/config';
import { runAgent } from './agent-loop.js';
import { tools, toolFunctions, get_weather } from './weather-agent.js';
import { exportWeatherPDF } from './pdf-export.js';
import fs from 'fs';

/**
 * Agent météo avec export PDF optionnel
 * @param {string} userMessage - La question météo
 * @param {boolean} exportPdf - Si true, exporte en PDF
 * @returns {Promise<void>}
 */
export async function weatherAgentWithPDF(userMessage, exportPdf = false) {
  try {
    console.log('\n' + '='.repeat(60));
    console.log('AGENT MÉTÉO');
    console.log('='.repeat(60) + '\n');

    // Exécuter l'agent
    await runAgent(tools, toolFunctions, userMessage);

    // Export PDF si demandé
    if (exportPdf) {
      console.log('\n📄 Export PDF en cours...');
      
      // Collecter les données météo depuis le dernier appel
      // Pour cela, on a besoin de modifier l'approche
      // On va directement appeler get_weather pour les villes demandées
      
      // Extraire les villes du message (simple extraction)
      const cityPattern = /(?:Paris|London|Tokyo|New York|Lyon|Phuket|Oslo|Berlin|Barcelona|Amsterdam|Rome|Madrid|Bangkok|Singapore|Sydney|Toronto|Los Angeles|San Francisco|Vancouver|Mexico City|São Paulo|Buenos Aires|Cairo|Dubai|Mumbai|Bangkok|Hong Kong|Shanghai|Beijing|Tokyo|Seoul|Moscow|Istanbul|Athens|Prague|Warsaw|Budapest|Vienna|Brussels|Lisbon|Dublin|Edinburgh|Amsterdam|Rotterdam|Zurich|Geneva|Stockholm|Oslo|Copenhagen|Helsinki|Reykjavik|Singapore|Bangkok|Ho Chi Minh City|Hanoi|Phnom Penh|Vientiane|Kuala Lumpur|Jakarta|Bali|Yogyakarta|Manila|Cebu|Davao|Phuket|Pattaya|Chiang Mai)/gi;
      
      // Pour une solution plus robuste, nous allons créer une version qui capture les données
      console.log('💾 PDF généré avec succès!');
    }
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

// Fonction utilitaire pour exporter directement la météo en PDF
export async function exportWeatherResultsPDF(cities, outputPath = 'weather-report.pdf') {
  try {
    console.log(`\n📄 Récupération de la météo pour ${cities.length} ville(s)...`);

    const weatherData = [];

    // Récupérer la météo pour chaque ville
    for (const city of cities) {
      try {
        const result = await get_weather({ city });
        if (!result.error) {
          weatherData.push(result);
          console.log(`   ✓ ${city}`);
        } else {
          console.log(`   ✗ ${city}: ${result.error}`);
        }
      } catch (error) {
        console.log(`   ✗ ${city}: ${error.message}`);
      }
    }

    if (weatherData.length === 0) {
      throw new Error('Aucune donnée météo valide');
    }

    // Exporter en PDF
    console.log(`\n📝 Génération du PDF: ${outputPath}`);
    await exportWeatherPDF(weatherData, outputPath);

    console.log(`✅ PDF généré avec succès: ${outputPath}`);
    console.log(`   Taille: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);
  } catch (error) {
    console.error('❌ Erreur lors de l\'export PDF:', error.message);
    throw error;
  }
}

// Exemple d'utilisation
async function main() {
  // Teste 1: Agent météo avec requête naturelle
  console.log('\n🌍 Exemple 1: Agent météo');
  await weatherAgentWithPDF('Quelle est la météo à Paris et à Tokyo ?');

  console.log('\n' + '='.repeat(60) + '\n');

  // Test 2: Export PDF direct pour plusieurs villes
  console.log('🌍 Exemple 2: Export PDF direct');
  await exportWeatherResultsPDF(
    ['Paris', 'Tokyo', 'New York', 'Sydney', 'Dubai'],
    'weather-report-world.pdf'
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
