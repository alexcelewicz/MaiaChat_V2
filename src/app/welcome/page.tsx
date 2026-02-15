import type { Metadata } from "next";
import { LandingHero } from "@/components/landing/LandingHero";
import { FeatureShowcase } from "@/components/landing/FeatureShowcase";
import { ComparisonSection } from "@/components/landing/ComparisonSection";
import { CTASection } from "@/components/landing/CTASection";
import { StructuredData } from "@/components/seo/StructuredData";

export const metadata: Metadata = {
  alternates: {
    canonical: "/welcome",
  },
};

export default function WelcomePage() {
  return (
    <main className="min-h-screen bg-background">
      <StructuredData />
      <LandingHero />
      <FeatureShowcase />
      <ComparisonSection />
      <CTASection />
    </main>
  );
}
