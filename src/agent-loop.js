import 'dotenv/config';

/**
 * Boucle agent générique pour gérer les tool_calls
 * @param {Array} tools - Définitions des outils (format OpenAI)
 * @param {Object} toolFunctions - Map { nom_outil: fonction }
 * @param {string} userMessage - Le message de l'utilisateur
 * @param {number} maxIterations - Nombre maximum de tours (par défaut 10)
 * @param {Array} conversationHistory - Historique optionnel pour conversation multi-tour (modifié en place)
 * @returns {Promise<string>} La réponse finale du modèle
 */
export async function runAgent(tools, toolFunctions, userMessage, maxIterations = 10, conversationHistory = null) {
  // Si historique fourni, l'utiliser ; sinon en créer un nouveau
  const messages = conversationHistory || [
    { role: 'user', content: userMessage }
  ];

  // Si historique fourni, ajouter le nouveau message utilisateur
  if (conversationHistory) {
    messages.push({ role: 'user', content: userMessage });
  }

  let iterations = 0;

  console.log('📝 Message utilisateur:', userMessage);
  console.log('---');

  // La boucle : on tourne jusqu'à ce que le modèle dise "stop"
  while (iterations < maxIterations) {
    iterations++;
    const callStart = Date.now();

    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages,
        tools,
        tool_choice: 'auto'
      })
    });

    const data = await response.json();

    // Vérifier les erreurs API
    if (!response.ok || data.error) {
      console.error('❌ Erreur API:', data.error || data);
      throw new Error(`API Error: ${data.error?.message || 'Unknown error'}`);
    }

    if (!data.choices || !data.choices[0]) {
      console.error('❌ Réponse invalide:', data);
      throw new Error('Réponse API invalide');
    }

    const choice = data.choices[0];
    const latency = Date.now() - callStart;

    // Métriques observables : tokens consommés et latence de ce tour
    console.log(`[Agent] Tour ${iterations} — ${data.usage?.total_tokens ?? '?'} tokens, ${latency}ms`);

    // On ajoute la réponse du modèle à l'historique (avec ou sans tool_calls)
    messages.push(choice.message);

    if (choice.finish_reason === 'stop') {
      // Le modèle a fini, on retourne la réponse textuelle
      console.log('✅ Réponse finale:');
      console.log(choice.message.content);
      
      // Ajouter la réponse finale à l'historique (si c'est un historique fourni)
      if (conversationHistory) {
        messages.push({
          role: 'assistant',
          content: choice.message.content
        });
      }
      
      return choice.message.content;
    }

    if (choice.finish_reason === 'tool_calls') {
      // Le modèle veut appeler des outils — potentiellement plusieurs à la fois
      console.log(`🔧 Le modèle demande ${choice.message.tool_calls.length} outil(s)...`);

      for (const toolCall of choice.message.tool_calls) {
        const fn = toolFunctions[toolCall.function.name];
        const args = JSON.parse(toolCall.function.arguments);

        if (!fn) {
          console.error(`❌ Outil inconnu: ${toolCall.function.name}`);
          continue;
        }

        console.log(`   → ${toolCall.function.name}(${JSON.stringify(args)})`);

        try {
          // On exécute l'outil
          const result = await fn(args);

          // On renvoie le résultat au modèle sous forme de message "tool"
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id, // l'ID est important pour matcher l'appel
            content: JSON.stringify(result)
          });

          console.log(`     Résultat:`, result);
        } catch (error) {
          // En cas d'erreur, on le signale au modèle
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: error.message })
          });
          console.log(`     Erreur:`, error.message);
        }
      }

      console.log('---');
      // La boucle repart : le modèle reçoit les résultats et décide quoi faire
    }
  }

  throw new Error(`Agent a dépassé le nombre maximum d'itérations (${maxIterations})`);
}

export default runAgent;
