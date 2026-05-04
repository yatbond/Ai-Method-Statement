import { REQUIRED_EMBEDDING_MODEL } from "./constants";

type Env = Record<string, string | undefined>;

export interface DeploymentEnvIssue {
  key: string;
  message: string;
}

export interface DeploymentEnvReport {
  ok: boolean;
  missing: DeploymentEnvIssue[];
  invalid: DeploymentEnvIssue[];
  warnings: DeploymentEnvIssue[];
}

export type DeploymentTarget = "web" | "worker";

export function getDeploymentEnvReport(
  env: Env,
  target: DeploymentTarget
): DeploymentEnvReport {
  const missing: DeploymentEnvIssue[] = [];
  const invalid: DeploymentEnvIssue[] = [];
  const warnings: DeploymentEnvIssue[] = [];
  const isProduction = env.NODE_ENV === "production";

  requireOne(env, missing, ["DATABASE_URL"], "PostgreSQL connection string is required.");
  requireOne(env, missing, ["REDIS_URL"], "Redis connection string is required for BullMQ queues.");

  if (target === "web") {
    requireOne(env, missing, ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"], "Clerk publishable key is required.");
    requireOne(env, missing, ["CLERK_SECRET_KEY"], "Clerk secret key is required.");
  }

  const storageProvider = (env.STORAGE_PROVIDER ?? (isProduction ? "" : "local")).toLowerCase();
  if (!storageProvider) {
    missing.push({
      key: "STORAGE_PROVIDER",
      message: "Set STORAGE_PROVIDER=s3 for hosted deployments.",
    });
  } else if (isProduction && storageProvider !== "s3") {
    invalid.push({
      key: "STORAGE_PROVIDER",
      message: "Hosted production deployments must use STORAGE_PROVIDER=s3.",
    });
  }

  if (storageProvider === "s3") {
    requireOne(env, missing, ["AWS_S3_BUCKET", "STORAGE_BUCKET"], "S3/R2 bucket name is required.");
    requireOne(env, missing, ["AWS_ACCESS_KEY_ID", "CLOUDFLARE_R2_ACCESS_KEY_ID"], "S3/R2 access key is required.");
    requireOne(env, missing, ["AWS_SECRET_ACCESS_KEY", "CLOUDFLARE_R2_SECRET_ACCESS_KEY"], "S3/R2 secret key is required.");
    requireOne(
      env,
      missing,
      ["S3_ENDPOINT", "STORAGE_ENDPOINT", "CLOUDFLARE_R2_ACCOUNT_ID"],
      "S3/R2 endpoint or Cloudflare account ID is required."
    );
  }

  requireOne(env, missing, ["GOOGLE_AI_API_KEY", "GOOGLE_API_KEY"], "Google AI key is required for Gemini embeddings.");
  if (env.GEMINI_EMBEDDING_MODEL && env.GEMINI_EMBEDDING_MODEL !== REQUIRED_EMBEDDING_MODEL) {
    invalid.push({
      key: "GEMINI_EMBEDDING_MODEL",
      message: `Must be ${REQUIRED_EMBEDDING_MODEL} to satisfy the multimodal retrieval requirement.`,
    });
  }

  const llmProvider = (env.LLM_PROVIDER ?? "anthropic").toLowerCase();
  if (!["anthropic", "openai", "ollama"].includes(llmProvider)) {
    invalid.push({
      key: "LLM_PROVIDER",
      message: "Must be one of anthropic, openai, or ollama.",
    });
  } else if (llmProvider === "anthropic") {
    requireOne(env, missing, ["ANTHROPIC_API_KEY"], "Anthropic API key is required for Anthropic drafting.");
  } else if (llmProvider === "openai") {
    requireOne(env, missing, ["OPENAI_API_KEY"], "OpenAI API key is required for OpenAI drafting.");
  } else if (llmProvider === "ollama") {
    requireOne(env, missing, ["OLLAMA_API_KEY"], "Ollama API key is required by the current Ollama drafting client.");
    requireOne(env, missing, ["OLLAMA_MODEL"], "Ollama drafting model is required.");
    if (isProduction) {
      requireOne(env, missing, ["OLLAMA_BASE_URL"], "Ollama base URL is required in hosted production.");
    }
  }

  const documentAIProvider = (env.DOCUMENT_AI_PROVIDER ?? "native").toLowerCase();
  if (!["native", "gemini", "ollama", "openrouter", "zai"].includes(documentAIProvider)) {
    invalid.push({
      key: "DOCUMENT_AI_PROVIDER",
      message: "Must be one of native, gemini, ollama, openrouter, or zai.",
    });
  } else if (documentAIProvider === "native") {
    if (isProduction) {
      warnings.push({
        key: "DOCUMENT_AI_PROVIDER",
        message: "Native PDF parsing is configured; scanned PDFs and table/diagram-heavy PDFs will need OCR.",
      });
    }
  } else {
    requireOne(env, missing, ["DOCUMENT_AI_MODEL"], "Document AI model is required.");
    if (["gemini", "openrouter", "zai"].includes(documentAIProvider)) {
      requireOne(env, missing, ["DOCUMENT_AI_API_KEY"], "Document AI API key is required.");
    }
    if (isProduction && ["ollama", "openrouter", "zai"].includes(documentAIProvider)) {
      requireOne(env, missing, ["DOCUMENT_AI_BASE_URL"], "Document AI base URL is required in hosted production.");
    }
  }

  return {
    ok: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
    warnings,
  };
}

function requireOne(
  env: Env,
  missing: DeploymentEnvIssue[],
  keys: string[],
  message: string
) {
  if (keys.some((key) => Boolean(env[key]))) return;
  missing.push({ key: keys.join(" or "), message });
}
