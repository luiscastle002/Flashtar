import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/shared/theme-toggle";

export const metadata: Metadata = {
  title: "Refund Policy",
  description:
    "Refund Policy for Flashtar — Understand our refund process for subscription payments.",
};

export default function RefundPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl">
            <Sparkles className="h-6 w-6 text-primary" />
            Flashtar
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-16 max-w-3xl">
        <h1 className="text-3xl md:text-4xl font-bold mb-2">Refund Policy</h1>
        <p className="text-muted-foreground mb-10">
          Last updated: June 15, 2026
        </p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
          <p>
            Thank you for subscribing to Flashtar. We want you to be satisfied
            with our Service. Please read our refund policy below.
          </p>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              1. Digital Subscription Policy (General Rule)
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Flashtar is a digital subscription service. Due to the nature of
              digital products and instant access to AI generation features,
              digital subscriptions are generally{" "}
              <span className="font-medium text-foreground">
                non-refundable
              </span>{" "}
              unless required by law. Refund requests may be granted at
              Promptback&apos;s discretion. Refund requests may also be
              processed by Paddle as Merchant of Record.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              2. Consumer Protection Rights
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Certain jurisdictions provide consumers with statutory withdrawal
              or cancellation rights. Where local consumer protection laws
              provide greater rights, those rights prevail:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">
                  European Union / EEA / United Kingdom / Switzerland:
                </span>{" "}
                Consumers may have up to 14 days withdrawal rights where
                applicable.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Brazil / South Korea / China / Canada:
                </span>{" "}
                Consumers may have up to 7 days cancellation rights where
                required by local law.
              </li>
              <li>
                <span className="font-medium text-foreground">Singapore:</span>{" "}
                Consumers may have up to 5 days cancellation rights.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              3. Technical Defects &amp; Exceptions
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Refunds may be granted if:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
              <li>Flashtar experiences persistent technical failures;</li>
              <li>Users are incorrectly charged;</li>
              <li>
                Users are billed after cancellation due to processing errors;
              </li>
              <li>The service is materially unavailable;</li>
              <li>Refunds are required under applicable law.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              4. Subscription Cancellation
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Users may cancel subscriptions at any time through the Paddle
              customer portal, the billing page, or account settings (when
              available). Cancellation prevents future renewals but does not
              automatically guarantee a refund.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              5. Paddle Relationship
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Paddle acts as the Merchant of Record and authorised reseller for
              transactions processed through Flashtar. Certain refund requests,
              payment disputes, and statutory rights may be administered
              directly by Paddle in accordance with Paddle&apos;s policies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              6. Refund Request Process &amp; Processing Times
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              To request a refund, please contact us at{" "}
              <a
                href="mailto:support@flashtar.app"
                className="text-primary hover:underline"
              >
                support@flashtar.app
              </a>{" "}
              with the following information:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-muted-foreground mb-3">
              <li>Your account email address</li>
              <li>Date of the charge</li>
              <li>Reason for the refund request</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              Approved refunds are generally returned to the original payment
              method. Processing times depend on Paddle and banking providers
              (typically taking 5–10 business days). Access to paid features may
              be revoked after a refund.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Free Plan</h2>
            <p className="text-muted-foreground leading-relaxed">
              The free tier of Flashtar does not involve any charges. If you are
              on the free plan, no refund is applicable.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              For any questions about our refund policy, please reach out to us
              at{" "}
              <a
                href="mailto:support@flashtar.app"
                className="text-primary hover:underline"
              >
                support@flashtar.app
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
              Flashtar
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
