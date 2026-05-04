// =============================================================================
// LLM provider abstraction (REQ-EVAL-001, Architecture §9.2)
//
// Provider-agnostic; swap requires only a new adapter and eval-harness pass.
// Anthropic Claude is the default. Usage is logged per call.
// =============================================================================

import type { LLMRequest, LLMResponse } from "@ams/shared";

export interface LLMProvider {
  complete(request: LLMRequest): Promise<LLMResponse>;
  readonly provider: string;
  readonly model: string;
}

// ── Anthropic Claude (default) ────────────────────────────────────────────────

export class AnthropicLLMProvider implements LLMProvider {
  readonly provider = "anthropic";
  readonly model: string;

  private readonly apiKey: string;

  constructor(apiKey: string, model = "claude-sonnet-4-6") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: this.apiKey });

    const systemMessage = request.messages.find((m) => m.role === "system");
    const userMessages = request.messages.filter((m) => m.role !== "system");

    const response = await client.messages.create({
      model: this.model,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.3,
      system: systemMessage?.content,
      messages: userMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      stop_sequences: request.stopSequences,
    });

    const content =
      response.content[0].type === "text" ? response.content[0].text : "";

    return {
      content,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      provider: this.provider,
      model: this.model,
    };
  }
}

// ── OpenAI (alternative) ──────────────────────────────────────────────────────

export class OpenAILLMProvider implements LLMProvider {
  readonly provider = "openai";
  readonly model: string;

  private readonly apiKey: string;
  private readonly baseURL?: string;

  constructor(apiKey: string, model = "gpt-4o", baseURL?: string) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseURL = baseURL;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: this.apiKey, ...(this.baseURL && { baseURL: this.baseURL }) });

    const response = await client.chat.completions.create({
      model: this.model,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.3,
      messages: request.messages,
      stop: request.stopSequences,
    });

    const content = normalizeOpenAIContent(response.choices[0]?.message);

    return {
      content,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
      provider: this.provider,
      model: this.model,
    };
  }
}

// ── Ollama Cloud (OpenAI-compatible) ──────────────────────────────────────────

export class OllamaLLMProvider implements LLMProvider {
  readonly provider = "ollama";
  readonly model: string;

  private readonly apiKey: string;
  private readonly baseURL: string;

  constructor(apiKey: string, model: string, baseURL = "https://ollama.com/v1") {
    this.apiKey = apiKey;
    this.model = model;
    this.baseURL = baseURL;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: this.apiKey, baseURL: this.baseURL });

    const response = await client.chat.completions.create({
      model: this.model,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.3,
      messages: request.messages,
      stop: request.stopSequences,
      reasoning_effort: "none" as any,
    });

    const content = normalizeOpenAIContent(response.choices[0]?.message);

    return {
      content,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
      provider: this.provider,
      model: this.model,
    };
  }
}

function normalizeOpenAIContent(message: any): string {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        if (typeof part?.content === "string") return part.content;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (typeof message?.reasoning_content === "string") return message.reasoning_content;
  if (typeof message?.reasoning === "string") return message.reasoning;
  return "";
}

// ── Provider factory ──────────────────────────────────────────────────────────

export function createLLMProvider(config: {
  provider?: "anthropic" | "openai" | "ollama";
  apiKey: string;
  model?: string;
  baseURL?: string;
}): LLMProvider {
  const { provider = "anthropic", apiKey, model } = config;

  switch (provider) {
    case "anthropic":
      return new AnthropicLLMProvider(apiKey, model);
    case "openai":
      return new OpenAILLMProvider(apiKey, model, config.baseURL);
    case "ollama":
      if (!model) throw new Error("OLLAMA_MODEL is required when using Ollama provider");
      return new OllamaLLMProvider(apiKey, model, config.baseURL);
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

// ── Shared config helper — resolves LLM settings from env vars ────────────────

export function getLLMConfigFromEnv(): {
  provider: "anthropic" | "openai" | "ollama";
  apiKey: string;
  model?: string;
  baseURL?: string;
} {
  const provider = (process.env.LLM_PROVIDER as "anthropic" | "openai" | "ollama") ?? "anthropic";

  switch (provider) {
    case "ollama": {
      const apiKey = process.env.OLLAMA_API_KEY ?? "";
      if (!apiKey) throw new Error("OLLAMA_API_KEY not configured");
      return {
        provider,
        apiKey,
        model: process.env.OLLAMA_MODEL,
        baseURL: process.env.OLLAMA_BASE_URL,
      };
    }
    case "openai": {
      const apiKey = process.env.OPENAI_API_KEY ?? "";
      if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
      return { provider, apiKey, model: process.env.LLM_MODEL };
    }
    default: {
      const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
      return { provider, apiKey, model: process.env.LLM_MODEL };
    }
  }
}

// ── System prompts (P1–P6 principles) ────────────────────────────────────────

export const DRAFTING_SYSTEM_PROMPT = `You are the AI Method Statement Studio drafting engine for a construction company.

CRITICAL RULES — you must follow all of these without exception:

1. NO SILENT ASSUMPTION: When you need information you do not have, you must output a gap marker [GAP: description] and NOT fabricate any answer.

2. SOURCE AUTHORITY: Only assert technical facts that are traceable to:
   - Current project documents (rank 1–5)
   - User-confirmed answers (rank 6)
   - Approved historical method statements (rank 7) — ONLY after user confirmation
   - Company standard clauses (rank 8)
   Never use AI general knowledge (rank 9) to assert technical facts, quantities, capacities, sequences, code references, or drawing numbers.

3. REFUSAL OVER FABRICATION: If source material is insufficient, output [GAP: insufficient source] rather than inventing plausible content.

4. SPECIFICITY: Avoid generic phrases like "as required", "appropriate PPE", "suitable equipment". If you cannot be specific, output [GAP: needs specific detail].

5. TRACEABILITY: Append a source reference [SRC:passage_id] after every sentence that draws on a specific source passage.

6. EDITABILITY: Produce content in structured markdown. Tables must be proper markdown tables, never described in prose.

You are producing content for a construction method statement. The output will be reviewed by qualified engineers and safety officers before submission to a client. Accuracy is more important than fluency.`;
