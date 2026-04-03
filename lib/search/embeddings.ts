import { GoogleGenerativeAI } from "@google/generative-ai";

import { getUniqueTagNames } from "@/lib/tags";

const EMBEDDING_MODEL =
  process.env.GOOGLE_EMBEDDING_MODEL || "text-embedding-004";
const MAX_EMBEDDING_TEXT_LENGTH = 6000;

let embeddingClient: GoogleGenerativeAI | null = null;

function getEmbeddingClient() {
  if (!process.env.GOOGLE_API_KEY) return null;

  if (!embeddingClient) {
    embeddingClient = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  }

  return embeddingClient;
}

function sanitizeEmbeddingText(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_[\](){}-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_EMBEDDING_TEXT_LENGTH);
}

export function buildQuestionEmbeddingText({
  title,
  content,
  tags,
}: CreateQuestionParams) {
  const normalizedTags = getUniqueTagNames(tags);

  return sanitizeEmbeddingText(
    [title, content, normalizedTags.join(" ")].filter(Boolean).join("\n")
  );
}

export async function generateQuestionEmbedding(params: CreateQuestionParams) {
  const embeddingText = buildQuestionEmbeddingText(params);
  const client = getEmbeddingClient();

  if (!client || !embeddingText) {
    return {
      embedding: undefined,
      embeddingText,
      embeddingModel: undefined,
      embeddingUpdatedAt: undefined,
    };
  }

  try {
    const model = client.getGenerativeModel({ model: EMBEDDING_MODEL });
    const result = await model.embedContent(embeddingText);

    return {
      embedding: result.embedding.values,
      embeddingText,
      embeddingModel: EMBEDDING_MODEL,
      embeddingUpdatedAt: new Date(),
    };
  } catch (error) {
    console.error("[Question Embeddings] Failed to generate embedding:", error);

    return {
      embedding: undefined,
      embeddingText,
      embeddingModel: undefined,
      embeddingUpdatedAt: undefined,
    };
  }
}

export async function generateSearchEmbedding(query: string) {
  const embeddingText = sanitizeEmbeddingText(query);
  const client = getEmbeddingClient();

  if (!client || !embeddingText) return null;

  try {
    const model = client.getGenerativeModel({ model: EMBEDDING_MODEL });
    const result = await model.embedContent(embeddingText);

    return result.embedding.values;
  } catch (error) {
    console.error("[Question Search] Failed to embed query:", error);
    return null;
  }
}
