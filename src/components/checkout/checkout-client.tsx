"use client";

import { useEffect, useRef, useState } from "react";
import { initializePaddle, Paddle } from "@paddle/paddle-js";
import { Loader2, RefreshCw } from "lucide-react";

interface CheckoutClientProps {
  priceId: string;
  userId: string;
  clientToken: string;
  paddleEnv: "sandbox" | "production";
  primaryAppUrl: string;
}

export function CheckoutClient({
  priceId,
  userId,
  clientToken,
  paddleEnv,
  primaryAppUrl,
}: CheckoutClientProps) {
  const [status, setStatus] = useState("loading"); // "loading" | "initialized" | "error"
  const paddleInstanceRef = useRef<Paddle | null>(null);
  const checkoutOpenedRef = useRef(false);

  useEffect(() => {
    let active = true;

    async function initPaddle() {
      try {
        if (checkoutOpenedRef.current) return;
        
        console.log("[Paddle Client] Initializing Paddle JS...");
        const paddle = await initializePaddle({
          environment: paddleEnv,
          token: clientToken,
          eventCallback: (event) => {
            console.log("[Paddle Client] Event:", event.name, event.data);
            if (event.name === "checkout.closed") {
              // User closed overlay without completing payment
              window.location.href = `${primaryAppUrl}/plan?checkout=canceled`;
            } else if (event.name === "checkout.completed") {
              // Payment completed, redirect to success
              window.location.href = `${primaryAppUrl}/plan?checkout=success`;
            }
          }
        });

        if (!active) return;

        if (paddle) {
          paddleInstanceRef.current = paddle;
          setStatus("initialized");
          
          // Open checkout overlay automatically
          checkoutOpenedRef.current = true;
          paddle.Checkout.open({
            items: [{ priceId, quantity: 1 }],
            customData: { userId },
            settings: {
              successUrl: `${primaryAppUrl}/plan?checkout=success`,
              displayMode: "overlay",
              theme: "dark",
            }
          });
        } else {
          setStatus("error");
        }
      } catch (err) {
        console.error("Failed to initialize Paddle SDK:", err);
        if (active) setStatus("error");
      }
    }

    initPaddle();

    return () => {
      active = false;
    };
  }, [priceId, userId, clientToken, paddleEnv, primaryAppUrl]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 text-center max-w-sm p-6 rounded-2xl border border-primary/10 bg-card/45 backdrop-blur-md shadow-2xl relative overflow-hidden">
      <div className="h-1.5 bg-gradient-to-r from-primary to-indigo-500 absolute top-0 left-0 right-0 animate-pulse" />
      {status === "loading" && (
        <>
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
          <h2 className="text-lg font-display tracking-tight font-semibold">
            Connecting to Paddle
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Please wait while we secure your payment connection...
          </p>
        </>
      )}

      {status === "initialized" && (
        <>
          <RefreshCw className="h-10 w-10 text-primary animate-spin" />
          <h2 className="text-lg font-display tracking-tight font-semibold">
            Opening Checkout
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            If the checkout overlay does not appear automatically, click the button below.
          </p>
          <button
            onClick={() => {
              if (paddleInstanceRef.current) {
                paddleInstanceRef.current.Checkout.open({
                  items: [{ priceId, quantity: 1 }],
                  customData: { userId },
                  settings: {
                    successUrl: `${primaryAppUrl}/plan?checkout=success`,
                    displayMode: "overlay",
                    theme: "dark",
                  }
                });
              }
            }}
            className="mt-2 w-full px-4 py-2 text-xs font-display font-semibold rounded-lg border border-primary/20 bg-primary/10 hover:bg-primary/20 text-primary transition-all duration-300"
          >
            Launch Overlay
          </button>
        </>
      )}

      {status === "error" && (
        <>
          <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center text-destructive font-bold text-sm">
            X
          </div>
          <h2 className="text-lg font-display tracking-tight font-semibold text-destructive">
            Connection Failed
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Could not establish connection with Paddle. Please check your network or try again.
          </p>
          <a
            href={`${primaryAppUrl}/plan`}
            className="mt-2 text-xs text-primary hover:underline font-semibold"
          >
            Go Back
          </a>
        </>
      )}
    </div>
  );
}
