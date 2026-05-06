import express from 'express';
import { Chatbot, PROVIDERS } from './chatbot-core.js';
import { exportStatisticsPDF } from './pdf-export.js';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Stocker les sessions par ID client
const sessions = new Map();

// Middleware pour obtenir ou créer une session
function getOrCreateSession(req, res, next) {
  const clientId = req.query.client_id || req.headers['x-client-id'] || 'default';
  
  if (!sessions.has(clientId)) {
    const provider = req.query.provider || 'mistral';
    sessions.set(clientId, new Chatbot(provider));
  }
  
  req.session = sessions.get(clientId);
  req.clientId = clientId;
  next();
}

// Appliquer le middleware à toutes les routes
app.use(getOrCreateSession);

// Phase 8: Route GET /chat
app.get('/chat', async (req, res) => {
  try {
    const { q, provider } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Parameter "q" is required' });
    }

    // Changer de provider si demandé
    if (provider) {
      if (!PROVIDERS[provider]) {
        return res.status(400).json({ error: `Provider '${provider}' not found` });
      }
      req.session.setProvider(provider);
    }

    const result = await req.session.chat(q);
    const currentProvider = req.session.currentProvider;

    res.json({
      reply: result.response,
      provider: currentProvider,
      tokens: result.metrics.totalTokens
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Phase 8: Route DELETE /history
app.delete('/history', (req, res) => {
  try {
    req.session.clearHistory();
    res.json({ success: true, message: 'History cleared' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route GET /metrics
app.get('/metrics', (req, res) => {
  try {
    res.json({
      sessionMetrics: req.session.getMetrics(),
      clientId: req.clientId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route GET /history
app.get('/history', (req, res) => {
  try {
    const history = req.session.getHistory();
    res.json({
      history: history,
      count: history.length,
      clientId: req.clientId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route GET /providers
app.get('/providers', (req, res) => {
  try {
    const providers = Object.keys(PROVIDERS).map(key => ({
      name: key,
      displayName: PROVIDERS[key].name
    }));
    res.json({ providers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Phase 9: Route GET /export/pdf - Rapport Professionnel en Français
app.get('/export/pdf', async (req, res) => {
  try {
    const stats = req.session.getStatistics();
    const filename = `chatbot-stats-${new Date().toISOString().split('T')[0]}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Exporter le PDF directement dans la réponse HTTP
    await exportStatisticsPDF(stats, res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`\n🚀 Chatbot API - Phase 8 + Phase 9`);
  console.log(`📍 Serveur démarré sur http://localhost:${PORT}`);
  console.log(`\n📚 Routes disponibles:`);
  console.log(`  GET  /chat?q=...&provider=mistral&client_id=...  - Envoyer un message`);
  console.log(`  GET  /history?client_id=...                      - Voir l'historique`);
  console.log(`  GET  /metrics?client_id=...                      - Voir les métriques`);
  console.log(`  GET  /providers                                   - Lister les providers`);
  console.log(`  GET  /export/pdf?client_id=...                   - Exporter stats en PDF (Phase 9)`);
  console.log(`  DELETE /history?client_id=...                    - Effacer l'historique`);
  console.log(`  GET  /health                                      - Health check\n`);
});
