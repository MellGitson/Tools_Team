import PDFDocument from 'pdfkit';
import { PROVIDERS } from './chatbot-core.js';
import fs from 'fs';

/**
 * Génère un PDF avec les statistiques de la session
 * @param {Object} stats - Objet statistiques (getStatistics())
 * @param {string|Stream} output - Chemin fichier ou stream de sortie
 * @returns {Promise<void>}
 */
export async function exportStatisticsPDF(stats, output) {
  return new Promise((resolve, reject) => {
    try {
      // Créer un PDF avec dimensions standard
      const doc = new PDFDocument({ 
        bufferPages: true,
        margin: 40,
        size: 'A4'
      });

      // Déterminer si output est un chemin (string) ou un stream
      let stream;
      if (typeof output === 'string') {
        stream = fs.createWriteStream(output);
      } else {
        stream = output;
      }

      doc.pipe(stream);

      // ============= PAGE 1: COUVERTURE ET RÉSUMÉ =============
      
      // Couleur de thème
      const primaryColor = '#2563EB';
      const accentColor = '#10B981';
      const lightBg = '#F3F4F6';

      // En-tête coloré
      doc.rect(0, 0, 612, 120).fill(primaryColor);
      doc.fontSize(32).font('Helvetica-Bold').fillColor('white')
        .text('Rapport Analytique Chatbot', 40, 30);
      doc.fontSize(11).font('Helvetica').fillColor(accentColor)
        .text('Analyse detaillee des Tokens et Couts', 40, 70);

      // Info session
      doc.fontSize(10).font('Helvetica').fillColor('white')
        .text(`Genere le: ${new Date().toLocaleString('fr-FR')}  |  Duree: ${Math.round(stats.sessionDuration / 1000)}s`, 40, 95);

      // Résumé Global - Cartes
      doc.fillColor('black');
      let cardYPos = 140;

      // Données pour les cartes
      const cards = [
        { 
          title: 'TOTAL REQUETES',
          value: stats.totalRequests.toString(),
          unit: 'requetes',
          color: '#3B82F6'
        },
        { 
          title: 'TOTAL TOKENS',
          value: stats.totalTokens.toLocaleString('fr-FR'),
          unit: 'tokens',
          color: '#8B5CF6'
        },
        { 
          title: 'COUT SESSION',
          value: `$${stats.totalCost.toFixed(6)}`,
          unit: 'USD',
          color: '#EC4899'
        },
        { 
          title: 'DUREE MOYENNE',
          value: `${stats.avgDuration}`,
          unit: 'ms',
          color: '#F59E0B'
        }
      ];

      // Dessiner 4 cartes (2x2)
      for (let i = 0; i < cards.length; i++) {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = 40 + col * 280;
        const y = cardYPos + row * 85;

        // Carte blanche avec bordure
        doc.rect(x, y, 260, 75).fillAndStroke('white', '#E5E7EB');

        // Barre de couleur en haut
        doc.rect(x, y, 260, 4).fill(cards[i].color);

        // Titre
        doc.fontSize(9).font('Helvetica-Bold').fillColor(cards[i].color)
          .text(cards[i].title, x + 20, y + 12);

        // Valeur principale
        doc.fontSize(20).font('Helvetica-Bold').fillColor(cards[i].color)
          .text(cards[i].value, x + 20, y + 28);

        // Unité
        doc.fontSize(8).font('Helvetica').fillColor('#6B7280')
          .text(cards[i].unit, x + 20, y + 55);
      }

      // Section de détails
      cardYPos += 180;
      doc.fontSize(13).font('Helvetica-Bold').fillColor(primaryColor)
        .text('PERFORMANCE SESSION', 40, cardYPos);
      
      doc.moveTo(40, cardYPos + 18).lineTo(570, cardYPos + 18).stroke(primaryColor);

      // Tableau des métriques
      const detailMetrics = [
        ['Tokens moyens par requete', `${stats.avgTokensPerRequest}`],
        ['Cout moyen par requete', `$${stats.avgCostPerRequest.toFixed(8)}`],
        ['Provider actif', PROVIDERS[stats.currentProvider].name],
        ['Duree totale session', `${Math.round(stats.totalDuration / 1000)}s`]
      ];

      let metricsY = cardYPos + 35;
      detailMetrics.forEach((metric, idx) => {
        // Ligne alternée
        if (idx % 2 === 0) {
          doc.rect(40, metricsY - 5, 530, 25).fill(lightBg);
        }

        doc.fontSize(11).font('Helvetica-Bold').fillColor('black')
          .text(metric[0], 50, metricsY);
        doc.fontSize(11).font('Helvetica').fillColor(accentColor)
          .text(metric[1], 450, metricsY);

        metricsY += 28;
      });

      // ============= PAGE 2+: HISTORIQUE DÉTAILLÉ =============
      if (stats.requestHistory.length > 0) {
        doc.addPage();

        // En-tête de page
        doc.fontSize(13).font('Helvetica-Bold').fillColor(primaryColor)
          .text('HISTORIQUE DES REQUETES', 40, 40);
        doc.moveTo(40, 58).lineTo(570, 58).stroke(primaryColor);

        let logYPos = 75;
        let currentPage = 1;

        stats.requestHistory.forEach((req, idx) => {
          // Nouvelle page si nécessaire
          if (logYPos > 720) {
            doc.addPage();
            currentPage++;
            doc.fontSize(10).font('Helvetica').fillColor('#999999')
              .text(`Page ${currentPage}`, 40, 30);
            logYPos = 60;
          }

          // Container de request
          doc.rect(40, logYPos - 3, 530, 68).stroke('#E5E7EB');
          doc.rect(40, logYPos - 3, 8, 68).fill(accentColor);

          // Numéro et timestamp
          doc.fontSize(10).font('Helvetica-Bold').fillColor(primaryColor)
            .text(`Requete #${req.requestNumber}`, 58, logYPos);
          
          doc.fontSize(8).font('Helvetica').fillColor('#6B7280')
            .text(new Date(req.timestamp).toLocaleString('fr-FR'), 130, logYPos);

          // Message utilisateur
          const displayMsg = req.userMessage.substring(0, 70) + 
            (req.userMessage.length > 70 ? '...' : '');
          doc.fontSize(9).font('Helvetica').fillColor('black')
            .text(`Question: ${displayMsg}`, 58, logYPos + 16, { width: 450 });

          // Badges de métriques
          const badges = [
            { label: `${req.totalTokens} tokens`, x: 58 },
            { label: `$${req.cost.toFixed(8)}`, x: 180 },
            { label: `${req.duration}ms`, x: 280 },
            { label: PROVIDERS[req.provider].name, x: 380 }
          ];

          doc.fontSize(7).font('Helvetica');
          badges.forEach(badge => {
            doc.rect(badge.x, logYPos + 38, 90, 15).stroke('#D1D5DB');
            doc.fillColor('#6366F1').text(badge.label, badge.x + 5, logYPos + 42, { width: 80 });
          });

          logYPos += 80;
        });

        // Pied de page avec stats finales
        doc.fontSize(9).font('Helvetica').fillColor('#999999')
          .text(`Total: ${stats.totalRequests} requetes | ${stats.totalTokens} tokens | $${stats.totalCost.toFixed(6)} cout`, 
            40, 750, { align: 'center' });
      }

      // Finalize PDF
      doc.end();

      stream.on('finish', () => {
        resolve();
      });

      stream.on('error', (err) => {
        reject(err);
      });

    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Génère un PDF avec les données météo (une seule page A4)
 * @param {Array<Object>} weatherData - Tableau des données météo
 * @param {string|Stream} output - Chemin fichier ou stream de sortie
 * @returns {Promise<void>}
 */
export async function exportWeatherPDF(weatherData, output) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        bufferPages: false,
        margin: 25,
        size: 'A4'
      });

      let stream;
      if (typeof output === 'string') {
        stream = fs.createWriteStream(output);
      } else {
        stream = output;
      }

      doc.pipe(stream);

      // Couleurs professionnelles
      const colors = {
        primary: '#0EA5E9',
        cold: '#3B82F6',
        moderate: '#F59E0B',
        hot: '#DC2626',
        border: '#E5E7EB',
        text: '#1F2937',
        subtext: '#6B7280'
      };

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const margin = 25;
      const contentWidth = pageWidth - margin * 2;

      // ===== EN-TÊTE =====
      doc.rect(0, 0, pageWidth, 50).fill(colors.primary);
      
      doc.fontSize(24).font('Helvetica-Bold').fillColor('white')
        .text('Rapport Météorologique', margin, 12);
      
      doc.fontSize(9).font('Helvetica').fillColor('#E0F2FE')
        .text(`${weatherData.length} ville(s) • ${new Date().toLocaleString('fr-FR')}`, margin, 38);

      // ===== GRILLE DE CARTES =====
      const cardsPerRow = weatherData.length <= 3 ? weatherData.length : 3;
      const cardWidth = (contentWidth - (cardsPerRow - 1) * 10) / cardsPerRow;
      // Hauteur de carte très compacte pour tenir sur une seule page
      const cardHeight = 135;
      const rowSpacing = 6;
      const totalRows = Math.ceil(weatherData.length / cardsPerRow);
      const totalHeight = 65 + totalRows * cardHeight + (totalRows - 1) * rowSpacing + 35;

      let cardIndex = 0;
      let currentRow = 0;
      let currentCol = 0;

      weatherData.forEach((weather, index) => {
        const x = margin + currentCol * (cardWidth + 10);
        const y = 65 + currentRow * (cardHeight + rowSpacing);

        drawWeatherCard(doc, weather, x, y, cardWidth, cardHeight, colors);

        currentCol++;
        if (currentCol >= cardsPerRow) {
          currentCol = 0;
          currentRow++;
        }
      });

      // ===== FOOTER =====
      const footerY = pageHeight - margin - 10;
      doc.fontSize(7).font('Helvetica').fillColor(colors.subtext)
        .text('Données: wttr.in API', margin, footerY);
      doc.fontSize(7).font('Helvetica').fillColor(colors.subtext)
        .text(`Tools_ia • ${new Date().toLocaleDateString('fr-FR')}`, pageWidth - margin - 100, footerY);

      doc.end();

      stream.on('finish', () => {
        resolve();
      });

      stream.on('error', (err) => {
        reject(err);
      });

    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Retourne le type de symbole météo basé sur la description
 */
function getWeatherIconType(description) {
  const desc = description.toLowerCase().trim();
  
  if (desc.includes('sunny') || desc.includes('clear')) return 'sunny';
  if (desc.includes('partly cloudy') || desc.includes('partly')) return 'partly';
  if (desc.includes('cloudy') || desc.includes('overcast')) return 'cloudy';
  if (desc.includes('mist') || desc.includes('fog')) return 'mist';
  if (desc.includes('drizzle') || desc.includes('light rain')) return 'drizzle';
  if (desc.includes('rain') || desc.includes('moderate rain')) return 'rain';
  if (desc.includes('heavy rain')) return 'heavyrain';
  if (desc.includes('thundery') || desc.includes('thunder')) return 'thunder';
  if (desc.includes('sleet')) return 'sleet';
  if (desc.includes('snow')) return 'snow';
  
  return 'cloudy'; // Par défaut
}

/**
 * Dessine une petite icône météo graphique
 */
function drawWeatherIconGraphic(doc, iconType, x, y, size = 12) {
  const colors = {
    sunny: '#FFB81C',
    cloud: '#94A3B8',
    rain: '#3B82F6',
    snow: '#E0F2FE'
  };
  
  switch(iconType) {
    case 'sunny': {
      // Cercle central jaune
      doc.circle(x + size/2, y + size/2, size/3).fill(colors.sunny);
      // Petits traits autour pour les rayons
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        const startR = size/2 + 2;
        const endR = size/2 + 4;
        const x1 = x + size/2 + Math.cos(angle) * startR;
        const y1 = y + size/2 + Math.sin(angle) * startR;
        const x2 = x + size/2 + Math.cos(angle) * endR;
        const y2 = y + size/2 + Math.sin(angle) * endR;
        doc.moveTo(x1, y1).lineTo(x2, y2).stroke(colors.sunny);
      }
      break;
    }
    case 'partly': {
      // Soleil partiel à gauche
      doc.circle(x + size/3, y + size/3, size/4).fill(colors.sunny);
      // Nuage à droite
      doc.circle(x + size/2, y + size/2, size/3).fillAndStroke(colors.cloud, '#64748B');
      doc.circle(x + size/2 - size/6, y + size/2, size/3.5).fillAndStroke(colors.cloud, '#64748B');
      break;
    }
    case 'cloudy': {
      // Deux cercles pour nuage
      doc.circle(x + size/2 - size/6, y + size/2, size/3).fillAndStroke(colors.cloud, '#64748B');
      doc.circle(x + size/2 + size/6, y + size/2, size/3).fillAndStroke(colors.cloud, '#64748B');
      break;
    }
    case 'mist': {
      // Trois traits horizontaux
      doc.moveTo(x + 2, y + size/3).lineTo(x + size - 2, y + size/3).stroke(colors.cloud);
      doc.moveTo(x + 2, y + size/2).lineTo(x + size - 2, y + size/2).stroke(colors.cloud);
      doc.moveTo(x + 2, y + size*2/3).lineTo(x + size - 2, y + size*2/3).stroke(colors.cloud);
      break;
    }
    case 'drizzle': {
      // Nuage + gouttes fines
      doc.circle(x + size/2 - size/6, y + size/3, size/4).fillAndStroke(colors.cloud, '#64748B');
      doc.circle(x + size/2 + size/6, y + size/3, size/4).fillAndStroke(colors.cloud, '#64748B');
      // Petits points pour la pluie légère
      doc.circle(x + size/2 - size/4, y + size*0.65, 1).fill(colors.rain);
      doc.circle(x + size/2, y + size*0.7, 1).fill(colors.rain);
      doc.circle(x + size/2 + size/4, y + size*0.65, 1).fill(colors.rain);
      break;
    }
    case 'rain': {
      // Nuage + traits pour la pluie
      doc.circle(x + size/2 - size/6, y + size/3, size/4).fillAndStroke(colors.cloud, '#64748B');
      doc.circle(x + size/2 + size/6, y + size/3, size/4).fillAndStroke(colors.cloud, '#64748B');
      // Traits de pluie
      doc.moveTo(x + size/2 - size/4, y + size*0.65).lineTo(x + size/2 - size/4 - 1, y + size*0.8).stroke(colors.rain);
      doc.moveTo(x + size/2, y + size*0.7).lineTo(x + size/2 - 1, y + size*0.85).stroke(colors.rain);
      doc.moveTo(x + size/2 + size/4, y + size*0.65).lineTo(x + size/2 + size/4 - 1, y + size*0.8).stroke(colors.rain);
      break;
    }
    case 'heavyrain': {
      // Nuage + pluie abondante
      doc.circle(x + size/2 - size/6, y + size/4, size/4).fillAndStroke(colors.cloud, '#64748B');
      doc.circle(x + size/2 + size/6, y + size/4, size/4).fillAndStroke(colors.cloud, '#64748B');
      // Pluie intense
      for (let i = 0; i < 6; i++) {
        const offsetX = (i % 3) * size/3 - size/3;
        doc.moveTo(x + size/2 + offsetX, y + size*0.55).lineTo(x + size/2 + offsetX - 1.5, y + size*0.8).stroke(colors.rain);
      }
      break;
    }
    case 'thunder': {
      // Nuage sombre + éclair
      doc.circle(x + size/2 - size/6, y + size/3, size/4).fillAndStroke('#334155', '#1E293B');
      doc.circle(x + size/2 + size/6, y + size/3, size/4).fillAndStroke('#334155', '#1E293B');
      // Éclair
      doc.moveTo(x + size/2 + 1, y + size*0.65).lineTo(x + size/2 - 1, y + size*0.75)
        .lineTo(x + size/2 + 1, y + size*0.85).stroke('#FFD700');
      break;
    }
    case 'sleet': {
      // Nuage + mélange pluie/neige
      doc.circle(x + size/2 - size/6, y + size/3, size/4).fillAndStroke(colors.cloud, '#64748B');
      doc.circle(x + size/2 + size/6, y + size/3, size/4).fillAndStroke(colors.cloud, '#64748B');
      // Gouttes
      doc.circle(x + size/2 - size/4, y + size*0.68, 1).fill(colors.rain);
      // Points (neige)
      doc.circle(x + size/2, y + size*0.68, 1).fill('#B0E0E6');
      doc.circle(x + size/2 + size/4, y + size*0.68, 1).fill(colors.rain);
      break;
    }
    case 'snow': {
      // Nuage blanc + flocons
      doc.circle(x + size/2 - size/6, y + size/3, size/4).fillAndStroke('#F8FAFC', '#E2E8F0');
      doc.circle(x + size/2 + size/6, y + size/3, size/4).fillAndStroke('#F8FAFC', '#E2E8F0');
      // Petits points pour la neige
      doc.circle(x + size/2 - size/4, y + size*0.65, 1.5).fill('#E0F2FE');
      doc.circle(x + size/2, y + size*0.72, 1.5).fill('#E0F2FE');
      doc.circle(x + size/2 + size/4, y + size*0.65, 1.5).fill('#E0F2FE');
      break;
    }
  }
}

/**
 * Dessine une carte météo compacte avec dessin d'icône
 */
function drawWeatherCard(doc, weather, x, y, width, height, colors) {
  const tempColor = getTempColor(weather.temperature_c, colors);
  const iconType = getWeatherIconType(weather.description);

  // Cadre blanc avec bordure
  doc.rect(x, y, width, height).fillAndStroke('white', colors.border);

  // Barre de couleur en haut (3px)
  doc.rect(x, y, width, 3).fill(tempColor);

  // Titre ville
  doc.fontSize(9).font('Helvetica-Bold').fillColor(tempColor)
    .text(weather.city, x + 5, y + 4, { width: width - 25 });
  
  // Petit dessin d'icône météo
  drawWeatherIconGraphic(doc, iconType, x + width - 20, y + 2, 14);

  // Température principale
  doc.fontSize(24).font('Helvetica-Bold').fillColor(tempColor)
    .text(`${weather.temperature_c}°`, x + 5, y + 18);

  // Ressenti
  doc.fontSize(7).font('Helvetica').fillColor(colors.subtext)
    .text(`Ressenti: ${weather.feels_like_c}°C`, x + 5, y + 44);

  // Description courte
  doc.fontSize(7).font('Helvetica').fillColor(colors.text)
    .text(weather.description, x + 5, y + 52, { width: width - 10 });

  // Détails en bas
  const detailsY = y + height - 20;
  
  // Ligne de séparation légère
  doc.moveTo(x + 5, detailsY - 4).lineTo(x + width - 5, detailsY - 4)
    .strokeColor(colors.border).stroke();

  // Détails avec labels - très compact
  const detailSpacing = (width - 10) / 3;
  
  // Humidité
  doc.fontSize(6).font('Helvetica').fillColor(colors.subtext)
    .text('H: ' + weather.humidity, x + 5, detailsY, { width: detailSpacing - 4 });

  // Vent
  doc.fontSize(6).font('Helvetica').fillColor(colors.subtext)
    .text('V: ' + weather.wind_kmph + 'km/h', x + 5 + detailSpacing, detailsY, { width: detailSpacing - 4 });

  // Nuages
  doc.fontSize(6).font('Helvetica').fillColor(colors.subtext)
    .text('N: ' + weather.cloudcover, x + 5 + detailSpacing * 2, detailsY, { width: detailSpacing - 4 });
}

/**
 * Détermine la couleur basée sur la température
 */
function getTempColor(temp, colors) {
  if (temp >= 25) return colors.hot;
  if (temp >= 15) return colors.moderate;
  return colors.cold;
}
