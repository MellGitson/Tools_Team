# Tools_Team

**Projet collaboratif - En développement**

---

## Installation

### Prérequis

```bash
Node.js >= 18.0.0
npm >= 8.0.0
```

### Installation des dépendances

```bash
npm install
```
```

Évalue des expressions mathématiques localement:
- Input: `2 + 2` → Output: `4`
- Input: `Math.sqrt(16)` → Output: `4`
- Input: `Math.pow(2, 8)` → Output: `256`

#### Phase 2: Météo API

```bash
npm run weather
```

Récupère la météo temps réel via wttr.in:
- Température actuelle
- Humidité
- Vitesse du vent
- Prévisions

#### Phase 3: Web Search

```bash
npm run search
```

Recherche web via DuckDuckGo:
- Résultats pertinents
- Articles récents
- Actualités

#### Phase 4: Multi-tool Agent

```bash
npm run multi-tool
```

Agent orchestre automatiquement les outils:
- Mémoire conversationnelle
- Routing intelligent
- Support multi-turns

---

### 📚 TRACK B: RAG (Phases 5-8)

#### Phase 5: Pinecone Setup

```bash
npm run pinecone
```

Configure le vector database:
- ✓ Crée index `mini-perplexity` (1024d, cosine)
- ✓ Vérifie connectivité
- ✓ Liste les indices existants

#### Phase 6: Multi-provider Embeddings

```bash
npm run embedding:multi
```

Génère embeddings avec fallback automatique:
- Primary: **Mistral** (1024d)
- Fallback 1: HuggingFace (384d)
- Fallback 2: Jina (768d)
- Fallback 3: OpenAI (1536d)

Test des providers individuellement:
```bash
npm run embedding:providers:test
```

Vérification end-to-end:
```bash
npm run embedding:pinecone:verify
```

#### Phase 7: Vector Store Query

```bash
npm run rag:query
```

Teste semantic search avec 3 checkpoints:
- ✅ **Pertinence**: "Qu'est-ce que l'IA?" → scores élevés
- ✅ **Off-topic**: "Restaurant Paris?" → scores bas
- ✅ **Reformulation**: Résultats stables

Résultats:
```
Pertinence: 0.748, 0.727 ✅
Off-topic:  0.701, 0.691 ✅
Reformulation: Stable    ✅
```

#### Phase 8: RAG Complete

```bash
npm run rag:full
```

Combine retrieval + generation:
1. Embed question via Mistral
2. Query Pinecone
3. Récupère chunks similaires
4. Passe au LLM pour génération finale
5. Réponse ancrée dans vos données

---

### 🔍 Audit & Tests

#### Pipeline Compliance Audit

```bash
npm run rag:audit
```

Vérifie conformité avec diagramme RAG:

```
✅ ÉTAPE 1: LOAD       - Charger documents
✅ ÉTAPE 2: CHUNK      - Découper en blocs
✅ ÉTAPE 3: EMBED      - Vectoriser chunks
✅ ÉTAPE 4: STORE      - Pinecone upsert
✅ ÉTAPE 5A: QUERY EMB - Vectoriser question
✅ ÉTAPE 5B: QUERY SEA - Pinecone query
✅ ÉTAPE 5C: GENERATE  - LLM response
```

---

## 🛠️ Tous les scripts NPM

```bash
# Track A: Tools (Phases 1-4)
npm run calculator                    # Phase 1: Math calculations
npm run weather                       # Phase 2: Real-time weather
npm run search                        # Phase 3: Web search
npm run multi-tool                    # Phase 4: Multi-tool agent
npm run conversation                  # With memory

# Track B: RAG (Phases 5-8)
npm run pinecone                      # Phase 5: Pinecone setup
npm run embedding:multi               # Phase 6: Mistral embeddings
npm run embedding:providers:test      # Phase 6: Test all providers
npm run embedding:pinecone:verify     # Phase 6: E2E verification
npm run rag:query                     # Phase 7: Semantic search
npm run rag:full                      # Phase 8: Full RAG pipeline
npm run rag:audit                     # Audit compliance

# Phase 9: Hybrid Agent 🎯
npm run hybrid                        # Hybrid agent (recommended)

# Server
npm run api                           # Express API
npm run api:dev                       # API with watch mode
npm run start                         # CLI chatbot
npm run dev                           # CLI with watch mode
```

---

## 📁 Structure du projet

```
src/
├─ TRACK A: Tools (Phases 1-4)
│  ├─ calculatrice-agent.js         (Phase 1: Math)
│  ├─ weather-agent.js              (Phase 2: Météo)
│  ├─ search-agent.js               (Phase 3: Web search)
│  ├─ multi-tool-agent.js           (Phase 4: Routing)
│  └─ conversation-agent.js         (Memory)
│
├─ TRACK B: RAG (Phases 5-8)
│  ├─ pinecone-agent.js             (Phase 5)
│  ├─ embedding-multi-provider.js   (Phase 6)
│  ├─ rag-query-agent.js            (Phase 7)
│  ├─ rag-generator.js              (Phase 8)
│  ├─ rag-audit.js                  (Compliance)
│  └─ embedding-pinecone-verify.js  (E2E test)
│
├─ PHASE 9: Hybrid Agent ✨
│  ├─ hybrid-agent.js               (Main orchestrator)
│  └─ rag-search-tool.js            (RAG tool)
│
└─ Support
   ├─ api.js                        (Express API)
   ├─ chatbot-cli.js                (CLI interface)
   └─ agent-loop.js                 (Tool execution)
```

---

## 📊 Test Results

### Phase 7: Semantic Search Checkpoints

```
✅ CHECKPOINT 1: Pertinence
   Query: "Qu'est-ce que l'IA?"
   Results: 2 chunks found
   Scores: 0.748, 0.727
   Status: ✅ Relevant (avg 0.737)

✅ CHECKPOINT 2: Off-topic
   Query: "Restaurant Paris?"
   Results: 2 chunks found
   Scores: 0.701, 0.691
   Status: ✅ Correctly low (avg 0.696)

✅ CHECKPOINT 3: Reformulation
   Q1: "Qu'est-ce que l'IA?" → chunk-0 (0.748)
   Q2: "Parlez-moi de l'IA et ses caractéristiques" → chunk-0 (0.723)
   Status: ✅ Stable results (same top chunk)
```

### Phase 9: Hybrid Agent Routing

```
Test 1: "Combien font 2^8?"
→ Tool: calculate
→ Result: 256 ✅

Test 2: "Quel temps fait-il à Lyon?"
→ Tool: get_weather
→ Result: API called ✅

Test 3: "Qui a gagné la Coupe 2022?"
→ Tool: web_search
→ Result: "Argentina" ✅

Test 4: "Question quelconque"
→ Tool: NONE (direct response) ✅

Test 5: "Qu'est-ce que l'IA?"
→ Tool: rag_search
→ Result: Corpus privé ✅
```

---

## 🎯 Key Features

| Feature | Phase | Status |
|---------|-------|--------|
| Math calculations | 1 | ✅ |
| Real-time weather | 2 | ✅ |
| Web search | 3 | ✅ |
| Multi-tool orchestration | 4 | ✅ |
| Conversation memory | 4 | ✅ |
| Vector DB (Pinecone) | 5 | ✅ |
| Multi-provider embeddings | 6 | ✅ |
| Semantic search | 7 | ✅ |
| RAG pipeline | 8 | ✅ |
| **Hybrid agent (4-tools)** | **9** | **✅** |

---

## 🔒 Security

- `.env` file is gitignored (never commit API keys)
- `docs/` folder is gitignored (personal work only)
- All external APIs validated
- Input sanitization in all tools
- No credentials in code

---

## 📞 Support & Contact

- **GitHub**: [@MellGitson](https://github.com/MellGitson/Tools_ia)
- **Project**: Mini-Perplexity J3 - Hybrid AI Agent

---

## 📄 License

MIT - See LICENSE file

---

## 🎉 What's This Project?

A **complete AI agent system** demonstrating:

1. ✅ Multiple specialized tools (math, weather, web search)
2. ✅ Retrieval-Augmented Generation with private data (Pinecone)
3. ✅ Automatic tool selection via LLM (tool_choice='auto')
4. ✅ Production-ready architecture

**The Mini-Perplexity Stack** 🚀

```javascript
// One command to rule them all
npm run hybrid
```

Enjoy! 🚀
```

---

## 📄 Licence & Crédits

Projet IPSSI - ChatBot Multi-Provider  
Développé avec Node.js, Express et pdfkit

---

## 📞 Support

Pour toute question ou problème:
1. Vérifier la section Troubleshooting
2. Consulter les logs du serveur
3. Vérifier les configurations .env

---

**Dernière mise à jour:** 04/05/2026  
**Version:** 2.0 (Phases 1-9)
