import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getEmbedding, simpleChunk } from './embedding-multi-provider.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Upsert des vecteurs dans Pinecone par batch
 */
async function upsertToPinecone(vectors, batchSize = 50) {
  const apiKey = process.env.PINECONE_API_KEY;
  const indexHost = process.env.PINECONE_INDEX_HOST;
  const indexName = process.env.PINECONE_INDEX_NAME || 'mini-perplexity';

  if (!apiKey || !indexHost) {
    throw new Error('PINECONE_API_KEY ou PINECONE_INDEX_HOST non configurés');
  }

  let totalUpserted = 0;

  for (let i = 0; i < vectors.length; i += batchSize) {
    const batch = vectors.slice(i, i + batchSize);
    
    try {
      const response = await fetch(`https://${indexHost}/vectors/upsert`, {
        method: 'POST',
        headers: {
          'Api-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vectors: batch,
          namespace: 'default',
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Erreur Pinecone ${response.status}: ${error}`);
      }

      totalUpserted += batch.length;
      console.log(`  Upsert ${Math.min(i + batchSize, vectors.length)}/${vectors.length} vecteurs...`);
    } catch (error) {
      throw new Error(`Impossible d'upsert dans Pinecone: ${error.message}`);
    }
  }

  return totalUpserted;
}

/**
 * Indexe un fichier unique
 */
async function indexFile(filePath, fileName) {
  console.log(`\n→ Traitement de ${fileName}...`);

  try {
    // Lire le fichier
    const content = fs.readFileSync(filePath, 'utf-8');

    // Créer les chunks (300 mots max par chunk, réduit de 500 pour meilleure granularité)
    // Note: simpleChunk fonctionne en MOTS, pas en tokens
    // ~1 token ≈ 0.75 mots, donc 300 mots ≈ 400 tokens
    const chunks = simpleChunk(content, 300);
    console.log(`  ${chunks.length} chunks créés`);

    // Créer les embeddings et préparer les vecteurs
    const vectors = [];
    for (let i = 0; i < chunks.length; i++) {
      const embedding = await getEmbedding(chunks[i]);
      vectors.push({
        id: `${fileName}-chunk-${i}-${Date.now()}`,
        values: embedding,
        metadata: {
          text: chunks[i].substring(0, 1000),
          file: fileName,
          chunk: i,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Upsert par batch
    await upsertToPinecone(vectors, 50);
    console.log(`  ✓ ${chunks.length} vecteurs indexés`);

    return chunks.length;
  } catch (error) {
    console.error(`  ✗ Erreur lors du traitement de ${fileName}: ${error.message}`);
    return 0;
  }
}

/**
 * Indexe tous les fichiers d'un répertoire
 */
async function indexDirectory(dirPath) {
  console.log('\n🔍 Indexation de fichiers');
  console.log('='.repeat(80));

  try {
    // Vérifier que le répertoire existe
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Le répertoire ${dirPath} n'existe pas`);
    }

    // Lister les fichiers texte
    const files = fs
      .readdirSync(dirPath)
      .filter((file) => file.endsWith('.txt'))
      .sort();

    if (files.length === 0) {
      console.log('❌ Aucun fichier .txt trouvé dans le répertoire');
      return;
    }

    console.log(`\nIndexation de ${files.length} fichiers dans l'index "mini-perplexity"\n`);

    let totalVectors = 0;

    // Traiter chaque fichier
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const vectorCount = await indexFile(filePath, file);
      totalVectors += vectorCount;
    }

    console.log('\n' + '='.repeat(80));
    console.log(`✅ Indexation terminée. ${totalVectors} vecteurs au total.\n`);
  } catch (error) {
    console.error(`\n❌ Erreur: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Indexe des fichiers spécifiques
 */
async function indexFiles(filePaths) {
  console.log('\n🔍 Indexation de fichiers');
  console.log('='.repeat(80));

  console.log(`\nIndexation de ${filePaths.length} fichiers dans l'index "mini-perplexity"\n`);

  let totalVectors = 0;

  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) {
      console.log(`\n⚠️  Fichier non trouvé: ${filePath}`);
      continue;
    }

    const fileName = path.basename(filePath);
    const vectorCount = await indexFile(filePath, fileName);
    totalVectors += vectorCount;
  }

  console.log('\n' + '='.repeat(80));
  console.log(`✅ Indexation terminée. ${totalVectors} vecteurs au total.\n`);
}

// Main
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Mode répertoire (par défaut)
    const dataDir = path.join(__dirname, '../data');
    await indexDirectory(dataDir);
  } else {
    // Mode fichiers spécifiques
    await indexFiles(args);
  }
}

main().catch((error) => {
  console.error(`\n❌ Erreur critique: ${error.message}`);
  process.exit(1);
});
