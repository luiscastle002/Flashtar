import { Paddle, Environment } from "@paddle/paddle-node-sdk";
import { getServerEnv } from "@/lib/env";

let paddleInstance: Paddle | null = null;

export function getPaddle(): Paddle {
  if (!paddleInstance) {
    const env = getServerEnv();
    if (!env.PADDLE_API_KEY) {
      throw new Error("PADDLE_API_KEY is not configured");
    }
    paddleInstance = new Paddle(env.PADDLE_API_KEY, {
      environment: env.NEXT_PUBLIC_PADDLE_ENV === "production" ? Environment.production : Environment.sandbox,
    });
  }
  return paddleInstance;
}
