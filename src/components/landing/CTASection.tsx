import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { ArrowRight, Mic, Sparkles, Waves } from "lucide-react";

export default function CTASection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"]
  });

  const y = useTransform(scrollYProgress, [0, 1], [100, -100]);
  const rotate = useTransform(scrollYProgress, [0, 1], [0, 10]);

  return (
    <section ref={sectionRef} className="relative py-20 lg:py-28 overflow-hidden">
      {/* Animated background orbs */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <motion.div 
          className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full"
          style={{
            background: "radial-gradient(circle, hsl(var(--primary) / 0.3) 0%, transparent 70%)",
            y,
          }}
          animate={{
            scale: [1, 1.2, 1],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div 
          className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full"
          style={{
            background: "radial-gradient(circle, hsl(var(--success) / 0.2) 0%, transparent 70%)",
          }}
          animate={{
            scale: [1.2, 1, 1.2],
            x: [0, 50, 0],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="container">
        <div className="relative">
          {/* Main content container */}
          <div className="relative z-10 text-center max-w-4xl mx-auto">
            
            {/* Main headline with gradient */}
            <motion.h2
              className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-8"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
            >
              <span className="text-foreground">See It</span>
              <br />
              <span className="relative">
                <span className="bg-gradient-to-r from-primary via-primary/80 to-success bg-clip-text text-transparent">
                  In Action
                </span>
                {/* Animated underline */}
                <motion.svg
                  className="absolute -bottom-4 left-0 w-full h-4"
                  viewBox="0 0 400 20"
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.5 }}
                >
                  <motion.path
                    d="M0 10 Q 100 0, 200 10 T 400 10"
                    fill="none"
                    stroke="url(#gradient)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    whileInView={{ pathLength: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.6, duration: 0.8 }}
                  />
                  <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="hsl(var(--primary))" />
                      <stop offset="100%" stopColor="hsl(var(--success))" />
                    </linearGradient>
                  </defs>
                </motion.svg>
              </span>
            </motion.h2>

            {/* Subtitle */}
            <motion.p
              className="text-xl lg:text-2xl text-muted-foreground max-w-2xl mx-auto mb-12"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              Experience how voice-powered documentation transforms emergency care in real-time.
            </motion.p>

            {/* Animated feature pills */}
            <motion.div
              className="flex flex-wrap justify-center gap-3 mb-12"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
            >
              {[
                { icon: Mic, label: "Voice-First", delay: 0 },
                { icon: Waves, label: "Real-Time AI", delay: 0.1 },
                { icon: Sparkles, label: "68% Faster", delay: 0.2 },
              ].map((item, index) => (
                <motion.div
                  key={item.label}
                  className="group relative"
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.4 + item.delay }}
                  whileHover={{ scale: 1.05 }}
                >
                  {/* Glow effect on hover */}
                  <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="relative flex items-center gap-2 px-5 py-2.5 rounded-full bg-card/80 backdrop-blur-sm border border-border/50 shadow-sm">
                    <item.icon className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">{item.label}</span>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            {/* CTA Button with glow */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5 }}
              className="relative inline-block"
            >
              {/* Button glow */}
              <motion.div 
                className="absolute inset-0 rounded-2xl bg-primary/40 blur-2xl"
                animate={{ 
                  scale: [1, 1.1, 1],
                  opacity: [0.5, 0.8, 0.5],
                }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />
              
              <Link to="/intake">
                <Button 
                  size="lg" 
                  className="relative group gap-3 h-16 px-10 text-lg rounded-2xl bg-primary hover:bg-primary/90 shadow-2xl transition-all duration-300"
                >
                  <span className="font-semibold">Start Emergency Intake</span>
                  <motion.div
                    className="flex items-center justify-center w-8 h-8 rounded-full bg-primary-foreground/20"
                    animate={{ x: [0, 4, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <ArrowRight className="w-4 h-4" />
                  </motion.div>
                </Button>
              </Link>
            </motion.div>

          </div>

          {/* Floating decorative elements */}
          <motion.div
            className="absolute top-0 right-0 lg:right-20 w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10 backdrop-blur-sm"
            style={{ rotate }}
            animate={{ y: [0, -20, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute bottom-20 left-0 lg:left-20 w-16 h-16 rounded-xl bg-gradient-to-br from-success/20 to-success/5 border border-success/10 backdrop-blur-sm"
            animate={{ y: [0, 20, 0], rotate: [0, 10, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute top-1/2 left-10 w-3 h-3 rounded-full bg-primary/40"
            animate={{ y: [0, -30, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute top-1/3 right-10 w-2 h-2 rounded-full bg-success/40"
            animate={{ y: [0, 20, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          />
        </div>
      </div>
    </section>
  );
}
