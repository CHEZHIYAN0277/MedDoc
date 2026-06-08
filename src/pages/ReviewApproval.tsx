import { useState, useCallback, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { getReviewForm, saveReviewForm, approveSession, exportEmrSession, type ReviewFormData as ApiReviewFormData } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Check, 
  User, 
  Heart, 
  FileText,
  CheckCircle2,
  ArrowLeft,
  Sparkles,
  Brain,
  ClipboardList,
  Stethoscope,
  Activity,
  ShieldCheck
} from "lucide-react";

interface FormData {
  patientName: string;
  age: string;
  gender: string;
  chiefComplaint: string;
  timeOfOnset: string;
  presentIllness: string;
  consciousnessLevel: string;
  orientationPerson: boolean;
  orientationPlace: boolean;
  orientationTime: boolean;
  knownConditions: string;
  drugAllergies: string;
  currentMedications: string;
  bloodPressure: string;
  heartRate: string;
  temperature: string;
  respiratoryRate: string;
  oxygenSaturation: string;
  provisionalDiagnosis: string;
  investigationsOrdered: string;
  medicationsInterventions: string;
  disposition: string;
  consentObtained: string;
  consentNotObtainedReason: string;
  attendantName: string;
}

// Empty initial form data - will be populated from voice transcription
const emptyFormData: FormData = {
  patientName: "",
  age: "",
  gender: "",
  chiefComplaint: "",
  timeOfOnset: "",
  presentIllness: "",
  consciousnessLevel: "",
  orientationPerson: false,
  orientationPlace: false,
  orientationTime: false,
  knownConditions: "",
  drugAllergies: "",
  currentMedications: "",
  bloodPressure: "",
  heartRate: "",
  temperature: "",
  respiratoryRate: "",
  oxygenSaturation: "",
  provisionalDiagnosis: "",
  investigationsOrdered: "",
  medicationsInterventions: "",
  disposition: "",
  consentObtained: "",
  consentNotObtainedReason: "",
  attendantName: "",
};

export default function ReviewApproval() {
  const navigate = useNavigate();
  const location = useLocation();
  const sessionId = (location.state as { sessionId?: string } | null)?.sessionId;

  const [formData, setFormData] = useState<FormData>(emptyFormData);
  const [loading, setLoading] = useState(!!sessionId);
  const [error, setError] = useState<string | null>(null);
  const [isApproved, setIsApproved] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emrExporting, setEmrExporting] = useState(false);
  const [handoffText, setHandoffText] = useState<string>("");
  const [handoffCopied, setHandoffCopied] = useState(false);

  const buildSBAR = useCallback((f: FormData) => {
    const s = `S (Situation): ${f.chiefComplaint || "-"}${f.timeOfOnset ? `; onset ${f.timeOfOnset}` : ""}.
B (Background): ${[f.knownConditions, f.currentMedications, f.drugAllergies]
      .filter(Boolean)
      .join(" | ") || "-"}.
A (Assessment): ${[
      `Vitals BP ${f.bloodPressure || "-"}, HR ${f.heartRate || "-"}, Temp ${f.temperature || "-"}, RR ${f.respiratoryRate || "-"}, SpO₂ ${f.oxygenSaturation || "-"}`,
      f.consciousnessLevel ? `Consciousness: ${f.consciousnessLevel}` : "",
    ]
      .filter(Boolean)
      .join(". ")}.
R (Recommendation): ${[f.investigationsOrdered, f.medicationsInterventions, f.disposition].filter(Boolean).join(" | ") || "-"}.`;
    return s;
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }
    getReviewForm(sessionId)
      .then((data: ApiReviewFormData) => setFormData(data as FormData))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const updateField = useCallback(<K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleApprove = useCallback(async () => {
    if (!sessionId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await saveReviewForm(sessionId, formData as ApiReviewFormData);
      const pdfBlob = await approveSession(sessionId);

      // Trigger browser download of the returned PDF
      const url = window.URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${sessionId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setIsApproved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to approve");
    } finally {
      setIsSubmitting(false);
    }
  }, [sessionId, formData]);

  const handleDownloadEmr = useCallback(async () => {
    if (!sessionId) return;
    setEmrExporting(true);
    setError(null);
    try {
      const payload = await exportEmrSession(sessionId);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${sessionId}_emr.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to export EMR JSON");
    } finally {
      setEmrExporting(false);
    }
  }, [sessionId]);

  const handleGenerateHandoff = useCallback(() => {
    const text = buildSBAR(formData);
    setHandoffText(text);
    setHandoffCopied(false);
  }, [formData, buildSBAR]);

  const handleCopyHandoff = useCallback(async () => {
    if (!handoffText) return;
    try {
      await navigator.clipboard.writeText(handoffText);
      setHandoffCopied(true);
      setTimeout(() => setHandoffCopied(false), 1500);
    } catch {
      // ignore
    }
  }, [handoffText]);

  const handleRevise = useCallback(() => {
    navigate("/form", sessionId ? { state: { sessionId } } : undefined);
  }, [navigate, sessionId]);

  const handleBackToDashboard = useCallback(() => {
    navigate("/dashboard");
  }, [navigate]);

  if (!sessionId) {
    navigate("/intake", { replace: true });
    return null;
  }

  if (loading) {
    return (
      <div className="container py-8 max-w-5xl flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading review form...</p>
        </div>
      </div>
    );
  }

  if (isApproved) {
    return (
      <div className="container py-16 max-w-2xl">
        <Card className="border-success/50 bg-success/5">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-success/20">
              <CheckCircle2 className="h-10 w-10 text-success" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-4">
              Record Approved
            </h1>
            <p className="text-lg text-muted-foreground mb-2">
              Emergency record finalized and ready for EHR integration.
            </p>
            <p className="text-sm text-muted-foreground mb-8">
              The documentation has been saved and is now available in the hospital records system.
            </p>
            <div className="flex gap-4">
              <Button onClick={handleBackToDashboard} className="gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Go to Dashboard
              </Button>
              <Button variant="outline" onClick={() => navigate("/intake")} className="gap-2">
                <Sparkles className="h-4 w-4" />
                Start New Case
              </Button>
              <Button
                variant="outline"
                onClick={handleDownloadEmr}
                disabled={emrExporting}
                className="gap-2"
              >
                <FileText className="h-4 w-4" />
                {emrExporting ? "Exporting..." : "Download EMR JSON"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-8 max-w-5xl">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Emergency Intake Form – Review & Verification
          </h1>
          <p className="text-muted-foreground">
            Review and edit the extracted data before finalizing
          </p>
        </div>
        {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Case ID: {sessionId}</span>
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
            Pending Approval
          </Badge>
        </div>
      </div>

      <div className="space-y-6 mb-8">
        {/* Patient Identification */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="h-5 w-5 text-primary" />
              Patient Identification
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="patientName" className="text-sm text-muted-foreground">Patient Name</Label>
                <Input
                  id="patientName"
                  value={formData.patientName}
                  onChange={(e) => updateField("patientName", e.target.value)}
                  placeholder="Enter patient name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="age" className="text-sm text-muted-foreground">Age</Label>
                <Input
                  id="age"
                  value={formData.age}
                  onChange={(e) => updateField("age", e.target.value)}
                  placeholder="Enter age"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gender" className="text-sm text-muted-foreground">Gender</Label>
                <Input
                  id="gender"
                  value={formData.gender}
                  onChange={(e) => updateField("gender", e.target.value)}
                  placeholder="Enter gender"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Chief Complaint */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5 text-primary" />
              Chief Complaint
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="chiefComplaint" className="text-sm text-muted-foreground">Chief Complaint</Label>
                <Textarea
                  id="chiefComplaint"
                  value={formData.chiefComplaint}
                  onChange={(e) => updateField("chiefComplaint", e.target.value)}
                  placeholder="Enter chief complaint"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timeOfOnset" className="text-sm text-muted-foreground">Time of Onset</Label>
                <Input
                  id="timeOfOnset"
                  value={formData.timeOfOnset}
                  onChange={(e) => updateField("timeOfOnset", e.target.value)}
                  placeholder="Enter time of onset"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* History of Present Illness */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardList className="h-5 w-5 text-primary" />
              History of Present Illness
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="presentIllness" className="text-sm text-muted-foreground">Present Illness Description</Label>
              <Textarea
                id="presentIllness"
                value={formData.presentIllness}
                onChange={(e) => updateField("presentIllness", e.target.value)}
                placeholder="Enter history of present illness"
                rows={4}
              />
            </div>
          </CardContent>
        </Card>

        {/* Consciousness & Stability */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Brain className="h-5 w-5 text-primary" />
              Consciousness & Stability
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="consciousnessLevel" className="text-sm text-muted-foreground">Consciousness Level</Label>
                <Input
                  id="consciousnessLevel"
                  value={formData.consciousnessLevel}
                  onChange={(e) => updateField("consciousnessLevel", e.target.value)}
                  placeholder="Enter consciousness level"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Orientation</Label>
                <div className="flex flex-wrap gap-6 pt-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="orientationPerson"
                      checked={formData.orientationPerson}
                      onCheckedChange={(checked) => updateField("orientationPerson", checked as boolean)}
                    />
                    <Label htmlFor="orientationPerson" className="text-sm font-normal">Person</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="orientationPlace"
                      checked={formData.orientationPlace}
                      onCheckedChange={(checked) => updateField("orientationPlace", checked as boolean)}
                    />
                    <Label htmlFor="orientationPlace" className="text-sm font-normal">Place</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="orientationTime"
                      checked={formData.orientationTime}
                      onCheckedChange={(checked) => updateField("orientationTime", checked as boolean)}
                    />
                    <Label htmlFor="orientationTime" className="text-sm font-normal">Time</Label>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Relevant Medical History */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Stethoscope className="h-5 w-5 text-primary" />
              Relevant Medical History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="knownConditions" className="text-sm text-muted-foreground">Known Medical Conditions</Label>
                <Textarea
                  id="knownConditions"
                  value={formData.knownConditions}
                  onChange={(e) => updateField("knownConditions", e.target.value)}
                  placeholder="Enter known medical conditions"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="drugAllergies" className="text-sm text-muted-foreground">Drug Allergies</Label>
                <Input
                  id="drugAllergies"
                  value={formData.drugAllergies}
                  onChange={(e) => updateField("drugAllergies", e.target.value)}
                  placeholder="Enter drug allergies"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currentMedications" className="text-sm text-muted-foreground">Current Medications</Label>
                <Textarea
                  id="currentMedications"
                  value={formData.currentMedications}
                  onChange={(e) => updateField("currentMedications", e.target.value)}
                  placeholder="Enter current medications"
                  rows={3}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Vital Signs */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Heart className="h-5 w-5 text-primary" />
              Vital Signs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <div className="space-y-2">
                <Label htmlFor="bloodPressure" className="text-sm text-muted-foreground">Blood Pressure (mmHg)</Label>
                <Input
                  id="bloodPressure"
                  value={formData.bloodPressure}
                  onChange={(e) => updateField("bloodPressure", e.target.value)}
                  placeholder="e.g., 120/80"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="heartRate" className="text-sm text-muted-foreground">Heart Rate (bpm)</Label>
                <Input
                  id="heartRate"
                  value={formData.heartRate}
                  onChange={(e) => updateField("heartRate", e.target.value)}
                  placeholder="e.g., 72"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="temperature" className="text-sm text-muted-foreground">Temperature (°F)</Label>
                <Input
                  id="temperature"
                  value={formData.temperature}
                  onChange={(e) => updateField("temperature", e.target.value)}
                  placeholder="e.g., 98.6"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="respiratoryRate" className="text-sm text-muted-foreground">Respiratory Rate (/min)</Label>
                <Input
                  id="respiratoryRate"
                  value={formData.respiratoryRate}
                  onChange={(e) => updateField("respiratoryRate", e.target.value)}
                  placeholder="e.g., 16"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="oxygenSaturation" className="text-sm text-muted-foreground">SpO2 (%)</Label>
                <Input
                  id="oxygenSaturation"
                  value={formData.oxygenSaturation}
                  onChange={(e) => updateField("oxygenSaturation", e.target.value)}
                  placeholder="e.g., 98"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Provisional Diagnosis */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5 text-primary" />
              Provisional Diagnosis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="provisionalDiagnosis" className="text-sm text-muted-foreground">Working Diagnosis</Label>
              <Textarea
                id="provisionalDiagnosis"
                value={formData.provisionalDiagnosis}
                onChange={(e) => updateField("provisionalDiagnosis", e.target.value)}
                placeholder="Enter provisional diagnosis"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Plan & Orders */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardList className="h-5 w-5 text-primary" />
              Plan & Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="investigationsOrdered" className="text-sm text-muted-foreground">Investigations Ordered</Label>
                <Textarea
                  id="investigationsOrdered"
                  value={formData.investigationsOrdered}
                  onChange={(e) => updateField("investigationsOrdered", e.target.value)}
                  placeholder="Enter investigations ordered"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="medicationsInterventions" className="text-sm text-muted-foreground">Medications / Interventions</Label>
                <Textarea
                  id="medicationsInterventions"
                  value={formData.medicationsInterventions}
                  onChange={(e) => updateField("medicationsInterventions", e.target.value)}
                  placeholder="Enter medications and interventions"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="disposition" className="text-sm text-muted-foreground">Disposition</Label>
                <Textarea
                  id="disposition"
                  value={formData.disposition}
                  onChange={(e) => updateField("disposition", e.target.value)}
                  placeholder="Enter disposition plan"
                  rows={3}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Consent & Legal */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Consent & Legal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-3">
                <Label className="text-sm text-muted-foreground">Consent Obtained</Label>
                <RadioGroup
                  value={formData.consentObtained}
                  onValueChange={(value) => updateField("consentObtained", value)}
                  className="flex flex-wrap gap-6"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="yes" id="consentYes" />
                    <Label htmlFor="consentYes" className="text-sm font-normal">Yes</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id="consentNo" />
                    <Label htmlFor="consentNo" className="text-sm font-normal">No</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="not-possible" id="consentNotPossible" />
                    <Label htmlFor="consentNotPossible" className="text-sm font-normal">Not Possible (Emergency)</Label>
                  </div>
                </RadioGroup>
              </div>
              {(formData.consentObtained === "no" || formData.consentObtained === "not-possible") && (
                <div className="space-y-2">
                  <Label htmlFor="consentNotObtainedReason" className="text-sm text-muted-foreground">
                    If not obtained, Reason
                  </Label>
                  <Input
                    id="consentNotObtainedReason"
                    value={formData.consentNotObtainedReason}
                    onChange={(e) => updateField("consentNotObtainedReason", e.target.value)}
                    placeholder="Enter reason"
                  />
                </div>
              )}
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="attendantName" className="text-sm text-muted-foreground">Name of Attendant / Guardian</Label>
                <Input
                  id="attendantName"
                  value={formData.attendantName}
                  onChange={(e) => updateField("attendantName", e.target.value)}
                  placeholder="Enter attendant name"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SBAR Handoff Summary */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardList className="h-5 w-5 text-primary" />
              One‑click Handoff (SBAR)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleGenerateHandoff} variant="outline" className="gap-2">
                <Sparkles className="h-4 w-4" />
                Generate SBAR
              </Button>
              <Button onClick={handleCopyHandoff} disabled={!handoffText} className="gap-2">
                {handoffCopied ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <Textarea
              value={handoffText}
              onChange={(e) => setHandoffText(e.target.value)}
              placeholder="Click “Generate SBAR” to create a clinician handoff summary."
              className="min-h-[120px]"
            />
            <p className="text-xs text-muted-foreground">
              SBAR is generated from the clinician‑verified review form (safe for handoff notes).
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <Card className="sticky bottom-4 border-2 shadow-lg">
        <CardContent className="py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground text-center sm:text-left">
              By approving, you confirm the information is accurate and ready for hospital records.
            </p>
            <div className="flex gap-3">
              <Button
                onClick={handleRevise}
                variant="outline"
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Intake
              </Button>
              <Button
                onClick={handleApprove}
                className="gap-2 bg-success hover:bg-success/90 min-w-[200px]"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <span className="h-4 w-4 border-2 border-success-foreground/30 border-t-success-foreground rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Approve & Finalize Emergency Intake
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
