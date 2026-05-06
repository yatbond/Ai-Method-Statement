#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const nonInteractive = args.has("--non-interactive");
const skipDeploy = args.has("--skip-deploy");
const resetFailedMigration = args.has("--reset-failed-migration");
const runMigrate = !args.has("--skip-migrate");

const defaults = {
  environment: process.env.RAILWAY_ENVIRONMENT || "production",
  webService: process.env.RAILWAY_WEB_SERVICE || "ams-web",
  workerService: process.env.RAILWAY_WORKER_SERVICE || "ams-worker",
  postgresService: process.env.RAILWAY_POSTGRES_SERVICE || "Postgres",
  redisService: process.env.RAILWAY_REDIS_SERVICE || "Redis",
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://ams-web-production.up.railway.app",
  bucket: process.env.AWS_S3_BUCKET || "ai-method-statement",
  r2AccountId: process.env.CLOUDFLARE_R2_ACCOUNT_ID || "",
  r2Endpoint: process.env.S3_ENDPOINT || "",
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "https://ollama.com/v1",
  ollamaModel: process.env.OLLAMA_MODEL || "kimi-k2.6:cloud",
  documentAiBaseUrl: process.env.DOCUMENT_AI_BASE_URL || "https://api.z.ai/api/paas/v4",
  documentAiModel: process.env.DOCUMENT_AI_MODEL || "glm-ocr",
  geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL || "text-embedding-004",
  defaultOrganisationId: process.env.DEFAULT_ORGANISATION_ID || "default",
};

function printHelp() {
  console.log(`Railway bootstrap for AI Method Statement Studio

Usage:
  pnpm railway:bootstrap              # collect values and show a dry-run plan
  pnpm railway:bootstrap -- --apply   # set variables, run migrations, redeploy

Options:
  --apply                    Apply variables through Railway CLI
  --non-interactive          Read values from environment variables only
  --reset-failed-migration   Drop _prisma_migrations first (fresh DB recovery only)
  --skip-migrate             Do not run pnpm railway:migrate through Railway CLI
  --skip-deploy              Do not redeploy web/worker services

Required local tool for --apply:
  railway CLI, logged in and linked to the correct project

Secret prompts are hidden locally. Secret values are sent to Railway over stdin,
not as command-line arguments.
`);
}

if (args.has("--help") || args.has("-h")) {
  printHelp();
  process.exit(0);
}

function run(command, commandArgs, options = {}) {
  return spawnSync(command, commandArgs, {
    encoding: "utf8",
    stdio: options.stdio || "pipe",
    input: options.input,
    shell: false,
  });
}

function requireCommand(command, installHint) {
  const check = run("bash", ["-lc", `command -v ${command}`]);
  if (check.status !== 0) {
    throw new Error(`${command} is not installed. ${installHint}`);
  }
}

function isSecretKey(key) {
  return /SECRET|API_KEY|PASSWORD|TOKEN|WEBHOOK/i.test(key) && key !== "AWS_ACCESS_KEY_ID";
}

function visibleValue(key, value) {
  if (!value) return "<empty>";
  return isSecretKey(key) ? "********" : value;
}

async function prompt(question, defaultValue = "") {
  if (nonInteractive) return defaultValue;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  return await new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

async function promptSecret(question, envKey, required = true) {
  const existing = process.env[envKey] || "";
  if (nonInteractive) return existing;

  const mutedOutput = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output: mutedOutput, terminal: true });
  const suffix = existing ? " [from env, press Enter to keep]" : required ? "" : " [optional]";
  process.stdout.write(`${question}${suffix}: `);
  const answer = await new Promise((resolve) => {
    rl.question("", (value) => {
      rl.close();
      process.stdout.write("\n");
      resolve(value.trim());
    });
  });
  return answer || existing;
}

function required(name, value) {
  if (!value) throw new Error(`Missing required value: ${name}`);
  return value;
}

function ref(service, key) {
  return `\${{${service}.${key}}}`;
}

function r2EndpointFrom(accountId, explicitEndpoint) {
  if (explicitEndpoint) return explicitEndpoint;
  return accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "";
}

async function collectConfig() {
  const environment = await prompt("Railway environment", defaults.environment);
  const webService = await prompt("Railway web service name", defaults.webService);
  const workerService = await prompt("Railway worker service name", defaults.workerService);
  const postgresService = await prompt("Railway Postgres service name", defaults.postgresService);
  const redisService = await prompt("Railway Redis service name", defaults.redisService);
  const appUrl = await prompt("Public app URL", defaults.appUrl);

  const r2AccountId = await prompt("Cloudflare R2 account ID", defaults.r2AccountId);
  const r2Endpoint = r2EndpointFrom(r2AccountId, await prompt("R2 S3 endpoint", defaults.r2Endpoint));
  const bucket = await prompt("R2 bucket name", defaults.bucket);
  const awsAccessKeyId = await prompt("R2 Access Key ID / Client ID", process.env.AWS_ACCESS_KEY_ID || "");
  const awsSecretAccessKey = await promptSecret("R2 Secret Access Key / Client Secret", "AWS_SECRET_ACCESS_KEY");

  const googleAiApiKey = await promptSecret("Google/Gemini API key", "GOOGLE_AI_API_KEY");
  const documentAiApiKey = await promptSecret("Z.ai Document AI API key", "DOCUMENT_AI_API_KEY");
  const ollamaApiKey = await promptSecret("Ollama API key", "OLLAMA_API_KEY");

  const clerkPublishableKey = await prompt("Clerk publishable key", process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "");
  const clerkSecretKey = await promptSecret("Clerk secret key", "CLERK_SECRET_KEY");
  const clerkWebhookSecret = await promptSecret("Clerk webhook secret", "CLERK_WEBHOOK_SECRET", false);

  const imageGenEnabled = (await prompt("Enable image generation? true/false", process.env.IMAGE_GEN_ENABLED || "false")).toLowerCase();
  const imageGenProvider = await prompt("Image generation provider", process.env.IMAGE_GEN_PROVIDER || "gemini");
  const imageGenModel = await prompt("Image generation model", process.env.IMAGE_GEN_MODEL || "gemini-3.1-flash-image-preview");
  const imageGenApiKey =
    imageGenEnabled === "true" ? await promptSecret("Image generation API key", "IMAGE_GEN_API_KEY") : process.env.IMAGE_GEN_API_KEY || "";

  const common = {
    DATABASE_URL: ref(postgresService, "DATABASE_URL"),
    DIRECT_URL: ref(postgresService, "DATABASE_URL"),
    REDIS_URL: ref(redisService, "REDIS_URL"),
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    LOG_LEVEL: "info",
    STORAGE_PROVIDER: "s3",
    AWS_REGION: "auto",
    AWS_S3_BUCKET: required("R2 bucket name", bucket),
    AWS_ACCESS_KEY_ID: required("R2 Access Key ID", awsAccessKeyId),
    AWS_SECRET_ACCESS_KEY: required("R2 Secret Access Key", awsSecretAccessKey),
    S3_ENDPOINT: required("R2 S3 endpoint", r2Endpoint),
    S3_FORCE_PATH_STYLE: "false",
    GOOGLE_AI_API_KEY: required("Google/Gemini API key", googleAiApiKey),
    GEMINI_EMBEDDING_MODEL: defaults.geminiEmbeddingModel,
    DOCUMENT_AI_PROVIDER: "zai",
    DOCUMENT_AI_API_KEY: required("Z.ai Document AI API key", documentAiApiKey),
    DOCUMENT_AI_MODEL: defaults.documentAiModel,
    DOCUMENT_AI_BASE_URL: defaults.documentAiBaseUrl,
    LLM_PROVIDER: "ollama",
    LLM_MODEL: defaults.ollamaModel,
    OLLAMA_API_KEY: required("Ollama API key", ollamaApiKey),
    OLLAMA_MODEL: defaults.ollamaModel,
    OLLAMA_BASE_URL: defaults.ollamaBaseUrl,
    IMAGE_GEN_ENABLED: imageGenEnabled === "true" ? "true" : "false",
    IMAGE_GEN_PROVIDER: imageGenProvider,
    IMAGE_GEN_MODEL: imageGenModel,
  };

  if (imageGenApiKey) common.IMAGE_GEN_API_KEY = imageGenApiKey;

  const web = {
    ...common,
    OTEL_SERVICE_NAME: "ai-method-statement-web",
    DEFAULT_ORGANISATION_ID: defaults.defaultOrganisationId,
    NEXT_PUBLIC_APP_URL: required("Public app URL", appUrl),
    APP_URL: appUrl,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: required("Clerk publishable key", clerkPublishableKey),
    CLERK_SECRET_KEY: required("Clerk secret key", clerkSecretKey),
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/login",
    NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: "/dashboard",
    NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: "/dashboard",
  };
  if (clerkWebhookSecret) web.CLERK_WEBHOOK_SECRET = clerkWebhookSecret;

  const worker = {
    ...common,
    OTEL_SERVICE_NAME: "ai-method-statement-worker",
  };

  return { environment, webService, workerService, web, worker };
}

function printPlan(config) {
  console.log("\nVariables to set:\n");
  for (const [serviceName, vars] of [
    [config.webService, config.web],
    [config.workerService, config.worker],
  ]) {
    console.log(`Service: ${serviceName}`);
    for (const [key, value] of Object.entries(vars).sort(([a], [b]) => a.localeCompare(b))) {
      console.log(`  ${key}=${visibleValue(key, value)}`);
    }
    console.log("");
  }
}

function setVariable(service, environment, key, value) {
  const result = run("railway", ["variables", "set", key, "--stdin", "--service", service, "--environment", environment, "--skip-deploys"], {
    input: value,
  });
  if (result.status !== 0) {
    throw new Error(`Failed to set ${key} on ${service}:\n${result.stderr || result.stdout}`);
  }
}

function railwayRun(service, environment, commandArgs, input) {
  const result = run("railway", ["run", "--service", service, "--environment", environment, "--", ...commandArgs], {
    stdio: input ? "pipe" : "inherit",
    input,
  });
  if (result.status !== 0) {
    const details = input ? `\n${result.stderr || result.stdout}` : "";
    throw new Error(`railway run failed for ${service}: ${commandArgs.join(" ")}${details}`);
  }
}

function redeploy(service) {
  const result = run("railway", ["redeploy", "--service", service, "--yes"], { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Failed to redeploy ${service}.`);
}

async function main() {
  const config = await collectConfig();
  printPlan(config);

  if (!apply) {
    console.log("Dry run only. Re-run with: pnpm railway:bootstrap -- --apply");
    return;
  }

  requireCommand("railway", "Install it with: npm i -g @railway/cli, then run railway login and railway link.");

  console.log("Setting Railway variables...");
  for (const [key, value] of Object.entries(config.web)) setVariable(config.webService, config.environment, key, value);
  for (const [key, value] of Object.entries(config.worker)) setVariable(config.workerService, config.environment, key, value);

  if (resetFailedMigration) {
    console.log("Dropping _prisma_migrations through Railway run. Use this only for fresh DB recovery.");
    railwayRun(
      config.webService,
      config.environment,
      ["pnpm", "--filter", "@ams/database", "prisma", "db", "execute", "--schema", "prisma/schema.prisma", "--stdin"],
      'DROP TABLE IF EXISTS "_prisma_migrations";\n'
    );
  }

  if (runMigrate) {
    console.log("Running Prisma migrations through Railway...");
    railwayRun(config.webService, config.environment, ["pnpm", "railway:migrate"]);
  }

  if (!skipDeploy) {
    console.log("Redeploying services...");
    redeploy(config.webService);
    redeploy(config.workerService);
  }

  console.log("\nBootstrap complete. Check Railway logs, then open /api/health and /dashboard.");
}

main().catch((error) => {
  console.error(`\nBootstrap failed: ${error.message}`);
  process.exit(1);
});
