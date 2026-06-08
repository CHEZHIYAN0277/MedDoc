import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import AnimatedIntakeForm from "./AnimatedIntakeForm";
const fadeInUp = {
  hidden: {
    opacity: 0,
    y: 60
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1] as const
    }
  }
};
const staggerContainer = {
  hidden: {
    opacity: 0
  },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
      delayChildren: 0.1
    }
  }
};
export default function HeroSection() {
  const heroRef = useRef<HTMLDivElement>(null);
  const {
    scrollYProgress
  } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"]
  });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const backgroundY = useTransform(scrollYProgress, [0, 1], [0, 300]);
  return <section ref={heroRef} className="relative min-h-[110vh] overflow-hidden">
      {/* Animated gradient background */}
      <motion.div className="absolute inset-0 -z-20" style={{
      y: backgroundY
    }}>
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-accent/20" />
        <motion.div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-primary/30 blur-[120px]" animate={{
        scale: [1, 1.2, 1],
        x: [0, 50, 0],
        opacity: [0.3, 0.5, 0.3]
      }} transition={{
        duration: 10,
        repeat: Infinity,
        ease: "easeInOut"
      }} />
        <motion.div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full bg-success/20 blur-[100px]" animate={{
        scale: [1.2, 1, 1.2],
        x: [0, -30, 0],
        opacity: [0.2, 0.4, 0.2]
      }} transition={{
        duration: 12,
        repeat: Infinity,
        ease: "easeInOut"
      }} />
        <motion.div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-secondary/30 blur-[150px]" animate={{
        rotate: [0, 360],
        scale: [1, 1.1, 1]
      }} transition={{
        duration: 20,
        repeat: Infinity,
        ease: "linear"
      }} />
      </motion.div>

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 -z-10 opacity-[0.02]" style={{
      backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px),
                           linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`,
      backgroundSize: '60px 60px'
    }} />

      {/* Sticky content container */}
      <motion.div className="sticky top-0 min-h-screen flex items-center" style={{
      opacity: heroOpacity
    }}>
        <div className="container relative z-10 py-20">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left Column - Text Content */}
            <motion.div className="text-left" initial="hidden" animate="visible" variants={staggerContainer}>
              {/* Badge */}
              <motion.div variants={fadeInUp} className="mb-8 inline-flex items-center gap-2 rounded-full bg-card/80 backdrop-blur-sm px-5 py-2.5 text-sm font-medium text-foreground border border-border/50 shadow-lg">
                <motion.div animate={{
                rotate: [0, 15, -15, 0]
              }} transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}>
                  <Sparkles className="h-4 w-4 text-primary" />
                </motion.div>
                Emergency Documentation, Reimagined.
              </motion.div>
              
              {/* Main headline */}
              <motion.h1 variants={fadeInUp} className="mb-8 text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl xl:text-7xl">
                <span className="block">Emergency Care</span>
                <span className="block mt-2">
                  Is{" "}
                  <span className="relative inline-block">
                    <span className="bg-gradient-to-r from-primary via-primary to-success bg-clip-text text-transparent">
                      Fast.
                    </span>
                    <motion.span className="absolute -bottom-2 left-0 h-1.5 bg-gradient-to-r from-primary to-success rounded-full" initial={{
                    width: 0,
                    opacity: 0
                  }} animate={{
                    width: "100%",
                    opacity: 1
                  }} transition={{
                    delay: 1,
                    duration: 0.8
                  }} />
                  </span>
                </span>
                <span className="block text-muted-foreground/80 mt-2">Documentation Is Not.</span>
              </motion.h1>
              
              {/* Subheadline */}
              <motion.p variants={fadeInUp} className="mb-10 text-lg text-muted-foreground sm:text-xl leading-relaxed max-w-lg">
                AI assists: transcribes and drafts forms in real time.
                <span className="block mt-1 text-foreground/80">You focus on saving lives.</span>
              </motion.p>
              
              {/* CTA Button */}
              <motion.div variants={fadeInUp}>
                <Link to="/intake">
                  <Button size="lg" className="gap-3 h-14 px-10 text-lg rounded-2xl shadow-2xl shadow-primary/30 hover:shadow-primary/50 transition-all duration-300 hover:-translate-y-1 bg-gradient-to-r from-primary to-primary/80">
                    Start Emergency Intake
                    <motion.div animate={{
                    x: [0, 5, 0]
                  }} transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}>
                      <ArrowRight className="h-5 w-5" />
                    </motion.div>
                  </Button>
                </Link>
              </motion.div>

            </motion.div>

            {/* Right Column - Animated Form */}
            <motion.div className="lg:pl-8" initial={{
            opacity: 0,
            x: 50
          }} animate={{
            opacity: 1,
            x: 0
          }} transition={{
            duration: 0.8,
            delay: 0.3,
            ease: [0.16, 1, 0.3, 1]
          }}>
              <AnimatedIntakeForm scrollYProgress={scrollYProgress} />
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* Scroll Indicator */}
      <motion.div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-20" initial={{
      opacity: 0,
      y: -20
    }} animate={{
      opacity: 1,
      y: 0
    }} transition={{
      delay: 1.5,
      duration: 0.5
    }} style={{
      opacity: useTransform(scrollYProgress, [0, 0.3], [1, 0])
    }}>
        <motion.div className="flex flex-col items-center gap-3 text-muted-foreground cursor-pointer" animate={{
        y: [0, 10, 0]
      }} transition={{
        duration: 2,
        repeat: Infinity,
        ease: "easeInOut"
      }}>
          
          
        </motion.div>
      </motion.div>
    </section>;
}