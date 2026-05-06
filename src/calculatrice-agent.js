import 'dotenv/config';

// --- Définition de l'outil ---
const tools = [
  {
    type: 'function',
    function: {
      name: 'calculate',
      description: 'Évalue une expression mathématique et retourne le résultat. Utiliser pour tout calcul arithmétique.',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: "L'expression à évaluer, ex: '(15 * 4) / 3' ou '2 ** 32'"
          }
        },
        required: ['expression']
      }
    }
  }
];

// --- Implémentation de l'outil ---
/**
 * Évalue une expression mathématique de manière sécurisée
 * Supporte les opérateurs: + - * / ** ( ) ainsi que les fonctions Math
 * @param {string} expression - L'expression à évaluer
 * @returns {number} Le résultat du calcul
 */
function calculate(expression) {
  try {
    // Validation basique : autoriser seulement les caractères mathématiques
    const allowedChars = /^[0-9+\-*/().^\s]*$/;
    if (!allowedChars.test(expression)) {
      throw new Error('Expression contient des caractères non autorisés');
    }

    // Protection supplémentaire : rejeter certains patterns dangereux
    const dangerousPatterns = /[;,[\]{}]/g;
    if (dangerousPatterns.test(expression)) {
      throw new Error('Expression contient des caractères interdits');
    }

    // Remplacer ^ par ** pour la puissance (notation mathématique classique)
    const normalizedExpression = expression.replace(/\^/g, '**');

    // Évaluation sécurisée dans une fonction avec eval
    // Cette approche est acceptable car l'expression est validée
    const result = Function('"use strict"; return (' + normalizedExpression + ')')();

    // Vérifier que le résultat est un nombre valide
    if (!Number.isFinite(result)) {
      throw new Error('Le résultat n\'est pas un nombre valide');
    }

    return result;
  } catch (error) {
    throw new Error(`Erreur d'évaluation: ${error.message}`);
  }
}

// --- L'appel au LLM avec les outils activés ---
/**
 * Appelle l'API Mistral avec support des outils
 * @param {string} userMessage - Le message de l'utilisateur
 * @returns {Promise<string>} La réponse finale du modèle
 */
async function callWithTools(userMessage) {
  const messages = [
    { role: 'user', content: userMessage }
  ];

  console.log('📝 Message utilisateur:', userMessage);
  console.log('---');

  let response = await fetch('https://api.mistral.ai/v1/chat/completions', {
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

  let data = await response.json();
  
  // Vérifier si la réponse est une erreur
  if (!response.ok || data.error) {
    console.error('❌ Erreur API:', data.error || data);
    throw new Error(`API Error: ${data.error?.message || 'Unknown error'}`);
  }

  if (!data.choices || !data.choices[0]) {
    console.error('❌ Réponse invalide:', data);
    throw new Error('Réponse API invalide: pas de choices');
  }

  let choice = data.choices[0];

  // Boucle pour gérer les appels d'outils potentiels
  while (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
    console.log('🔧 Le modèle demande un outil...');

    const toolCall = choice.message.tool_calls[0];
    const toolName = toolCall.function.name;
    const toolArgs = JSON.parse(toolCall.function.arguments);

    console.log(`   Outil: ${toolName}`);
    console.log(`   Expression: ${toolArgs.expression}`);

    let toolResult;
    if (toolName === 'calculate') {
      toolResult = calculate(toolArgs.expression);
      console.log(`   Résultat: ${toolResult}`);
    }

    // Ajouter le message de l'assistant avec l'appel d'outil
    const assistantMessage = {
      role: 'assistant',
      tool_calls: choice.message.tool_calls
    };
    // N'ajouter le contenu que s'il existe
    if (choice.message.content) {
      assistantMessage.content = choice.message.content;
    }
    messages.push(assistantMessage);

    // Ajouter les réponses de tous les outils
    for (const tc of choice.message.tool_calls) {
      // Re-évaluer si nécessaire (sinon utiliser le résultat du premier)
      let result = toolResult;
      if (tc.id !== toolCall.id) {
        const args = JSON.parse(tc.function.arguments);
        result = calculate(args.expression);
      }
      
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: result.toString()
      });
    }

    console.log('---');

    // Rappeler l'API avec les résultats de l'outil
    response = await fetch('https://api.mistral.ai/v1/chat/completions', {
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

    data = await response.json();
    
    // Vérifier la réponse
    if (!response.ok || data.error) {
      console.error('❌ Erreur API:', data.error || data);
      throw new Error(`API Error: ${data.error?.message || 'Unknown error'}`);
    }

    if (!data.choices || !data.choices[0]) {
      console.error('❌ Réponse invalide:', data);
      throw new Error('Réponse API invalide: pas de choices');
    }

    choice = data.choices[0];
  }

  // La réponse finale sans appel d'outil
  const finalResponse = choice.message.content;
  console.log('✅ Réponse finale:');
  console.log(finalResponse);

  return finalResponse;
}

// --- Fonction principale ---
async function main() {
  try {
    // Exemple 1 : Calculs simples
    await callWithTools('Combien fait 2 à la puissance 32 ? Et 15 fois 24 ?');

    console.log('\n' + '='.repeat(60) + '\n');

    // Exemple 2 : Calcul plus complexe
    await callWithTools('Quel est le résultat de (100 + 50) * 2 / 3 ?');
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
export { callWithTools, calculate, tools };
