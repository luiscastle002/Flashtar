import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/shared/theme-toggle";

export const metadata: Metadata = {
  title: "Refund Policy",
  description:
    "Refund Policy for AnkiAI — Understand our refund process for subscription payments.",
};

export default function RefundPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl">
            <Sparkles className="h-6 w-6 text-primary" />
            AnkiAI
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-16 max-w-3xl">
        <h1 className="text-3xl md:text-4xl font-bold mb-2">Refund Policy</h1>
        <p className="text-muted-foreground mb-10">
          Last updated: June 10, 2026
        </p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
          <p>
            Thank you for subscribing to AnkiAI. We want you to be satisfied
            with our Service. Please read our refund policy below.
          </p>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              1. Digital Subscription Policy
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              AnkiAI is a digital subscription service. Due to the nature of
              digital products and instant access to AI generation features,
              subscription payments are generally{" "}
              <span className="font-medium text-foreground">
                non-refundable
              </span>{" "}
              once processed.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              2. When Refunds May Be Granted
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              We may issue a refund at our discretion in the following
              situations:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
              <li>You were charged incorrectly or experienced a billing error</li>
              <li>
                The Service was unavailable or significantly degraded for an
                extended period during your billing cycle
              </li>
              <li>
                You were charged after canceling your subscription due to a
                processing delay
              </li>
              <li>A refund is required by applicable consumer protection law</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              3. How to Request a Refund
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              To request a refund, please contact us at{" "}
              <a
                href="mailto:luiscastle002@gmail.com"
                className="text-primary hover:underline"
              >
                luiscastle002@gmail.com
              </a>{" "}
              with the following information:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-muted-foreground mt-3">
              <li>Your account email address</li>
              <li>Date of the charge</li>
              <li>Reason for the refund request</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              4. Processing Time
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Refund requests are reviewed within{" "}
              <span className="font-medium text-foreground">
                5–10 business days
              </span>
              . If approved, the refund will be processed to your original
              payment method. Depending on your bank or payment provider, it may
              take an additional 5–10 business days for the refund to appear on
              your statement.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Cancellation</h2>
            <p className="text-muted-foreground leading-relaxed">
              You can cancel your subscription at any time through your account
              settings or via the payment provider&apos;s customer portal. After
              cancellation, you will retain access to paid features until the
              end of your current billing period. No further charges will be
              made after cancellation.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              6. Free Plan
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              The free tier of AnkiAI does not involve any charges. If you are
              on the free plan, no refund is applicable.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              For any questions about our refund policy, please reach out to us
              at{" "}
              <a
                href="mailto:luiscastle002@gmail.com"
                className="text-primary hover:underline"
              >
                luiscastle002@gmail.com
              </a>
              .
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
            <Link
              href="/"
              className="flex items-center gap-2 font-bold text-foreground"
            >
              <Sparkles className="h-4 w-4 text-primary" />
              AnkiAI
            </Link>
            <div className="flex gap-4">
              <Link href="/terms" className="hover:text-foreground">
                Terms
              </Link>
              <Link href="/privacy" className="hover:text-foreground">
                Privacy
              </Link>
              <Link href="/refund" className="hover:text-foreground">
                Refunds
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
