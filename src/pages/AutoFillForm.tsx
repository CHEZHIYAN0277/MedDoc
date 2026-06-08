import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  getTranscript,
  runExtraction,
  getSummary,
  updateSummary,
  type LiveSummaryState,
} from "@/lib/api";
import { 
  ArrowRight, 
  Sparkles, 
  User, 
  Heart, 
  AlertTriangle,
  FileText,
  Volume2,
  CheckCircle2,
  AlertCircle,
  XCircle
} from "lucide-react";

type Confidence = "high" | "medium" | "low";

interface FormFieldData {
  value: string;
  confidence: Confidence;
  filled: boolean;
}

interface VitalSignsData {
  bloodPressure: FormFieldData;
  heartRate: FormFieldData;
  temperature: FormFieldData;
  respiratoryRate: FormFieldData;
  oxygenSaturation: FormFieldData;
}

const emptyField: FormFieldData = { value: "", confidence: "low", filled: false };

interface FormState {
  patientName: FormFieldData;
  patientAge: FormFieldData;
  gender: FormFieldData;
  chiefComplaint: FormFieldData;
  vitalSigns: VitalSignsData;
  medicalHistory: FormFieldData;
  riskFlags: FormFieldData;
  triageLevel: FormFieldData;
  presentIllness: FormFieldData;
  drugAllergies: FormFieldData;
  currentMedications: FormFieldData;
  timeOfOnset: FormFieldData;
  consciousnessLevel: FormFieldData;
  orientationPerson: FormFieldData;
  orientationPlace: FormFieldData;
  orientationTime: FormFieldData;
  knownConditions: FormFieldData;
  provisionalDiagnosis: FormFieldData;
  investigationsOrdered: FormFieldData;
  medicationsInterventions: FormFieldData;
  disposition: FormFieldData;
  consentObtained: FormFieldData;
  consentNotObtainedReason: FormFieldData;
  attendantName: FormFieldData;
}

function summaryToFormState(s: LiveSummaryState): FormState {
  const empty = emptyField;
  return {
    patientName: s.patientName ?? empty,
    patientAge: s.patientAge,
    gender: s.gender,
    chiefComplaint: s.chiefComplaint,
    vitalSigns: s.vitalSigns,
    medicalHistory: s.medicalHistory,
    riskFlags: s.riskFlags,
    triageLevel: s.triageLevel ?? empty,
    presentIllness: s.presentIllness ?? empty,
    drugAllergies: s.drugAllergies ?? empty,
    currentMedications: s.currentMedications ?? empty,
    timeOfOnset: s.timeOfOnset ?? empty,
    consciousnessLevel: s.consciousnessLevel ?? empty,
    orientationPerson: s.orientationPerson ?? empty,
    orientationPlace: s.orientationPlace ?? empty,
    orientationTime: s.orientationTime ?? empty,
    knownConditions: s.knownConditions ?? empty,
    provisionalDiagnosis: s.provisionalDiagnosis ?? empty,
    investigationsOrdered: s.investigationsOrdered ?? empty,
    medicationsInterventions: s.medicationsInterventions ?? empty,
    disposition: s.disposition ?? empty,
    consentObtained: s.consentObtained ?? empty,
    consentNotObtainedReason: s.consentNotObtainedReason ?? empty,
    attendantName: s.attendantName ?? empty,
  };
}

function formStateToSummary(f: FormState): LiveSummaryState {
  return {
    patientName: f.patientName,
    patientAge: f.patientAge,
    gender: f.gender,
    chiefComplaint: f.chiefComplaint,
    vitalSigns: f.vitalSigns,
    medicalHistory: f.medicalHistory,
    riskFlags: f.riskFlags,
    triageLevel: f.triageLevel,
    presentIllness: f.presentIllness,
    drugAllergies: f.drugAllergies,
    currentMedications: f.currentMedications,
    timeOfOnset: f.timeOfOnset,
    consciousnessLevel: f.consciousnessLevel,
    orientationPerson: f.orientationPerson,
    orientationPlace: f.orientationPlace,
    orientationTime: f.orientationTime,
    knownConditions: f.knownConditions,
    provisionalDiagnosis: f.provisionalDiagnosis,
    investigationsOrdered: f.investigationsOrdered,
    medicationsInterventions: f.medicationsInterventions,
    disposition: f.disposition,
    consentObtained: f.consentObtained,
    consentNotObtainedReason: f.consentNotObtainedReason,
    attendantName: f.attendantName,
  };
}

function ConfidenceIndicator({ confidence }: { confidence: Confidence }) {
  return (
    <div className="flex items-center gap-1.5">
      {confidence === "high" && (
        <>
          <CheckCircle2 className="h-4 w-4 text-success" />
          <span className="text-xs text-success font-medium">High</span>
        </>
      )}
      {confidence === "medium" && (
        <>
          <AlertCircle className="h-4 w-4 text-warning" />
          <span className="text-xs text-warning font-medium">Medium</span>
        </>
      )}
      {confidence === "low" && (
        <>
          <XCircle className="h-4 w-4 text-destructive" />
          <span className="text-xs text-destructive font-medium">Low – Edit Required</span>
        </>
      )}
    </div>
  );
}

export default function AutoFillForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const sessionId = (location.state as { sessionId?: string } | null)?.sessionId;

  const [formData, setFormData] = useState<FormState | null>(null);
  const [validationFlags, setValidationFlags] = useState<string[]>([]);
  const [evidence, setEvidence] = useState<Record<string, Array<{ line_id?: number; timestamp?: string; speaker?: string; text?: string }>>>({});
  const [transcriptLines, setTranscriptLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const transRes = await getTranscript(sessionId).catch(() => ({ transcript: [] }));
        if (cancelled) return;
        const transcript = transRes.transcript || [];
        setTranscriptLines(transcript.map((l) => l.text));

        // Always re-run extraction so that Q&A answers from assisted
        // questioning are incorporated into the summary fields.
        try {
          await runExtraction(sessionId);
        } catch {
          // extraction may fail if API is rate-limited; fall through to getSummary
        }
        const summary = await getSummary(sessionId).catch(() => null);
        if (cancelled) return;
        if (summary) {
          setFormData(summaryToFormState(summary));
          setValidationFlags(summary.validationFlags ?? []);
          setEvidence(summary.evidence ?? {});
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  const handleFieldChange = useCallback((field: keyof FormState, value: string) => {
    setFormData((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [field]: { ...(prev[field] as FormFieldData), value } };
      return next;
    });
  }, []);

  const handleVitalChange = useCallback((vital: keyof VitalSignsData, value: string) => {
    setFormData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        vitalSigns: {
          ...prev.vitalSigns,
          [vital]: { ...prev.vitalSigns[vital], value },
        },
      };
    });
  }, []);

  const handleProceedToReview = useCallback(async () => {
    if (!sessionId || !formData) return;
    setSaving(true);
    setError(null);
    try {
      await updateSummary(sessionId, formStateToSummary(formData));
      navigate("/review", { state: { sessionId } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [navigate, sessionId, formData]);

  const getFieldClasses = (confidence: Confidence, filled: boolean) => {
    if (!filled) return "opacity-30";
    return cn(
      "transition-all duration-300",
      confidence === "low" && "ring-2 ring-destructive/50 bg-destructive/5",
      confidence === "medium" && "ring-1 ring-warning/30"
    );
  };

  if (!sessionId) {
    navigate("/intake", { replace: true });
    return null;
  }

  if (loading || !formData) {
    return (
      <div className="container py-8 max-w-7xl flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading transcript and extraction...</p>
        </div>
      </div>
    );
  }

  // Only show sections that have at least one extracted (filled) field (same as Review form)
  const hasPersonalIdentity =
    formData.patientName.filled || formData.patientAge.filled || formData.gender.filled;
  const hasChiefComplaint = formData.chiefComplaint.filled;
  const hasPresentIllness = formData.presentIllness.filled;
  const hasDrugAllergies = formData.drugAllergies.filled;
  const hasCurrentMedications = formData.currentMedications.filled;
  const hasVitalSigns = Object.values(formData.vitalSigns).some((f) => f.filled);
  const hasMedicalHistory = formData.medicalHistory.filled;
  const hasRiskFlags = formData.riskFlags.filled;
  const triage = (formData.triageLevel?.value || "").toLowerCase();

  const triageUi = (() => {
    if (triage.includes("critical")) return { label: "Critical", cls: "bg-destructive/10 border-destructive/30 text-destructive", icon: AlertTriangle };
    if (triage.includes("urgent")) return { label: "Urgent", cls: "bg-warning/10 border-warning/30 text-warning", icon: AlertTriangle };
    return { label: "Stable", cls: "bg-success/10 border-success/30 text-success", icon: CheckCircle2 };
  })();

  const renderEvidence = (key: string) => {
    const hits = evidence?.[key];
    if (!hits || hits.length === 0) return null;
    const h = hits[0];
    const prefix = [h.timestamp ? `[${h.timestamp}]` : "", h.speaker ? `${h.speaker}:` : ""].filter(Boolean).join(" ");
    return (
      <p className="text-[11px] text-muted-foreground mt-1">
        <span className="font-medium">Evidence:</span> {prefix} {(h.text || "").slice(0, 120)}
      </p>
    );
  };
  const hasTimeOfOnset = formData.timeOfOnset.filled;
  const hasConsciousnessLevel = formData.consciousnessLevel.filled;
  const hasOrientation =
    formData.orientationPerson.filled ||
    formData.orientationPlace.filled ||
    formData.orientationTime.filled;
  const hasKnownConditions = formData.knownConditions.filled;
  const hasProvisionalDiagnosis = formData.provisionalDiagnosis.filled;
  const hasInvestigationsOrdered = formData.investigationsOrdered.filled;
  const hasMedicationsInterventions = formData.medicationsInterventions.filled;
  const hasDisposition = formData.disposition.filled;
  const hasConsent = formData.consentObtained.filled || formData.consentNotObtainedReason.filled;
  const hasAttendantName = formData.attendantName.filled;
  const hasAnyExtractedSection =
    hasPersonalIdentity ||
    hasChiefComplaint ||
    hasPresentIllness ||
    hasDrugAllergies ||
    hasCurrentMedications ||
    hasVitalSigns ||
    hasMedicalHistory ||
    hasRiskFlags ||
    hasTimeOfOnset ||
    hasConsciousnessLevel ||
    hasOrientation ||
    hasKnownConditions ||
    hasProvisionalDiagnosis ||
    hasInvestigationsOrdered ||
    hasMedicationsInterventions ||
    hasDisposition ||
    hasConsent ||
    hasAttendantName;

  return (
    <div className="container py-8 max-w-7xl">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Real-Time Emergency Medical Form
          </h1>
          <p className="text-muted-foreground">
            AI-assisted draft from the conversation. All fields require clinician review.
          </p>
        </div>
        <Badge variant="secondary" className="text-sm px-4 py-2">
          AI-assisted draft
        </Badge>
      </div>
      {error && (
        <p className="text-sm text-destructive mb-4">{error}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left: Live Transcript (Read-Only) */}
        <div className="lg:col-span-2">
          <Card className="sticky top-24 h-fit">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Volume2 className="h-5 w-5 text-primary" />
                Live Transcript
                <Badge variant="secondary" className="ml-auto text-xs">Read-Only</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
                {transcriptLines.map((line, index) => (
                  <div
                    key={index}
                    className="p-3 rounded-lg bg-muted/50 border border-border text-sm text-foreground"
                  >
                    {line}
                  </div>
                ))}
                {transcriptLines.length > 0 && (
                  <div className="mt-4 p-3 rounded-lg bg-success/10 border border-success/20 text-sm text-success flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Transcript
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Live Case Summary – only sections with extracted data */}
        <div className="lg:col-span-3 space-y-6">
          {/* Triage Banner */}
          <div className={cn("p-4 rounded-lg border flex items-center gap-3", triageUi.cls)}>
            <triageUi.icon className="h-5 w-5" />
            <div className="flex-1">
              <p className="text-sm font-semibold">Triage: {triageUi.label}</p>
              {formData.riskFlags?.value ? (
                <p className="text-xs opacity-80">{formData.riskFlags.value}</p>
              ) : (
                <p className="text-xs opacity-80">No critical red flags detected from extracted vitals.</p>
              )}
            </div>
          </div>
          {!hasAnyExtractedSection && (
            <Card className="bg-muted/30">
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">No extracted fields yet. Run extraction after transcript is available; only sections with extracted data will appear here.</p>
              </CardContent>
            </Card>
          )}

          {hasAnyExtractedSection && (
            <>
              {/* Confidence Legend */}
              <Card className="bg-muted/30">
                <CardContent className="py-4">
                  <div className="flex flex-wrap items-center gap-6">
                    <span className="text-sm font-medium text-foreground">Confidence:</span>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <span className="text-xs text-muted-foreground">High (Pending clinician review)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4 text-warning" />
                      <span className="text-xs text-muted-foreground">Medium (Requires clinician review)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <XCircle className="h-4 w-4 text-destructive" />
                      <span className="text-xs text-muted-foreground">Low (Edit required)</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Validation notes (from spaCy / backend) */}
              {validationFlags.length > 0 && (
            <Card className="border-warning/30 bg-warning/5">
              <CardContent className="py-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <span className="text-sm font-medium text-foreground">Validation notes</span>
                </div>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                  {validationFlags.map((flag, i) => (
                    <li key={i}>
                      {flag.replace(/_/g, " ").replace(/\b(\w)/g, (c) => c.toUpperCase())}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
              )}

              {/* Personal identity – only when age or gender extracted */}
              {hasPersonalIdentity && (
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <User className="h-5 w-5 text-primary" />
                      Personal identity
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div
                        className={cn(
                          "space-y-2 sm:col-span-2",
                          getFieldClasses(formData.patientName.confidence, formData.patientName.filled),
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <Label htmlFor="patientName">Patient name</Label>
                          <ConfidenceIndicator confidence={formData.patientName.confidence} />
                        </div>
                        <Input
                          id="patientName"
                          value={formData.patientName.value}
                          onChange={(e) => handleFieldChange("patientName", e.target.value)}
                          className="fade-in-field"
                        />
                        {renderEvidence("patientName")}
                      </div>

                      <div
                        className={cn(
                          "space-y-2",
                          getFieldClasses(formData.patientAge.confidence, formData.patientAge.filled),
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <Label htmlFor="age">Patient age</Label>
                          <ConfidenceIndicator confidence={formData.patientAge.confidence} />
                        </div>
                        <Input
                          id="age"
                          value={formData.patientAge.value}
                          onChange={(e) => handleFieldChange("patientAge", e.target.value)}
                          className="fade-in-field"
                        />
                        {renderEvidence("patientAge")}
                      </div>

                      <div
                        className={cn(
                          "space-y-2",
                          getFieldClasses(formData.gender.confidence, formData.gender.filled),
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <Label htmlFor="gender">Gender</Label>
                          <ConfidenceIndicator confidence={formData.gender.confidence} />
                        </div>
                        <Input
                          id="gender"
                          value={formData.gender.value}
                          onChange={(e) => handleFieldChange("gender", e.target.value)}
                          className="fade-in-field"
                        />
                        {renderEvidence("gender")}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Chief Complaint – only when extracted */}
              {hasChiefComplaint && (
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <FileText className="h-5 w-5 text-primary" />
                      Chief complaint
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={cn("space-y-2", getFieldClasses(formData.chiefComplaint.confidence, true))}>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="complaint">Primary complaint</Label>
                        <ConfidenceIndicator confidence={formData.chiefComplaint.confidence} />
                      </div>
                      <Textarea
                        id="complaint"
                        value={formData.chiefComplaint.value}
                        onChange={(e) => handleFieldChange("chiefComplaint", e.target.value)}
                        className={cn("min-h-[80px]", "fade-in-field")}
                      />
                      {renderEvidence("chiefComplaint")}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Present Illness – only when extracted */}
              {hasPresentIllness && (
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <FileText className="h-5 w-5 text-primary" />
                      Present illness
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={cn("space-y-2", getFieldClasses(formData.presentIllness.confidence, true))}>
                      <div className="flex items-center justify-between">
                        <Label>History of present illness</Label>
                        <ConfidenceIndicator confidence={formData.presentIllness.confidence} />
                      </div>
                      <Textarea
                        value={formData.presentIllness.value}
                        onChange={(e) => handleFieldChange("presentIllness", e.target.value)}
                        className={cn("min-h-[60px]", "fade-in-field")}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Drug Allergies – only when extracted */}
              {hasDrugAllergies && (
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <AlertTriangle className="h-5 w-5 text-primary" />
                      Drug allergies
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={cn("space-y-2", getFieldClasses(formData.drugAllergies.confidence, true))}>
                      <div className="flex items-center justify-between">
                        <Label>Known drug allergies</Label>
                        <ConfidenceIndicator confidence={formData.drugAllergies.confidence} />
                      </div>
                      <Input
                        value={formData.drugAllergies.value}
                        onChange={(e) => handleFieldChange("drugAllergies", e.target.value)}
                        className={cn("fade-in-field")}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Current Medications – only when extracted */}
              {hasCurrentMedications && (
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Heart className="h-5 w-5 text-primary" />
                      Current medications
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={cn("space-y-2", getFieldClasses(formData.currentMedications.confidence, true))}>
                      <div className="flex items-center justify-between">
                        <Label>Current medications</Label>
                        <ConfidenceIndicator confidence={formData.currentMedications.confidence} />
                      </div>
                      <Textarea
                        value={formData.currentMedications.value}
                        onChange={(e) => handleFieldChange("currentMedications", e.target.value)}
                        className={cn("min-h-[60px]", "fade-in-field")}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Vital Signs – only when any vital extracted */}
              {hasVitalSigns && (
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Heart className="h-5 w-5 text-primary" />
                      Vital signs
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {([
                        ["bloodPressure", "Blood pressure"],
                        ["heartRate", "Heart rate"],
                        ["temperature", "Temperature"],
                        ["respiratoryRate", "Respiratory rate"],
                        ["oxygenSaturation", "Oxygen saturation"],
                      ] as [keyof VitalSignsData, string][]).map(([key, label]) => {
                        const field = formData.vitalSigns[key];
                        const evidenceKey = `vitalSigns.${String(key)}`;
                        return (
                          <div
                            key={key}
                            className={cn(
                              "space-y-2 p-3 rounded-lg border",
                              getFieldClasses(field.confidence, field.filled),
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <Label className="text-xs">{label}</Label>
                              <ConfidenceIndicator confidence={field.confidence} />
                            </div>
                            <Input
                              value={field.value}
                              onChange={(e) => handleVitalChange(key, e.target.value)}
                              className={cn("text-sm", "fade-in-field")}
                            />
                            {renderEvidence(evidenceKey)}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Medical History – only when extracted */}
              {hasMedicalHistory && (
                <Card className={cn(formData.medicalHistory.confidence === "low" && "border-destructive/50")}>
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <FileText className="h-5 w-5 text-primary" />
                      Medical history
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={cn("space-y-2", getFieldClasses(formData.medicalHistory.confidence, true))}>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="history">Relevant history</Label>
                        <ConfidenceIndicator confidence={formData.medicalHistory.confidence} />
                      </div>
                      <Textarea
                        id="history"
                        value={formData.medicalHistory.value}
                        onChange={(e) => handleFieldChange("medicalHistory", e.target.value)}
                        className={cn("min-h-[80px]", "fade-in-field")}
                      />
                      {formData.medicalHistory.confidence === "low" && (
                        <p className="text-xs text-destructive flex items-center gap-1 mt-2">
                          <AlertTriangle className="h-3 w-3" />
                          This field requires manual verification
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Risk Flags – only when extracted */}
              {hasRiskFlags && (
                <Card className="border-warning/30 bg-warning/5">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <AlertTriangle className="h-5 w-5 text-warning" />
                      Risk flags
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>Identified risks</Label>
                        <ConfidenceIndicator confidence={formData.riskFlags.confidence} />
                      </div>
                      <div className="flex flex-wrap gap-2 fade-in-field">
                        {formData.riskFlags.value.split(",").map((flag, index) => (
                          <Badge
                            key={index}
                            variant="outline"
                            className="bg-warning/10 text-warning border-warning/30 px-3 py-1.5"
                          >
                            <AlertTriangle className="h-3 w-3 mr-1.5" />
                            {flag.trim()}
                          </Badge>
                        ))}
                      </div>
                      <Input
                        value={formData.riskFlags.value}
                        onChange={(e) => handleFieldChange("riskFlags", e.target.value)}
                        placeholder="Edit risk flags (comma-separated)"
                        className="mt-2 text-sm"
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Time of onset */}
              {hasTimeOfOnset && (
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg">Time of onset</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={cn("space-y-2", getFieldClasses(formData.timeOfOnset.confidence, true))}>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="timeOfOnset">When did symptoms start?</Label>
                        <ConfidenceIndicator confidence={formData.timeOfOnset.confidence} />
                      </div>
                      <Input
                        id="timeOfOnset"
                        value={formData.timeOfOnset.value}
                        onChange={(e) => handleFieldChange("timeOfOnset", e.target.value)}
                        className="fade-in-field"
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Consciousness level */}
              {hasConsciousnessLevel && (
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg">Consciousness level</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={cn("space-y-2", getFieldClasses(formData.consciousnessLevel.confidence, true))}>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="consciousnessLevel">Level of consciousness</Label>
                        <ConfidenceIndicator confidence={formData.consciousnessLevel.confidence} />
                      </div>
                      <Input
                        id="consciousnessLevel"
                        value={formData.consciousnessLevel.value}
                        onChange={(e) => handleFieldChange("consciousnessLevel", e.target.value)}
                        className="fade-in-field"
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Orientation */}
              {hasOrientation && (
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg">Orientation</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div
                        className={cn(
                          "space-y-2",
                          getFieldClasses(
                            formData.orientationPerson.confidence,
                            formData.orientationPerson.filled,
                          ),
                        )}
                      >
                        <Label htmlFor="orientationPerson">Person</Label>
                        <Input
                          id="orientationPerson"
                          value={formData.orientationPerson.value}
                          onChange={(e) => handleFieldChange("orientationPerson", e.target.value)}
                          className="fade-in-field"
                        />
                      </div>
                      <div
                        className={cn(
                          "space-y-2",
                          getFieldClasses(
                            formData.orientationPlace.confidence,
                            formData.orientationPlace.filled,
                          ),
                        )}
                      >
                        <Label htmlFor="orientationPlace">Place</Label>
                        <Input
                          id="orientationPlace"
                          value={formData.orientationPlace.value}
                          onChange={(e) => handleFieldChange("orientationPlace", e.target.value)}
                          className="fade-in-field"
                        />
                      </div>
                      <div
                        className={cn(
                          "space-y-2",
                          getFieldClasses(
                            formData.orientationTime.confidence,
                            formData.orientationTime.filled,
                          ),
                        )}
                      >
                        <Label htmlFor="orientationTime">Time</Label>
                        <Input
                          id="orientationTime"
                          value={formData.orientationTime.value}
                          onChange={(e) => handleFieldChange("orientationTime", e.target.value)}
                          className="fade-in-field"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Known conditions */}
              {hasKnownConditions && (
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg">Known conditions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={cn("space-y-2", getFieldClasses(formData.knownConditions.confidence, true))}>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="knownConditions">Known medical conditions</Label>
                        <ConfidenceIndicator confidence={formData.knownConditions.confidence} />
                      </div>
                      <Textarea
                        id="knownConditions"
                        value={formData.knownConditions.value}
                        onChange={(e) => handleFieldChange("knownConditions", e.target.value)}
                        className={cn("min-h-[60px]", "fade-in-field")}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Provisional diagnosis */}
              {hasProvisionalDiagnosis && (
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg">Provisional diagnosis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={cn("space-y-2", getFieldClasses(formData.provisionalDiagnosis.confidence, true))}>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="provisionalDiagnosis">Provisional diagnosis</Label>
                        <ConfidenceIndicator confidence={formData.provisionalDiagnosis.confidence} />
                      </div>
                      <Textarea
                        id="provisionalDiagnosis"
                        value={formData.provisionalDiagnosis.value}
                        onChange={(e) => handleFieldChange("provisionalDiagnosis", e.target.value)}
                        className={cn("min-h-[60px]", "fade-in-field")}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Investigations ordered */}
              {hasInvestigationsOrdered && (
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg">Investigations ordered</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={cn("space-y-2", getFieldClasses(formData.investigationsOrdered.confidence, true))}>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="investigationsOrdered">Investigations ordered</Label>
                        <ConfidenceIndicator confidence={formData.investigationsOrdered.confidence} />
                      </div>
                      <Textarea
                        id="investigationsOrdered"
                        value={formData.investigationsOrdered.value}
                        onChange={(e) => handleFieldChange("investigationsOrdered", e.target.value)}
                        className={cn("min-h-[60px]", "fade-in-field")}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Medications / interventions */}
              {hasMedicationsInterventions && (
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg">Medications / interventions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={cn("space-y-2", getFieldClasses(formData.medicationsInterventions.confidence, true))}>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="medicationsInterventions">Medications and interventions</Label>
                        <ConfidenceIndicator confidence={formData.medicationsInterventions.confidence} />
                      </div>
                      <Textarea
                        id="medicationsInterventions"
                        value={formData.medicationsInterventions.value}
                        onChange={(e) => handleFieldChange("medicationsInterventions", e.target.value)}
                        className={cn("min-h-[60px]", "fade-in-field")}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Disposition */}
              {hasDisposition && (
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg">Disposition</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={cn("space-y-2", getFieldClasses(formData.disposition.confidence, true))}>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="disposition">Disposition</Label>
                        <ConfidenceIndicator confidence={formData.disposition.confidence} />
                      </div>
                      <Input
                        id="disposition"
                        value={formData.disposition.value}
                        onChange={(e) => handleFieldChange("disposition", e.target.value)}
                        className="fade-in-field"
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Consent */}
              {hasConsent && (
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg">Consent</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div
                        className={cn(
                          "space-y-2",
                          getFieldClasses(
                            formData.consentObtained.confidence,
                            formData.consentObtained.filled,
                          ),
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <Label htmlFor="consentObtained">Consent obtained</Label>
                          <ConfidenceIndicator confidence={formData.consentObtained.confidence} />
                        </div>
                        <Input
                          id="consentObtained"
                          value={formData.consentObtained.value}
                          onChange={(e) => handleFieldChange("consentObtained", e.target.value)}
                          className="fade-in-field"
                        />
                      </div>
                      <div
                        className={cn(
                          "space-y-2",
                          getFieldClasses(
                            formData.consentNotObtainedReason.confidence,
                            formData.consentNotObtainedReason.filled,
                          ),
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <Label htmlFor="consentNotObtainedReason">Reason consent not obtained</Label>
                          <ConfidenceIndicator
                            confidence={formData.consentNotObtainedReason.confidence}
                          />
                        </div>
                        <Input
                          id="consentNotObtainedReason"
                          value={formData.consentNotObtainedReason.value}
                          onChange={(e) => handleFieldChange("consentNotObtainedReason", e.target.value)}
                          className="fade-in-field"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Attendant name */}
              {hasAttendantName && (
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg">Attendant</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={cn("space-y-2", getFieldClasses(formData.attendantName.confidence, true))}>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="attendantName">Attendant name</Label>
                        <ConfidenceIndicator confidence={formData.attendantName.confidence} />
                      </div>
                      <Input
                        id="attendantName"
                        value={formData.attendantName.value}
                        onChange={(e) => handleFieldChange("attendantName", e.target.value)}
                        className="fade-in-field"
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Action Button */}
              <div className="flex justify-end pt-4">
                <Button
                  onClick={handleProceedToReview}
                  className="gap-2 h-12 px-8"
                  size="lg"
                  disabled={saving}
                >
                  Proceed to Review & Approval
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
