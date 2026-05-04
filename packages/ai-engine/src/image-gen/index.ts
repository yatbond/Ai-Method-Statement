// =============================================================================
// Image generation provider abstraction (Phase P12 — v1.2)
//
// Pluggable provider for generating diagrams, site layout illustrations,
// safety zone visuals, and other construction-related imagery.
// =============================================================================

export interface ImageGenRequest {
  prompt: string;
  width?: number;
  height?: number;
  style?: "technical" | "photorealistic" | "diagram";
}

export interface ImageGenResult {
  imageData: Buffer;
  mimeType: string;
  provider: string;
  model: string;
  revisedPrompt?: string;
}

export interface ImageGenProvider {
  generate(request: ImageGenRequest): Promise<ImageGenResult>;
  readonly provider: string;
  readonly model: string;
}

// ── OpenAI (DALL-E) ───────────────────────────────────────────────────────────

export class OpenAIImageGenProvider implements ImageGenProvider {
  readonly provider = "openai";
  readonly model: string;

  private readonly apiKey: string;

  constructor(apiKey: string, model = "gpt-image-1") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generate(request: ImageGenRequest): Promise<ImageGenResult> {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: this.apiKey });

    const styleMap: Record<string, string> = {
      technical: "vivid",
      photorealistic: "natural",
      diagram: "vivid",
    };

    if (this.model === "dall-e-3") {
      const response = await client.images.generate({
        model: this.model,
        prompt: request.prompt,
        size: this.resolveSize(request),
        quality: "hd",
        style: (styleMap[request.style ?? "technical"] ?? "vivid") as "vivid" | "natural",
        response_format: "b64_json",
      });

      const data = response.data?.[0];
      if (!data?.b64_json) {
        throw new Error("OpenAI image generation returned no image data");
      }
      return {
        imageData: Buffer.from(data.b64_json, "base64"),
        mimeType: "image/png",
        provider: this.provider,
        model: this.model,
        revisedPrompt: data.revised_prompt ?? undefined,
      };
    }

    // gpt-image-1 or newer models
    const response = await client.images.generate({
      model: this.model,
      prompt: request.prompt,
      size: this.resolveSize(request),
      quality: "high",
      response_format: "b64_json",
    });

    const data = response.data?.[0] as any;
    if (!data?.b64_json) {
      throw new Error("OpenAI image generation returned no image data");
    }
    return {
      imageData: Buffer.from(data.b64_json, "base64"),
      mimeType: "image/png",
      provider: this.provider,
      model: this.model,
      revisedPrompt: (data as any).revised_prompt ?? undefined,
    };
  }

  private resolveSize(request: ImageGenRequest): "1024x1024" | "1536x1024" | "1024x1536" {
    if (request.width && request.height) {
      if (request.width > request.height) return "1536x1024";
      if (request.height > request.width) return "1024x1536";
    }
    return "1024x1024";
  }
}

// ── Gemini (Imagen) ───────────────────────────────────────────────────────────

export class GeminiImageGenProvider implements ImageGenProvider {
  readonly provider = "gemini";
  readonly model: string;

  private readonly apiKey: string;

  constructor(apiKey: string, model = "imagen-3.0-generate-002") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generate(request: ImageGenRequest): Promise<ImageGenResult> {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: this.apiKey });

    const response = await ai.models.generateImages({
      model: this.model,
      prompt: request.prompt,
      config: {
        numberOfImages: 1,
      },
    });

    const image = response.generatedImages?.[0];
    if (!image?.image?.imageBytes) {
      throw new Error("Gemini image generation returned no image data");
    }

    return {
      imageData: Buffer.from(image.image.imageBytes, "base64"),
      mimeType: "image/png",
      provider: this.provider,
      model: this.model,
    };
  }
}

// ── Ollama Cloud (OpenAI-compatible) ──────────────────────────────────────────

export class OllamaImageGenProvider implements ImageGenProvider {
  readonly provider = "ollama";
  readonly model: string;

  private readonly apiKey: string;
  private readonly baseURL: string;

  constructor(apiKey: string, model: string, baseURL = "https://ollama.com/v1") {
    this.apiKey = apiKey;
    this.model = model;
    this.baseURL = baseURL;
  }

  async generate(request: ImageGenRequest): Promise<ImageGenResult> {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: this.apiKey, baseURL: this.baseURL });

    const response = await client.images.generate({
      model: this.model,
      prompt: request.prompt,
      size: this.resolveSize(request),
      response_format: "b64_json",
    });

    const data = response.data?.[0];
    if (!data?.b64_json) {
      throw new Error("Ollama image generation returned no image data");
    }
    return {
      imageData: Buffer.from(data.b64_json, "base64"),
      mimeType: "image/png",
      provider: this.provider,
      model: this.model,
      revisedPrompt: data.revised_prompt ?? undefined,
    };
  }

  private resolveSize(request: ImageGenRequest): "1024x1024" | "1536x1024" | "1024x1536" {
    if (request.width && request.height) {
      if (request.width > request.height) return "1536x1024";
      if (request.height > request.width) return "1024x1536";
    }
    return "1024x1024";
  }
}

// ── OpenRouter (OpenAI-compatible) ────────────────────────────────────────────

export class OpenRouterImageGenProvider implements ImageGenProvider {
  readonly provider = "openrouter";
  readonly model: string;

  private readonly apiKey: string;
  private readonly baseURL: string;

  constructor(apiKey: string, model: string, baseURL = "https://openrouter.ai/api/v1") {
    this.apiKey = apiKey;
    this.model = model;
    this.baseURL = baseURL;
  }

  async generate(request: ImageGenRequest): Promise<ImageGenResult> {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseURL,
      defaultHeaders: {
        "HTTP-Referer": "https://ai-method-statement-studio.local",
        "X-Title": "AI Method Statement Studio",
      },
    });

    const response = await client.images.generate({
      model: this.model,
      prompt: request.prompt,
      size: this.resolveSize(request),
      response_format: "b64_json",
    });

    const data = response.data?.[0];
    if (!data?.b64_json) {
      throw new Error("OpenRouter image generation returned no image data");
    }
    return {
      imageData: Buffer.from(data.b64_json, "base64"),
      mimeType: "image/png",
      provider: this.provider,
      model: this.model,
      revisedPrompt: data.revised_prompt ?? undefined,
    };
  }

  private resolveSize(request: ImageGenRequest): "1024x1024" | "1536x1024" | "1024x1536" {
    if (request.width && request.height) {
      if (request.width > request.height) return "1536x1024";
      if (request.height > request.width) return "1024x1536";
    }
    return "1024x1024";
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

type ImageGenProviderType = "openai" | "gemini" | "ollama" | "openrouter";

export async function createImageGenProvider(config: {
  provider: ImageGenProviderType;
  apiKey: string;
  model?: string;
  baseURL?: string;
}): Promise<ImageGenProvider> {
  switch (config.provider) {
    case "openai":
      return new OpenAIImageGenProvider(config.apiKey, config.model);
    case "gemini":
      return new GeminiImageGenProvider(config.apiKey, config.model);
    case "ollama":
      return new OllamaImageGenProvider(config.apiKey, config.model ?? "flux", config.baseURL);
    case "openrouter":
      return new OpenRouterImageGenProvider(config.apiKey, config.model ?? "openai/dall-e-3", config.baseURL);
    default:
      throw new Error(`Unknown image generation provider: "${config.provider}"`);
  }
}

// ── Config helper ─────────────────────────────────────────────────────────────

export function getImageGenConfigFromEnv(): {
  enabled: boolean;
  provider: ImageGenProviderType;
  apiKey: string;
  model?: string;
  baseURL?: string;
} {
  const enabled = process.env.IMAGE_GEN_ENABLED === "true";
  const provider = (process.env.IMAGE_GEN_PROVIDER as ImageGenProviderType) ?? "openai";
  const apiKey = process.env.IMAGE_GEN_API_KEY ?? "";
  const model = process.env.IMAGE_GEN_MODEL;
  const baseURL = process.env.IMAGE_GEN_BASE_URL;

  return { enabled, provider, apiKey, model, baseURL };
}
