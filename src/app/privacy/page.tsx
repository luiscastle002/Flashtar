import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/shared/theme-toggle";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Privacy Policy for Flashtar — Learn how we collect, use, and protect your personal data.",
};

export default function PrivacyPage() {
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
        <h1 className="text-3xl md:text-4xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground mb-10">
          Last updated: June 15, 2026
        </p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
          <p>
            Your privacy is important to us. This Privacy Policy explains what
            data we collect, how we use it, and your rights regarding your
            personal information when using Flashtar (&quot;the Service&quot;).
          </p>

          <section>
            <h2 className="text-xl font-semibold mb-3">Data Controller</h2>
            <p className="text-muted-foreground leading-relaxed">
              Promptback is the operator of Flashtar and acts as the controller
              of personal information processed through{" "}
              <a
                href="https://flashtar.app"
                className="text-primary hover:underline"
              >
                https://flashtar.app
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              1. Information We Collect
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              We collect the following types of information:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">
                  Account information:
                </span>{" "}
                Email address, name, and profile picture (if using social login)
              </li>
              <li>
                <span className="font-medium text-foreground">
                  User-created content:
                </span>{" "}
                Flashcard decks, flashcards, and prompts you submit for AI
                generation
              </li>
              <li>
                <span className="font-medium text-foreground">Usage data:</span>{" "}
                Number of generations, feature usage, and activity timestamps
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Payment information:
                </span>{" "}
                Account information is processed by Promptback. Billing
                information is processed by Paddle as the Merchant of Record.
                Payment information is handled by Paddle according to
                Paddle&apos;s Privacy Policy. Flashtar itself does not directly
                store full payment card details.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              2. How We Use Your Data
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              We use your data to:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
              <li>Provide, maintain, and improve the Service</li>
              <li>Authenticate your identity and secure your account</li>
              <li>Process AI generation requests on your behalf</li>
              <li>Track usage limits based on your subscription plan</li>
              <li>Process payments and manage subscriptions</li>
              <li>
                Communicate important updates about the Service or your account
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              3. Data Sharing &amp; Third-Party Services
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              We do <span className="font-medium text-foreground">NOT</span>{" "}
              sell your personal data. We share data only with the following
              third-party services necessary to operate the platform:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">Supabase</span> —
                Database hosting, authentication, and data storage
              </li>
              <li>
                <span className="font-medium text-foreground">OpenAI</span> —
                Processes your prompts to generate flashcard content (prompts
                are sent to OpenAI for processing)
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Payment provider (Paddle)
                </span>{" "}
                — Paddle acts as our Merchant of Record and authorised reseller,
                handling subscription billing, payment processing, and related
                customer records according to Paddle&apos;s policies.
              </li>
              <li>
                <span className="font-medium text-foreground">Vercel</span> —
                Application hosting and content delivery
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              4. AI Processing Disclosure
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              When you use the AI generation feature, your prompts are sent to
              OpenAI for processing. OpenAI may process this data according to
              their own privacy policy. We recommend reviewing{" "}
              <a
                href="https://openai.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                OpenAI&apos;s Privacy Policy
              </a>{" "}
              for details. We do not use your content to train AI models.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Data Security</h2>
            <p className="text-muted-foreground leading-relaxed">
              Your data is stored securely using Supabase with Row Level
              Security, ensuring that only you can access your own decks and
              flashcards. We use industry-standard encryption for data in
              transit (HTTPS/TLS). While we take reasonable precautions to
              protect your data, no method of electronic storage is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              6. Data Retention &amp; Deletion
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              We retain your data for as long as your account is active. If you
              wish to delete your account and all associated data, please
              contact us at the email below. Upon account deletion, your
              personal data, decks, flashcards, and generation history will be
              permanently removed from our systems within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Your Rights</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Depending on your jurisdiction, you may have the right to:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Export your data (via our CSV and APKG export features)</li>
              <li>Withdraw consent for data processing</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              We use essential cookies for authentication and session
              management. We do not use tracking cookies or third-party
              advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              9. Changes to This Policy
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this Privacy Policy from time to time. We will
              notify users of material changes via email or through the Service.
              Continued use of the Service after changes take effect constitutes
              acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have questions about this Privacy Policy or wish to
              exercise your data rights, please contact us at{" "}
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
