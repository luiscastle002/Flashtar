import Link from "next/link";
import { Sparkles, ArrowRight, Zap, Edit3, Download, Brain, Shield, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { SpaceBackground } from "@/components/shared/space-background";
import { PLANS } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

const features = [
  {
    icon: Brain,
    title: "AI-Powered Generation",
    description: "Describe any topic and get a complete, structured flashcard deck in seconds.",
  },
  {
    icon: Edit3,
    title: "Rich Editor",
    description: "Edit cards inline with rich text, cloze syntax, images, and drag-and-drop reordering.",
  },
  {
    icon: Download,
    title: "Export to Anki",
    description: "Download your decks as .apkg or CSV files ready for Anki import.",
  },
  {
    icon: Zap,
    title: "Multiple Card Types",
    description: "Basic front/back, cloze deletions, or mixed decks — all supported.",
  },
  {
    icon: Shield,
    title: "Secure & Private",
    description: "Your decks are protected with row-level security. Only you can access your data.",
  },
  {
    icon: Clock,
    title: "Study Smarter",
    description: "Spend less time creating cards and more time learning with spaced repetition.",
  },
];

const steps = [
  { step: "1", title: "Describe your topic", description: "Enter a prompt like \"50 flashcards about JavaScript closures\"" },
  { step: "2", title: "AI generates your deck", description: "Our AI creates accurate, well-structured flashcards tailored to your level" },
  { step: "3", title: "Edit & refine", description: "Review and customize cards in our intuitive editor" },
  { step: "4", title: "Export & study", description: "Download as .apkg and import directly into Anki" },
];

const testimonials = [
  {
    quote: "Flashtar cut my deck creation time from hours to minutes. The quality of generated cards is impressive.",
    author: "Sarah M.",
    role: "Medical Student",
  },
  {
    quote: "Finally, a tool that understands cloze deletions. Perfect for language learning.",
    author: "James K.",
    role: "Language Learner",
  },
  {
    quote: "The export to Anki works flawlessly. This is exactly what I needed for my certification prep.",
    author: "Alex T.",
    role: "Software Engineer",
  },
];

const faqs = [
  {
    q: "How does AI deck generation work?",
    a: "Enter a prompt describing what you want to learn. Our AI uses OpenAI to generate structured flashcards with front/back or cloze format, then saves them to your account.",
  },
  {
    q: "Can I edit generated flashcards?",
    a: "Yes! Every card is fully editable. You can modify text, add images, reorder cards, and change card types after generation.",
  },
  {
    q: "What export formats are supported?",
    a: "Free users can export to CSV. Pro users also get .apkg export for direct Anki import.",
  },
  {
    q: "Is there a free plan?",
    a: "Yes. The free plan includes 3 AI generations per month and up to 50 cards per deck.",
  },
  {
    q: "How do I cancel my subscription?",
    a: "Manage your subscription anytime through the billing section in your account settings.",
  },
];

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="relative min-h-screen overflow-hidden">
      <SpaceBackground />
      {/* Header */}
      <header className="relative z-10 sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl">
            <Sparkles className="h-6 w-6 text-primary" />
            Flashtar
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <Link href="#features" className="text-muted-foreground hover:text-foreground transition-colors">Features</Link>
            <Link href="#how-it-works" className="text-muted-foreground hover:text-foreground transition-colors">How it Works</Link>
            <Link href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">Pricing</Link>
            <Link href="#faq" className="text-muted-foreground hover:text-foreground transition-colors">FAQ</Link>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {user ? (
              <Button asChild>
                <Link href="/dashboard">Dashboard</Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild>
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button asChild>
                  <Link href="/signup">Get Started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10">
        {/* Hero */}
      <section className="container mx-auto px-4 py-24 md:py-32 text-center">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            AI-powered flashcard generation
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            Turn any topic into{" "}
            <span className="gradient-text">Anki decks</span> in seconds
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            Generate complete, high-quality flashcard decks with AI. Edit, organize, and export directly to Anki.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Button size="lg" asChild>
              <Link href={user ? "/generate" : "/signup"}>
                Start Generating <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="#how-it-works">See How It Works</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t bg-muted/30 py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything you need to learn faster</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              From AI generation to Anki export — a complete workflow for spaced repetition learners.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <Card key={feature.title} className="border-0 shadow-sm">
                <CardHeader>
                  <feature.icon className="h-10 w-10 text-primary mb-2" />
                  <CardTitle>{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How it works</h2>
            <p className="text-muted-foreground text-lg">Four simple steps from prompt to study-ready deck</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((item) => (
              <div key={item.step} className="text-center space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg">
                  {item.step}
                </div>
                <h3 className="font-semibold text-lg">{item.title}</h3>
                <p className="text-muted-foreground text-sm">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="border-t bg-muted/30 py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-16">Loved by learners</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <Card key={t.author} className="border-0 shadow-sm">
                <CardContent className="pt-6">
                  <p className="text-muted-foreground mb-4">&ldquo;{t.quote}&rdquo;</p>
                  <div>
                    <p className="font-semibold">{t.author}</p>
                    <p className="text-sm text-muted-foreground">{t.role}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Simple, transparent pricing</h2>
            <p className="text-muted-foreground text-lg">Start free, upgrade when you need more</p>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {(["free", "pro"] as const).map((planKey) => {
              const plan = PLANS[planKey];
              return (
                <Card key={planKey} className={planKey === "pro" ? "border-primary shadow-lg relative" : ""}>
                  {planKey === "pro" && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
                      Most Popular
                    </div>
                  )}
                  <CardHeader>
                    <CardTitle className="text-2xl">{plan.name}</CardTitle>
                    <div className="mt-2">
                      <span className="text-4xl font-bold">${plan.price}</span>
                      {plan.price > 0 && <span className="text-muted-foreground">/month</span>}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ul className="space-y-2">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-sm">
                          <Sparkles className="h-4 w-4 text-primary shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <Button className="w-full" variant={planKey === "pro" ? "default" : "outline"} asChild>
                      <Link href={user ? (planKey === "pro" ? "/settings" : "/generate") : "/signup"}>
                        {planKey === "pro" ? "Upgrade to Pro" : "Get Started Free"}
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t bg-muted/30 py-24">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-16">Frequently asked questions</h2>
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger>{faq.q}</AccordionTrigger>
                <AccordionContent>{faq.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2 font-bold">
              <Sparkles className="h-5 w-5 text-primary" />
              Flashtar
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-4 text-sm text-muted-foreground">
              <div className="flex gap-4">
                <Link href="/login" className="hover:text-foreground transition-colors">Sign in</Link>
                <Link href="/signup" className="hover:text-foreground transition-colors">Sign up</Link>
                <Link href="#pricing" className="hover:text-foreground transition-colors">Pricing</Link>
              </div>
              <span className="hidden sm:inline text-border">|</span>
              <div className="flex gap-4">
                <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
                <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
                <Link href="/refund" className="hover:text-foreground transition-colors">Refunds</Link>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Flashtar. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
