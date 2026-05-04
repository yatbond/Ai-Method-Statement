import { NextResponse } from "next/server";
import IORedis from "ioredis";
import { db } from "@ams/database";
import { getDeploymentEnvReport } from "@ams/shared";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = getDeploymentEnvReport(process.env, "web");
  const checks: Array<{ name: string; ok: boolean; message?: string }> = [
    {
      name: "environment",
      ok: env.ok,
      message: env.ok
        ? undefined
        : [...env.missing, ...env.invalid].map((issue) => `${issue.key}: ${issue.message}`).join("; "),
    },
  ];

  try {
    await db.$queryRaw`SELECT 1`;
    checks.push({ name: "database", ok: true });
  } catch (error) {
    checks.push({
      name: "database",
      ok: false,
      message: error instanceof Error ? error.message : "Database check failed.",
    });
  }

  const redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 5_000,
    commandTimeout: 5_000,
  });

  try {
    await redis.connect();
    await redis.ping();
    checks.push({ name: "redis", ok: true });
  } catch (error) {
    checks.push({
      name: "redis",
      ok: false,
      message: error instanceof Error ? error.message : "Redis check failed.",
    });
  } finally {
    redis.disconnect();
  }

  const ok = checks.every((check) => check.ok);

  return NextResponse.json(
    {
      ok,
      service: "ams-web",
      checkedAt: new Date().toISOString(),
      checks,
      warnings: env.warnings,
    },
    { status: ok ? 200 : 503 }
  );
}
