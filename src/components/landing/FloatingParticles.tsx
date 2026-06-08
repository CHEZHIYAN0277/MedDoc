import { motion, useScroll, useTransform } from "framer-motion";
import { useRef, useMemo } from "react";

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  speed: number;
  delay: number;
}

interface FloatingParticlesProps {
  count?: number;
  className?: string;
}

export default function FloatingParticles({ count = 50, className = "" }: FloatingParticlesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const { scrollYProgress } = useScroll();
  
  // Generate random particles once
  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 4 + 2, // 2-6px
      opacity: Math.random() * 0.5 + 0.1, // 0.1-0.6
      speed: Math.random() * 0.5 + 0.5, // 0.5-1 multiplier
      delay: Math.random() * 2,
    }));
  }, [count]);

  return (
    <div 
      ref={containerRef}
      className={`fixed inset-0 pointer-events-none overflow-hidden -z-10 ${className}`}
    >
      {particles.map((particle) => (
        <ParticleElement 
          key={particle.id} 
          particle={particle} 
          scrollYProgress={scrollYProgress}
        />
      ))}
      
      {/* Gradient overlays for depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background opacity-80" />
      <div className="absolute inset-0 bg-gradient-to-r from-background via-transparent to-background opacity-40" />
    </div>
  );
}

interface ParticleElementProps {
  particle: Particle;
  scrollYProgress: ReturnType<typeof useScroll>["scrollYProgress"];
}

function ParticleElement({ particle, scrollYProgress }: ParticleElementProps) {
  // Each particle moves at its own speed based on scroll
  const yOffset = useTransform(
    scrollYProgress, 
    [0, 1], 
    [0, -200 * particle.speed]
  );
  
  const xOffset = useTransform(
    scrollYProgress, 
    [0, 1], 
    [0, (particle.id % 2 === 0 ? 30 : -30) * particle.speed]
  );
  
  const opacity = useTransform(
    scrollYProgress,
    [0, 0.3, 0.7, 1],
    [particle.opacity, particle.opacity * 1.5, particle.opacity * 1.5, particle.opacity * 0.5]
  );
  
  const scale = useTransform(
    scrollYProgress,
    [0, 0.5, 1],
    [1, 1 + particle.speed * 0.3, 0.8]
  );

  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        left: `${particle.x}%`,
        top: `${particle.y}%`,
        width: particle.size,
        height: particle.size,
        y: yOffset,
        x: xOffset,
        opacity,
        scale,
        background: particle.id % 3 === 0 
          ? "hsl(var(--primary))" 
          : particle.id % 3 === 1
          ? "hsl(var(--primary) / 0.6)"
          : "hsl(var(--muted-foreground) / 0.3)",
      }}
      animate={{
        y: [0, -20, 0],
        x: [0, particle.id % 2 === 0 ? 10 : -10, 0],
      }}
      transition={{
        duration: 4 + particle.delay,
        repeat: Infinity,
        ease: "easeInOut",
        delay: particle.delay,
      }}
    />
  );
}
