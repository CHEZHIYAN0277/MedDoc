import HeroSection from "@/components/landing/HeroSection";
import ProblemsSection from "@/components/landing/ProblemsSection";
import CTASection from "@/components/landing/CTASection";
import FooterSection from "@/components/landing/FooterSection";
import FloatingParticles from "@/components/landing/FloatingParticles";

export default function Landing() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] overflow-x-hidden">
      <FloatingParticles count={40} />
      <HeroSection />
      <ProblemsSection />
      <CTASection />
      <FooterSection />
    </div>
  );
}
