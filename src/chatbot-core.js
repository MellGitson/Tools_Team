import dotenv from 'dotenv';

dotenv.config();

// Configuration multi-provider
export const PROVIDERS = {
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

// Pricing
export const PRICING = {
  mistral: { input: 0.14, output: 0.42, name: 'Mistral' },
  groq: { input: 0.00, output: 0.00, name: 'Groq' },
  huggingface: { input: 0.00, output: 0.00, name: 'HuggingFace' }
};

// Classe Chatbot pour gérer une session
export class Chatbot {
  constructor(provider = 'mistral') {
    this.currentProvider = provider;
    this.history = [
      {
        role: 'system',
        content: 'Tu es un assistant utile et concis. Tu te souviens de tout ce qui a été dit dans cette conversation.'
      }
    ];
    this.metrics = { totalTokens: 0, totalCost: 0, requestCount: 0 };
    this.requestHistory = [];  // Historique détaillé de chaque request
    this.createdAt = new Date();
    this.MAX_HISTORY = 20;
  }

  async chat(userMessage) {
    const provider = PROVIDERS[this.currentProvider];
    if (!provider) throw new Error(`Provider '${this.currentProvider}' not found`);
    if (!provider.apiKey) throw new Error(`API key missing for ${provider.name}`);

    const startTime = Date.now();

    // Ajouter le message user
    this.history.push({ role: 'user', content: userMessage });

    const response = await fetch(provider.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify({
        model: provider.model,
        messages: this.history,
        temperature: 0.7,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`${provider.name} API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const assistantMessage = data.choices[0].message.content;

    // Ajouter à l'historique
    this.history.push({ role: 'assistant', content: assistantMessage });

    // Calculer les métriques
    const endTime = Date.now();
    const duration = endTime - startTime;
    const promptTokens = data.usage?.prompt_tokens || 0;
    const completionTokens = data.usage?.completion_tokens || 0;
    const totalTokens = promptTokens + completionTokens;

    const pricing = PRICING[this.currentProvider];
    const cost = (promptTokens * pricing.input / 1000000) + (completionTokens * pricing.output / 1000000);

    this.metrics.totalTokens += totalTokens;
    this.metrics.totalCost += cost;
    this.metrics.requestCount += 1;

    // Enregistrer dans l'historique des requests
    this.requestHistory.push({
      requestNumber: this.metrics.requestCount,
      userMessage: userMessage,
      assistantResponse: assistantMessage,
      provider: this.currentProvider,
      timestamp: new Date(),
      duration,
      promptTokens,
      completionTokens,
      totalTokens,
      cost
    });

    // Compresser si nécessaire
    await this.compressHistory();

    return {
      response: assistantMessage,
      metrics: { duration, promptTokens, completionTokens, totalTokens, cost }
    };
  }

  async compressHistory() {
    if (this.history.length <= this.MAX_HISTORY) return;

    const keepLast = 10;
    const endCompress = this.history.length - keepLast;
    const messagesToCompress = this.history.slice(1, endCompress);

    const conversationText = messagesToCompress
      .map(m => `${m.role}: ${m.content}`)
      .join('\n\n');

    const provider = PROVIDERS[this.currentProvider];
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
          messages: [{ role: 'user', content: summaryPrompt }],
          temperature: 0.3,
          stream: false
        })
      });

      if (response.ok) {
        const data = await response.json();
        const summary = data.choices[0].message.content;
        this.history.splice(1, messagesToCompress.length, {
          role: 'assistant',
          content: `[Contexte résumé] ${summary}`
        });
      }
    } catch (e) {
      // Ignorer les erreurs
    }
  }

  clearHistory() {
    this.history = [this.history[0]];  // Garder seulement le system prompt
  }

  getHistory() {
    return this.history;
  }

  getMetrics() {
    return this.metrics;
  }

  setProvider(provider) {
    if (!PROVIDERS[provider]) throw new Error(`Provider '${provider}' not found`);
    this.currentProvider = provider;
  }

  getStatistics() {
    const avgTokensPerRequest = this.metrics.requestCount > 0 
      ? Math.round(this.metrics.totalTokens / this.metrics.requestCount)
      : 0;
    
    const avgCostPerRequest = this.metrics.requestCount > 0
      ? this.metrics.totalCost / this.metrics.requestCount
      : 0;

    const totalDuration = this.requestHistory.reduce((sum, req) => sum + req.duration, 0);
    const avgDuration = this.metrics.requestCount > 0 
      ? Math.round(totalDuration / this.metrics.requestCount)
      : 0;

    return {
      sessionStart: this.createdAt,
      sessionDuration: new Date() - this.createdAt,
      totalRequests: this.metrics.requestCount,
      totalTokens: this.metrics.totalTokens,
      totalCost: this.metrics.totalCost,
      avgTokensPerRequest,
      avgCostPerRequest,
      avgDuration,
      totalDuration,
      requestHistory: this.requestHistory,
      currentProvider: this.currentProvider
    };
  }
}
