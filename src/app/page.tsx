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
import { LanguageSelector } from "@/components/shared/language-selector";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: Brain,
    titleKey: "features.ai.title" as const,
    descriptionKey: "features.ai.desc" as const,
  },
  {
    icon: Edit3,
    titleKey: "features.editor.title" as const,
    descriptionKey: "features.editor.desc" as const,
  },
  {
    icon: Download,
    titleKey: "features.export.title" as const,
    descriptionKey: "features.export.desc" as const,
  },
  {
    icon: Zap,
    titleKey: "features.types.title" as const,
    descriptionKey: "features.types.desc" as const,
  },
  {
    icon: Shield,
    titleKey: "features.secure.title" as const,
    descriptionKey: "features.secure.desc" as const,
  },
  {
    icon: Clock,
    titleKey: "features.study.title" as const,
    descriptionKey: "features.study.desc" as const,
  },
] as const;

const steps = [
  { step: "1", titleKey: "steps.step_1_title" as const, descriptionKey: "steps.step_1_desc" },
  { step: "2", titleKey: "steps.step_2_title" as const, descriptionKey: "steps.step_2_desc" },
  { step: "3", titleKey: "steps.step_3_title" as const, descriptionKey: "steps.step_3_desc" },
  { step: "4", titleKey: "steps.step_4_title" as const, descriptionKey: "steps.step_4_desc" },
] as const;

const testimonials = [
  {
    quoteKey: "testimonials.quote_1" as const,
    author: "Sarah M.",
    roleKey: "testimonials.role_medical_student" as const,
  },
  {
    quoteKey: "testimonials.quote_2" as const,
    author: "James K.",
    roleKey: "testimonials.role_language_learner" as const,
  },
  {
    quoteKey: "testimonials.quote_3" as const,
    author: "Alex T.",
    roleKey: "testimonials.role_software_engineer" as const,
  },
] as const;

const faqs = [
  {
    qKey: "faq.q1" as const,
    aKey: "faq.a1" as const,
  },
  {
    qKey: "faq.q2" as const,
    aKey: "faq.a2" as const,
  },
  {
    qKey: "faq.q3" as const,
    aKey: "faq.a3" as const,
  },
  {
    qKey: "faq.q4" as const,
    aKey: "faq.a4" as const,
  },
  {
    qKey: "faq.q5" as const,
    aKey: "faq.a5" as const,
  },
] as const;

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const tNav = await getTranslations("navigation");
  const tLanding = await getTranslations("landing");

  return (
    <div className="relative min-h-screen overflow-hidden">
      <SpaceBackground />
      {/* Header */}
      <header className="relative z-10 sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-display uppercase tracking-widest text-xl font-extrabold">
            <Sparkles className="h-6 w-6 text-primary" />
            Flashtar
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <Link href="#features" className="text-muted-foreground hover:text-foreground transition-colors font-display uppercase tracking-wider text-xs font-semibold">{tLanding("nav.features")}</Link>
            <Link href="#how-it-works" className="text-muted-foreground hover:text-foreground transition-colors font-display uppercase tracking-wider text-xs font-semibold">{tLanding("nav.how_it_works")}</Link>
            <Link href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors font-display uppercase tracking-wider text-xs font-semibold">{tLanding("nav.pricing")}</Link>
            <Link href="#faq" className="text-muted-foreground hover:text-foreground transition-colors font-display uppercase tracking-wider text-xs font-semibold">{tLanding("nav.faq")}</Link>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSelector />
            <ThemeToggle />
            {user ? (
              <Button asChild>
                <Link href="/dashboard">{tNav("dashboard")}</Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild>
                  <Link href="/login">{tLanding("nav.sign_in")}</Link>
                </Button>
                <Button asChild>
                  <Link href="/signup">{tLanding("nav.get_started")}</Link>
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
          <div className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[10px] font-display uppercase tracking-widest text-muted-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            {tLanding("hero.badge")}
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold font-display uppercase tracking-widest leading-tight">
            {tLanding("hero.title_prefix")}
            <span className="gradient-text">{tLanding("hero.title_highlight")}</span>
            {tLanding("hero.title_suffix")}
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            {tLanding("hero.description")}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Button size="lg" asChild>
              <Link href={user ? "/generate" : "/signup"}>
                {tLanding("hero.cta_start")} <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="#how-it-works">{tLanding("hero.cta_how")}</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t bg-muted/30 py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold font-display uppercase tracking-widest mb-4">{tLanding("features.title")}</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              {tLanding("features.subtitle")}
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <Card key={feature.titleKey} className="border-0 shadow-sm">
                <CardHeader>
                  <feature.icon className="h-10 w-10 text-primary mb-2" />
                  <CardTitle>{tLanding(feature.titleKey)}</CardTitle>
                  <CardDescription>{tLanding(feature.descriptionKey)}</CardDescription>
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
            <h2 className="text-3xl md:text-4xl font-bold font-display uppercase tracking-widest mb-4">{tLanding("steps.title")}</h2>
            <p className="text-muted-foreground text-lg">{tLanding("steps.subtitle")}</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((item) => (
              <div key={item.step} className="text-center space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg">
                  {item.step}
                </div>
                <h3 className="font-semibold text-lg">{tLanding(item.titleKey)}</h3>
                <p className="text-muted-foreground text-sm">{tLanding(item.descriptionKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="border-t bg-muted/30 py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold font-display uppercase tracking-widest text-center mb-16">{tLanding("testimonials.title")}</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <Card key={t.author} className="border-0 shadow-sm">
                <CardContent className="pt-6">
                  <p className="text-muted-foreground mb-4">&ldquo;{tLanding(t.quoteKey)}&rdquo;</p>
                  <div>
                    <p className="font-semibold">{t.author}</p>
                    <p className="text-sm text-muted-foreground">{tLanding(t.roleKey)}</p>
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
            <h2 className="text-3xl md:text-4xl font-bold font-display uppercase tracking-widest mb-4">{tLanding("pricing.title")}</h2>
            <p className="text-muted-foreground text-lg">{tLanding("pricing.subtitle")}</p>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {(["free", "pro"] as const).map((planKey) => {
              const plan = PLANS[planKey];
              const localizedFeatures = planKey === "pro" 
                ? (tLanding.raw("pricing.pro_features") as string[])
                : (tLanding.raw("pricing.free_features") as string[]);
              return (
                <Card key={planKey} className={cn("flex flex-col h-full", planKey === "pro" ? "border-primary shadow-lg relative" : "")}>
                  {planKey === "pro" && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] font-display uppercase tracking-widest px-3 py-1 rounded-full">
                      {tLanding("pricing.most_popular")}
                    </div>
                  )}
                  <CardHeader>
                    <CardTitle className="text-2xl font-display uppercase tracking-wider">{plan.name}</CardTitle>
                    <div className="mt-2">
                      <span className="text-4xl font-bold">${plan.price}</span>
                      {plan.price > 0 && <span className="text-muted-foreground">{tLanding("pricing.per_month")}</span>}
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col pt-0 justify-between gap-6">
                    <ul className="space-y-2 flex-1">
                      {localizedFeatures.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-sm">
                          <Sparkles className="h-4 w-4 text-primary shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <Button className="w-full" variant={planKey === "pro" ? "default" : "outline"} asChild>
                      <Link href={user ? (planKey === "pro" ? "/settings" : "/generate") : "/signup"}>
                        {planKey === "pro" ? tLanding("pricing.upgrade") : tLanding("pricing.get_started_free")}
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
          <h2 className="text-3xl md:text-4xl font-bold font-display uppercase tracking-widest text-center mb-16">{tLanding("faq.title")}</h2>
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger>{tLanding(faq.qKey)}</AccordionTrigger>
                <AccordionContent>{tLanding(faq.aKey)}</AccordionContent>
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
            <div className="flex items-center gap-2 font-display uppercase tracking-widest font-extrabold">
              <Sparkles className="h-5 w-5 text-primary" />
              Flashtar
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-4 text-sm text-muted-foreground">
              <div className="flex gap-4">
                <Link href="/login" className="hover:text-foreground transition-colors">{tLanding("nav.sign_in")}</Link>
                <Link href="/signup" className="hover:text-foreground transition-colors">{tLanding("nav.get_started")}</Link>
                <Link href="#pricing" className="hover:text-foreground transition-colors">{tLanding("nav.pricing")}</Link>
              </div>
              <span className="hidden sm:inline text-border">|</span>
              <div className="flex gap-4">
                <Link href="/terms" className="hover:text-foreground transition-colors">{tLanding("footer.terms")}</Link>
                <Link href="/privacy" className="hover:text-foreground transition-colors">{tLanding("footer.privacy")}</Link>
                <Link href="/refund" className="hover:text-foreground transition-colors">{tLanding("footer.refunds")}</Link>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Flashtar. {tLanding("footer.all_rights_reserved")}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
