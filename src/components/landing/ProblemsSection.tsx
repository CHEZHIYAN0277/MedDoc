import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";
import { useState, useRef, useEffect, useCallback } from "react";
import { Keyboard, Clock, Globe } from "lucide-react";

const AUTO_ROTATE_INTERVAL = 4000; // 4 seconds

const problems = [
  {
    id: "typing",
    icon: Keyboard,
    label: "Manual Typing",
    title: "Typing During Emergencies",
    description: "Clinicians split attention between critical care and documentation, leading to delayed responses and increased cognitive load.",
    stat: "73%",
    statLabel: "time lost to manual entry",
    details: ["Divided attention during critical moments", "Increased error rates under pressure", "Slower patient response times"],
  },
  {
    id: "delayed",
    icon: Clock,
    label: "Delayed Records",
    title: "Hours-Late Documentation",
    description: "Medical records completed hours after encounters rely on memory, resulting in incomplete and inaccurate information.",
    stat: "4.2h",
    statLabel: "average documentation delay",
    details: ["Memory-based record completion", "Missing critical patient details", "Compliance and legal risks"],
  },
  {
    id: "language",
    icon: Globe,
    label: "Language Barriers",
    title: "No Multilingual Support",
    description: "Current systems offer no real-time voice translation, creating critical communication gaps in emergency situations.",
    stat: "31%",
    statLabel: "patients affected",
    details: ["Delayed intake for non-English speakers", "Miscommunication risks", "Interpreter dependency"],
  },
];

export default function ProblemsSection() {
  const [activeTab, setActiveTab] = useState(problems[0].id);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const activeProblem = problems.find(p => p.id === activeTab)!;
  const sectionRef = useRef<HTMLElement>(null);
  
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"]
  });
  
  const sectionY = useTransform(scrollYProgress, [0, 0.3], [40, 0]);
  const sectionOpacity = useTransform(scrollYProgress, [0, 0.15], [0, 1]);

  // Auto-rotation effect
  useEffect(() => {
    if (isPaused) return;
    
    setProgress(0);
    
    const progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + 2, 100));
    }, AUTO_ROTATE_INTERVAL / 50);
    
    const rotationInterval = setInterval(() => {
      setActiveTab(prev => {
        const currentIndex = problems.findIndex(p => p.id === prev);
        const nextIndex = (currentIndex + 1) % problems.length;
        return problems[nextIndex].id;
      });
      setProgress(0);
    }, AUTO_ROTATE_INTERVAL);
    
    return () => {
      clearInterval(progressInterval);
      clearInterval(rotationInterval);
    };
  }, [isPaused, activeTab]);

  const handleTabClick = useCallback((tabId: string) => {
    setActiveTab(tabId);
    setProgress(0);
  }, []);

  return (
    <motion.section 
      ref={sectionRef}
      className="py-16 lg:py-20 relative overflow-hidden"
      style={{ y: sectionY, opacity: sectionOpacity }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Background decoration */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[100px]" />
      </div>

      <div className="container">
        {/* Header */}
        <motion.div
          className="mb-12 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground">
            Why current systems{" "}
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">fail</span>
          </h2>
        </motion.div>

        {/* Modern Tab Interface */}
        <div className="max-w-5xl mx-auto">
          {/* Tab Pills */}
          <motion.div 
            className="flex flex-wrap justify-center gap-3 mb-8"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            {problems.map((problem, index) => {
              const isActive = activeTab === problem.id;
              return (
                <motion.button
                  key={problem.id}
                  onClick={() => handleTabClick(problem.id)}
                  className={`relative px-6 py-3 rounded-full font-medium text-sm transition-all duration-300 ${
                    isActive 
                      ? "text-primary-foreground" 
                      : "text-muted-foreground hover:text-foreground bg-muted/30 hover:bg-muted/50"
                  }`}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.15 + index * 0.05 }}
                  whileTap={{ scale: 0.97 }}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute inset-0 bg-gradient-to-r from-primary to-primary/80 rounded-full shadow-lg shadow-primary/25"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2">
                    <problem.icon className="w-4 h-4" />
                    {problem.label}
                  </span>
                </motion.button>
              );
            })}
          </motion.div>

          {/* Progress bar */}
          <div className="max-w-md mx-auto mb-8">
            <div className="h-1 bg-muted/30 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full"
                initial={{ width: "0%" }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.1, ease: "linear" }}
              />
            </div>
          </div>

          {/* Content Card */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="relative"
            >
              {/* Glow effect */}
              <div className="absolute -inset-px bg-gradient-to-r from-primary/20 via-transparent to-primary/20 rounded-3xl blur-sm" />
              
              <div className="relative rounded-3xl border border-border/50 bg-card/60 backdrop-blur-xl p-8 lg:p-12 overflow-hidden">
                {/* Inner glow */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2" />
                
                <div className="relative grid lg:grid-cols-[1fr_auto] gap-8 lg:gap-12 items-start">
                  {/* Left Content */}
                  <div className="space-y-6">
                    {/* Stat */}
                    <motion.div 
                      className="flex items-baseline gap-2"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 }}
                    >
                      <span className="text-5xl lg:text-6xl font-bold bg-gradient-to-br from-primary to-primary/70 bg-clip-text text-transparent">
                        {activeProblem.stat}
                      </span>
                      <span className="text-sm text-muted-foreground font-medium">{activeProblem.statLabel}</span>
                    </motion.div>

                    {/* Title */}
                    <motion.h3 
                      className="text-2xl lg:text-3xl font-bold text-foreground"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 }}
                    >
                      {activeProblem.title}
                    </motion.h3>

                    {/* Description */}
                    <motion.p 
                      className="text-muted-foreground leading-relaxed text-base lg:text-lg max-w-xl"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      {activeProblem.description}
                    </motion.p>
                  </div>

                  {/* Right - Detail Points */}
                  <motion.div 
                    className="lg:w-72 space-y-3"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.25 }}
                  >
                    {activeProblem.details.map((detail, i) => (
                      <motion.div
                        key={detail}
                        className="flex items-start gap-3 p-3 rounded-xl bg-background/50 border border-border/30"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 + i * 0.08 }}
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                        <span className="text-sm text-foreground/80">{detail}</span>
                      </motion.div>
                    ))}
                  </motion.div>
                </div>

                {/* Progress indicator dots */}
                <div className="flex justify-center gap-2 mt-10">
                  {problems.map((problem) => (
                    <button
                      key={problem.id}
                      onClick={() => handleTabClick(problem.id)}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        activeTab === problem.id 
                          ? "w-8 bg-primary" 
                          : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </motion.section>
  );
}
