import dns from "dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);
import { getServerEnv } from "@/lib/env";
import { resolveBillingPlan } from "@/lib/billing/resolver";
import https from "https";

export interface PayPalAccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface PayPalSubscriptionResponse {
  id: string;
  status: string;
  create_time: string;
  links: {
    href: string;
    rel: string;
    method: string;
  }[];
}

function getPayPalUrl(path: string): string {
  const env = getServerEnv();
  const baseUrl =
    env.NEXT_PUBLIC_PAYPAL_ENV === "production"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";
  return `${baseUrl}${path}`;
}

/**
 * Fetches the PayPal OAuth2 access token
 */
export async function getPayPalAccessToken(): Promise<string> {
  const env = getServerEnv();
  const clientId = env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const clientSecret = env.PAYPAL_CLIENT_SECRET;
  console.log("=== PAYPAL DEBUG ===");
  console.log("ENV:", env.NEXT_PUBLIC_PAYPAL_ENV);
  console.log(
    "CLIENT ID:",
    clientId ? `${clientId.slice(0, 15)}...` : "MISSING",
  );
  console.log("SECRET LENGTH:", clientSecret?.length ?? 0);
  console.log("====================");
  console.log("FETCH URL:", getPayPalUrl("/v1/oauth2/token"));

  const dnsPromises = await import("dns/promises");

  try {
    const result = await dnsPromises.resolve4("api-m.sandbox.paypal.com");

    console.log("DNS RESOLVE SUCCESS:", result);
  } catch (err) {
    console.error("DNS RESOLVE FAILED:", err);
  }
  console.log("NODE VERSION:", process.version);
  console.log("DNS SERVERS:", dns.getServers());
  console.log("NEXT RUNTIME:", process.env.NEXT_RUNTIME);
  if (!clientId || !clientSecret) {
    throw new Error("PayPal credentials are not configured");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64",
  );
  try {
    https
      .get("https://api-m.sandbox.paypal.com/v1/oauth2/token", (res) => {
        console.log("HTTPS TEST STATUS:", res.statusCode);
      })
      .on("error", console.error);
  } catch (e) {
    console.error(e);
  }
  const response = await fetch(getPayPalUrl("/v1/oauth2/token"), {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to retrieve PayPal access token: ${response.statusText} - ${errorText}`,
    );
  }

  const data: PayPalAccessTokenResponse = await response.json();
  return data.access_token;
}

/**
 * Creates a subscription in PayPal
 */
export async function createPayPalSubscription(
  userId: string,
  userEmail: string,
  returnUrl: string,
  cancelUrl: string,
  interval: "monthly" | "annual" = "monthly",
): Promise<PayPalSubscriptionResponse> {
  const planId = resolveBillingPlan("paypal", interval);

  if (!planId) {
    throw new Error(`PayPal Pro Plan ID for interval ${interval} is not configured`);
  }

  const token = await getPayPalAccessToken();

  const response = await fetch(getPayPalUrl("/v1/billing/subscriptions"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      plan_id: planId,
      custom_id: userId, // Carry user ID through webhook payload
      subscriber: {
        email_address: userEmail,
      },
      application_context: {
        brand_name: "Flashtar",
        locale: "en-US",
        shipping_preference: "NO_SHIPPING",
        user_action: "SUBSCRIBE_NOW",
        payment_method: {
          payer_selected: "PAYPAL",
          payee_preferred: "IMMEDIATE_PAYMENT_REQUIRED",
        },
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to create PayPal subscription: ${response.statusText} - ${errorText}`,
    );
  }

  return response.json();
}

/**
 * Cancels a subscription in PayPal
 */
export async function cancelPayPalSubscription(
  subscriptionId: string,
  reason = "User requested cancellation",
): Promise<{ success: boolean; error?: string }> {
  try {
    const token = await getPayPalAccessToken();

    const response = await fetch(
      getPayPalUrl(`/v1/billing/subscriptions/${subscriptionId}/cancel`),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason,
        }),
      },
    );

    if (!response.ok && response.status !== 204) {
      const errorText = await response.text();
      return {
        success: false,
        error: `PayPal error: ${response.statusText} - ${errorText}`,
      };
    }

    return { success: true };
  } catch (error) {
    console.error("PayPal cancellation failed:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "PayPal cancellation failed",
    };
  }
}

/**
 * Retrieves details for a subscription in PayPal
 */
export async function getPayPalSubscription(
  subscriptionId: string,
): Promise<unknown> {
  const token = await getPayPalAccessToken();

  const response = await fetch(
    getPayPalUrl(`/v1/billing/subscriptions/${subscriptionId}`),
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch PayPal subscription: ${response.statusText} - ${errorText}`,
    );
  }

  return response.json();
}

/**
 * Verifies PayPal webhook signature authenticity
 */
export async function verifyPayPalWebhook(
  headers: Record<string, string | string[] | undefined>,
  body: string,
): Promise<boolean> {
  const env = getServerEnv();
  const webhookId = env.PAYPAL_WEBHOOK_ID;

  if (!webhookId) {
    console.warn("PAYPAL_WEBHOOK_ID is not configured, skipping verification.");
    return false;
  }

  try {
    const token = await getPayPalAccessToken();

    // Map headers safely, ignoring case
    const getHeader = (key: string): string => {
      const val = headers[key.toLowerCase()] || headers[key];
      return Array.isArray(val) ? val[0] : val || "";
    };

    const authAlgo = getHeader("PAYPAL-AUTH-ALGO");
    const certUrl = getHeader("PAYPAL-CERT-URL");
    const transmissionId = getHeader("PAYPAL-TRANSMISSION-ID");
    const transmissionSig = getHeader("PAYPAL-TRANSMISSION-SIG");
    const transmissionTime = getHeader("PAYPAL-TRANSMISSION-TIME");

    if (
      !authAlgo ||
      !certUrl ||
      !transmissionId ||
      !transmissionSig ||
      !transmissionTime
    ) {
      console.warn(
        "PayPal webhook verification failed: Missing required verification headers",
      );
      return false;
    }

    const payload = {
      transmission_id: transmissionId,
      transmission_time: transmissionTime,
      cert_url: certUrl,
      auth_algo: authAlgo,
      transmission_sig: transmissionSig,
      webhook_id: webhookId,
      webhook_event: JSON.parse(body),
    };

    const response = await fetch(
      getPayPalUrl("/v1/notifications/verify-webhook-signature"),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `PayPal verification request failed: ${response.statusText} - ${errorText}`,
      );
      return false;
    }

    const data = await response.json();
    return data.verification_status === "SUCCESS";
  } catch (error) {
    console.error("PayPal webhook verification exception:", error);
    return false;
  }
}
