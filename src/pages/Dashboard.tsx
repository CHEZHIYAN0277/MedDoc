import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, Clock, Target, TrendingUp, PlayCircle, ArrowRight } from "lucide-react";
import { motion, animate } from "framer-motion";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getDashboardStats, getSession } from "@/lib/api";

// Animated counter hook
function useAnimatedCounter(target: number, duration: number = 2) {
  const [value, setValue] = useState(0);
  
  useEffect(() => {
    const controls = animate(0, target, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setValue(Math.round(v * 10) / 10),
    });
    return () => controls.stop();
  }, [target, duration]);
  
  return value;
}

function buildStatsFromApi(data: { active_sessions: number; pending_review: number; approved_today: number; avg_time_saved_percent?: number }) {
  return [
    {
      label: "Active Emergency Sessions",
      value: data.active_sessions,
      suffix: "",
      icon: Activity,
      description: "Currently in progress",
      gradient: "from-primary to-primary/60",
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
      trend: "Live",
      trendUp: true,
    },
    {
      label: "Avg. Time Saved",
      value: data.avg_time_saved_percent ?? 0,
      suffix: "%",
      icon: Clock,
      description: "Compared to manual entry",
      gradient: "from-success to-success/60",
      iconBg: "bg-success/10",
      iconColor: "text-success",
      trend: "vs manual",
      trendUp: true,
    },
    {
      label: "Pending Review",
      value: data.pending_review,
      suffix: "",
      icon: Target,
      description: "Awaiting clinician approval",
      gradient: "from-primary to-success",
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
      trend: `${data.approved_today} approved today`,
      trendUp: true,
    },
  ];
}

function StatCard({ stat, index }: { stat: typeof stats[0]; index: number }) {
  const animatedValue = useAnimatedCounter(stat.value, 2 + index * 0.3);
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        delay: index * 0.15,
        duration: 0.6,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="group"
    >
      <Card className="relative overflow-hidden border-border/40 bg-card/40 backdrop-blur-xl hover:bg-card/60 transition-all duration-500 hover:shadow-2xl hover:shadow-primary/5 hover:-translate-y-1">
        {/* Gradient accent line */}
        <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${stat.gradient} opacity-80`} />
        
        {/* Subtle background glow */}
        <div className={`absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-br ${stat.gradient} opacity-5 blur-3xl group-hover:opacity-10 transition-opacity duration-500`} />
        
        <CardContent className="p-6 relative">
          {/* Header with icon and trend */}
          <div className="flex items-start justify-between mb-4">
            <motion.div 
              className={`p-3 rounded-2xl ${stat.iconBg} ring-1 ring-border/50`}
              whileHover={{ scale: 1.05, rotate: 5 }}
              transition={{ type: "spring", stiffness: 400 }}
            >
              <stat.icon className={`h-6 w-6 ${stat.iconColor}`} />
            </motion.div>
            
            <Badge 
              variant="outline" 
              className="text-xs bg-background/50 border-border/50 text-muted-foreground gap-1"
            >
              <TrendingUp className="h-3 w-3 text-success" />
              {stat.trend}
            </Badge>
          </div>
          
          {/* Value with animated counter */}
          <div className="mb-2">
            <span className={`text-4xl font-bold bg-gradient-to-r ${stat.gradient} bg-clip-text text-transparent`}>
              {animatedValue}
            </span>
            <span className={`text-4xl font-bold bg-gradient-to-r ${stat.gradient} bg-clip-text text-transparent`}>
              {stat.suffix}
            </span>
          </div>
          
          {/* Label and description */}
          <h3 className="text-sm font-semibold text-foreground mb-1">
            {stat.label}
          </h3>
          <p className="text-xs text-muted-foreground">
            {stat.description}
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<ReturnType<typeof buildStatsFromApi>>(() =>
    buildStatsFromApi({ active_sessions: 0, pending_review: 0, approved_today: 0 })
  );
  const [loadingDemo, setLoadingDemo] = useState(false);

  useEffect(() => {
    getDashboardStats()
      .then((data) => setStats(buildStatsFromApi(data)))
      .catch(() => {});
  }, []);

  const handleOpenDemoCase = async (sessionId: string) => {
    setLoadingDemo(true);
    try {
      // Verify demo session exists
      await getSession(sessionId);
      // Navigate to intake session page with demo session ID
      navigate("/intake", { state: { sessionId, isDemo: true } });
    } catch (err) {
      console.error("Demo session not available:", err);
      setLoadingDemo(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] relative overflow-hidden">
      {/* Background elements */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-success/5 rounded-full blur-3xl" />
        <div 
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `radial-gradient(hsl(var(--foreground)) 1px, transparent 1px)`,
            backgroundSize: '24px 24px'
          }}
        />
      </div>

      <div className="container py-12 max-w-5xl relative">
        {/* Header */}
        <motion.div
          className="mb-10"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex items-center gap-3 mb-3">
            <motion.div 
              className="p-2 rounded-xl bg-primary/10 ring-1 ring-primary/20"
              animate={{ 
                boxShadow: [
                  "0 0 0 0 hsl(var(--primary) / 0)",
                  "0 0 0 8px hsl(var(--primary) / 0.1)",
                  "0 0 0 0 hsl(var(--primary) / 0)"
                ]
              }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Activity className="h-5 w-5 text-primary" />
            </motion.div>
            <Badge variant="outline" className="bg-success/10 text-success border-success/20 gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              System Online
            </Badge>
          </div>
          
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Hospital Dashboard
          </h1>
          <p className="text-muted-foreground max-w-lg">
            Real-time overview of emergency documentation performance and AI-assisted intake metrics.
          </p>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid gap-6 md:grid-cols-3 mb-10">
          {stats.map((stat, index) => (
            <StatCard key={stat.label} stat={stat} index={index} />
          ))}
        </div>

        {/* Demo Cases Fallback */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="space-y-4"
        >
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-2 flex items-center gap-2">
              <PlayCircle className="h-5 w-5 text-primary" />
              Demo Cases (Live Simulation)
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Pre-loaded demo cases with realistic live transcription simulation. 
              Transcript lines appear one by one, then automatically proceed to extraction/questions.
            </p>
          </div>
          
          <div className="grid auto-rows-fr sm:grid-cols-2 lg:grid-cols-2 gap-4">
            {/* Non-Emergency Demo */}
            <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10 h-full flex flex-col">
              <CardContent className="p-6 flex flex-col flex-1">
                <div className="flex flex-col flex-1 space-y-4">
                  <div className="flex-1">
                    <h4 className="font-semibold text-foreground mb-1">Non-Emergency Case</h4>
                    <p className="text-xs text-muted-foreground">
                      Ananya, 18-year-old female with fever and headache. Includes follow-up questions.
                    </p>
                  </div>
                  <Button
                    onClick={() => handleOpenDemoCase("DEMO-CASE-1")}
                    disabled={loadingDemo}
                    className="w-full gap-2 bg-primary hover:bg-primary/90 mt-auto"
                  >
                    {loadingDemo ? (
                      <>
                        <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <PlayCircle className="h-4 w-4" />
                        Open Non-Emergency Demo
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Emergency Demo */}
            <Card className="border-destructive/30 bg-gradient-to-br from-destructive/5 to-destructive/10 h-full flex flex-col">
              <CardContent className="p-6 flex flex-col flex-1">
                <div className="flex flex-col flex-1 space-y-4">
                  <div className="flex-1">
                    <h4 className="font-semibold text-foreground mb-1">Emergency Case</h4>
                    <p className="text-xs text-muted-foreground">
                      45-year-old male, collapsed with chest pain. Critical vitals, unconscious.
                    </p>
                  </div>
                  <Button
                    onClick={() => handleOpenDemoCase("DEMO-EMERGENCY-1")}
                    disabled={loadingDemo}
                    variant="destructive"
                    className="w-full gap-2 mt-auto"
                  >
                    {loadingDemo ? (
                      <>
                        <div className="h-4 w-4 border-2 border-destructive-foreground/30 border-t-destructive-foreground rounded-full animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <PlayCircle className="h-4 w-4" />
                        Open Emergency Demo
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Multilingual Demo (English & Tamil) */}
            <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-amber-600/10 h-full flex flex-col">
              <CardContent className="p-6 flex flex-col flex-1">
                <div className="flex flex-col flex-1 space-y-4">
                  <div className="flex-1">
                    <h4 className="font-semibold text-foreground mb-1">Multilingual (English & Tamil)</h4>
                    <p className="text-xs text-muted-foreground">
                      Caregiver in Tamil, doctor in English. Whisper translates all to English for extraction.
                    </p>
                  </div>
                  <Button
                    onClick={() => handleOpenDemoCase("DEMO-MULTILINGUAL-1")}
                    disabled={loadingDemo}
                    className="w-full gap-2 mt-auto bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    {loadingDemo ? (
                      <>
                        <div className="h-4 w-4 border-2 border-amber-200 border-t-white rounded-full animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <PlayCircle className="h-4 w-4" />
                        Open Multilingual Demo
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Tamil Non-Emergency Demo */}
            <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-emerald-600/10 h-full flex flex-col">
              <CardContent className="p-6 flex flex-col flex-1">
                <div className="flex flex-col flex-1 space-y-4">
                  <div className="flex-1">
                    <h4 className="font-semibold text-foreground mb-1">Tamil (Non-Emergency)</h4>
                    <p className="text-xs text-muted-foreground">
                      Caregiver speaks Tamil; Whisper translates to English for extraction. Includes follow-up questions.
                    </p>
                  </div>
                  <Button
                    onClick={() => handleOpenDemoCase("DEMO-TAMIL-NONEMERG-1")}
                    disabled={loadingDemo}
                    className="w-full gap-2 mt-auto bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {loadingDemo ? (
                      <>
                        <div className="h-4 w-4 border-2 border-emerald-200 border-t-white rounded-full animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <PlayCircle className="h-4 w-4" />
                        Open Tamil Non-Emergency Demo
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
