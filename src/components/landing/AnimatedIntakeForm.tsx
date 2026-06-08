import { motion, useTransform, MotionValue, useMotionTemplate } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, FileText } from "lucide-react";
import { useMemo } from "react";

interface AnimatedIntakeFormProps {
  scrollYProgress: MotionValue<number>;
}

interface FormFieldProps {
  label: string;
  value: string;
  progress: MotionValue<number>;
  startAt: number;
  endAt: number;
  isFirstField: boolean;
  prevEndAt?: number;
}

function TypewriterField({ label, value, progress, startAt, endAt, isFirstField, prevEndAt }: FormFieldProps) {
  const fieldProgress = useTransform(progress, [startAt, endAt], [0, 1]);
  const chars = useTransform(fieldProgress, (p) => Math.floor(p * value.length));
  const checkOpacity = useTransform(progress, [endAt - 0.02, endAt], [0, 1]);
  
  // "Listening..." shows for ALL unfilled fields (before typing starts)
  const listeningOpacity = useTransform(progress, (p) => {
    if (p < startAt) return 1;
    return 0;
  });

  // Cursor shows on active field only - use scale to show/hide so it doesn't interfere with blink animation
  const cursorScale = useTransform(progress, (p) => {
    if (isFirstField) {
      // First field: show cursor from start until this field completes
      return p < endAt ? 1 : 0;
    } else {
      // Other fields: show cursor after prev field completes and before this one completes
      return (p >= (prevEndAt ?? 0) && p < endAt) ? 1 : 0;
    }
  });

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </label>
      <div className="relative flex items-center gap-2">
        <div className="flex-1 bg-background/50 border border-border/50 rounded-lg px-3 py-2 text-sm font-mono min-h-[38px] flex items-center">
          {/* Listening state - shows for all unfilled fields */}
          <motion.span 
            className="absolute text-muted-foreground/50 select-none"
            style={{ opacity: listeningOpacity }}
          >
            Listening...
          </motion.span>
          
          {/* Actual typed value with cursor */}
          <span className="text-foreground relative z-10 flex items-center">
            <motion.span>{useTransform(chars, (c) => value.slice(0, c))}</motion.span>
            <motion.span 
              className="inline-block w-0.5 h-4 bg-primary ml-0.5 animate-cursor-blink origin-bottom"
              style={{ scaleY: cursorScale, scaleX: cursorScale }}
            />
          </span>
          
        </div>
        <motion.div 
          className="flex items-center justify-center w-6 h-6 rounded-full bg-success/20 text-success"
          style={{ opacity: checkOpacity, scale: checkOpacity }}
        >
          <Check className="w-3.5 h-3.5" />
        </motion.div>
      </div>
    </div>
  );
}

function RiskBadge({ 
  label, 
  progress, 
  appearAt 
}: { 
  label: string; 
  progress: MotionValue<number>; 
  appearAt: number;
}) {
  const opacity = useTransform(progress, [appearAt, appearAt + 0.05], [0, 1]);
  const x = useTransform(progress, [appearAt, appearAt + 0.05], [20, 0]);

  return (
    <motion.span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-urgent/10 text-urgent border border-urgent/20 text-xs font-medium"
      style={{ opacity, x }}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-urgent" />
      {label}
    </motion.span>
  );
}

export default function AnimatedIntakeForm({ scrollYProgress }: AnimatedIntakeFormProps) {
  const cardScale = useTransform(scrollYProgress, [0, 0.1], [0.97, 1]);
  const glowOpacity = useTransform(scrollYProgress, [0.60, 0.67], [0, 1]);

  const formFields = [
    { label: "Patient Age", value: "45 years old", startAt: 0.05, endAt: 0.15 },
    { label: "Gender", value: "Male", startAt: 0.17, endAt: 0.24 },
    { label: "Chief Complaint", value: "Chest pain, left arm", startAt: 0.26, endAt: 0.38 },
    { label: "Vital Signs", value: "BP 158/95, HR 98", startAt: 0.40, endAt: 0.50 },
  ];

  const riskBadges = [
    { label: "Cardiac Risk", appearAt: 0.52 },
    { label: "Priority: High", appearAt: 0.57 },
  ];

  return (
    <motion.div
      className="relative"
      style={{ scale: cardScale }}
    >
      {/* Glow effect when complete */}
      <motion.div
        className="absolute -inset-2 rounded-3xl bg-gradient-to-r from-success/20 via-primary/20 to-success/20 blur-xl"
        style={{ opacity: glowOpacity }}
      />
      
      <Card className="relative bg-card/60 backdrop-blur-xl border border-border/50 shadow-2xl rounded-2xl overflow-hidden">
        <CardHeader className="pb-4 border-b border-border/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold">Emergency Intake Form</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">AI-assisted draft in progress</p>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="pt-4 space-y-3">
          {formFields.map((field, index) => (
            <TypewriterField
              key={field.label}
              label={field.label}
              value={field.value}
              progress={scrollYProgress}
              startAt={field.startAt}
              endAt={field.endAt}
              isFirstField={index === 0}
              prevEndAt={index > 0 ? formFields[index - 1].endAt : undefined}
            />
          ))}

          {/* Risk Flags Section - label always visible */}
          <div className="pt-2 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Risk Flags
            </label>
            <div className="flex flex-wrap gap-2 min-h-[28px]">
              {riskBadges.map((badge) => (
                <RiskBadge
                  key={badge.label}
                  label={badge.label}
                  progress={scrollYProgress}
                  appearAt={badge.appearAt}
                />
              ))}
            </div>
          </div>

          {/* Confidence indicator */}
          <motion.div 
            className="pt-3 flex items-center gap-2 text-xs text-success"
            style={{ opacity: useTransform(scrollYProgress, [0.62, 0.68], [0, 1]) }}
          >
            <Check className="w-4 h-4" />
            <span className="font-medium">Draft ready for clinician review</span>
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
