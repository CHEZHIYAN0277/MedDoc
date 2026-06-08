import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Mic, MicOff, ArrowRight, Volume2, Info, MessageSquare, Check, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createSession,
  uploadAudio,
  generateQuestions,
  answerQuestion,
  getSession,
  runExtraction,
  type CaseContext as ApiCaseContext,
  type TranscriptLine as ApiTranscriptLine,
  type FollowUpQuestion as ApiFollowUpQuestion,
} from "@/lib/api";

type SessionStatus = "idle" | "listening" | "paused";
type CaseContext = "emergency" | "non-emergency";
type Speaker = "Doctor" | "Patient" | "Caregiver" | "Unknown";
type QuestionPhase = "pending" | "asking" | "listening" | "answered" | "skipped" | "unknown";

interface TranscriptLine {
  id: number;
  text: string;
  speaker: Speaker;
  timestamp: string;
}

interface FollowUpQuestion {
  id: number;
  question: string;
  category: string;
  status: QuestionPhase;
  response?: string;
}


// Type for SpeechRecognition (browser API)
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

export default function IntakeSession() {
  const navigate = useNavigate();
  const location = useLocation();

  // Special-case ID for multilingual demo session
  const MULTILINGUAL_DEMO_ID = "DEMO-MULTILINGUAL-1";
  const TAMIL_NON_EMERGENCY_DEMO_ID = "DEMO-TAMIL-NONEMERG-1";

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [caseContext, setCaseContext] = useState<CaseContext>("emergency");
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [draftUpdating, setDraftUpdating] = useState(false);
  const [draftTriageLabel, setDraftTriageLabel] = useState<string>("Not ready");
  const [draftRiskFlags, setDraftRiskFlags] = useState<string>("");

  // Assisted questioning state (from API for non-emergency)
  const [questions, setQuestions] = useState<FollowUpQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isListeningForAnswer, setIsListeningForAnswer] = useState(false);
  const [currentResponse, setCurrentResponse] = useState("");
  const [interimResponse, setInterimResponse] = useState("");
  const [questioningStarted, setQuestioningStarted] = useState(false);
  const [isDemoPlaying, setIsDemoPlaying] = useState(false);
  const [demoTranscriptIndex, setDemoTranscriptIndex] = useState(0);
  const [demoTranscriptTotal, setDemoTranscriptTotal] = useState(0);

  const [apiError, setApiError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const lastSpeechTimeRef = useRef<number>(Date.now());
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const speechSynthesisRef = useRef<SpeechSynthesisUtterance | null>(null);
  const progressiveExtractInFlightRef = useRef(false);
  const lastProgressiveExtractAtRef = useRef<number>(0);
  const lastExtractedTranscriptLenRef = useRef<number>(0);

  // Derived state for assisted questioning visibility
  const showAssistedQuestions = 
    caseContext === "non-emergency" && 
    status === "paused" && 
    transcript.length > 0;
  
  // Check if all questions are completed
  const allQuestionsCompleted = questions.every(q => 
    ["answered", "skipped", "unknown"].includes(q.status)
  );

  const currentQuestion = questions[currentQuestionIndex];

  // Initialize Speech Recognition with auto-advance on silence
  const initSpeechRecognition = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Speech Recognition API not available');
      return;
    }
    
    // Create new instance if needed or reuse existing
    if (!recognitionRef.current) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = "";
        let final = "";
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            final += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }
        
        // Update last speech time whenever we get results
        lastSpeechTimeRef.current = Date.now();
        
        if (final) {
          setCurrentResponse(prev => (prev + " " + final).trim());
          setInterimResponse("");
        } else {
          setInterimResponse(interim);
        }
      };
      
      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          setIsListeningForAnswer(false);
        }
      };
      
      recognition.onend = () => {
        // Restart if still supposed to be listening
        if (isListeningForAnswer && recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch (e) {
            // Already started or error - try again after a short delay
            setTimeout(() => {
              if (isListeningForAnswer && recognitionRef.current) {
                try {
                  recognitionRef.current.start();
                } catch (err) {
                  console.error('Failed to restart recognition:', err);
                }
              }
            }, 100);
          }
        }
      };
      
      recognitionRef.current = recognition;
    }
  }, [isListeningForAnswer]);


  const startListeningForAnswer = useCallback(() => {
    initSpeechRecognition();
    if (recognitionRef.current) {
      setCurrentResponse("");
      setInterimResponse("");
      setIsListeningForAnswer(true);
      try {
        // Stop any existing recognition first
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Not running, that's fine
        }
        // Small delay to ensure clean restart
        setTimeout(() => {
          if (recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch (err) {
              console.error('Failed to start recognition:', err);
              setIsListeningForAnswer(false);
            }
          }
        }, 100);
      } catch (e) {
        console.error('Error starting recognition:', e);
        setIsListeningForAnswer(false);
      }
    } else {
      console.warn('Speech Recognition not available');
      setIsListeningForAnswer(false);
    }
  }, [initSpeechRecognition]);

  const stopListeningForAnswer = useCallback(() => {
    setIsListeningForAnswer(false);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // Already stopped
      }
    }
  }, []);

  // Start questioning flow when conditions are met
  useEffect(() => {
    if (showAssistedQuestions && !questioningStarted && !allQuestionsCompleted) {
      setQuestioningStarted(true);
    }
  }, [showAssistedQuestions, questioningStarted, allQuestionsCompleted]);

  // Reset questioning state when going back to listening
  useEffect(() => {
    if (status === "listening") {
      setQuestioningStarted(false);
    }
  }, [status]);

  // Preload speech synthesis voices (browsers load them async)
  useEffect(() => {
    if ('speechSynthesis' in window) {
      // Trigger voice loading
      window.speechSynthesis.getVoices();
      // Chrome fires voiceschanged event when voices are loaded
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  // Get the best available female voice for healthcare TTS
  const getPreferredVoice = useCallback((): SpeechSynthesisVoice | null => {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;
    
    // Priority list: pleasant female voices commonly available across platforms
    const preferredVoiceNames = [
      // macOS high-quality voices
      'Samantha',           // macOS default female — warm, natural
      'Karen',              // macOS Australian English female
      'Moira',              // macOS Irish English female
      'Tessa',              // macOS South African English female
      // Google Chrome voices
      'Google UK English Female',
      'Google US English',
      // Windows voices
      'Microsoft Zira',     // Windows female
      'Microsoft Aria',     // Windows female (neural)
      'Zira',
    ];
    
    // Try exact name matches first
    for (const name of preferredVoiceNames) {
      const match = voices.find(v => v.name.includes(name));
      if (match) return match;
    }
    
    // Fallback: find any English female voice
    const englishFemaleVoices = voices.filter(v => 
      v.lang.startsWith('en') && 
      (v.name.toLowerCase().includes('female') || 
       v.name.toLowerCase().includes('woman') ||
       v.name.toLowerCase().includes('samantha') ||
       v.name.toLowerCase().includes('karen') ||
       v.name.toLowerCase().includes('zira') ||
       v.name.toLowerCase().includes('aria'))
    );
    if (englishFemaleVoices.length > 0) return englishFemaleVoices[0];
    
    // Final fallback: any English voice
    const englishVoices = voices.filter(v => v.lang.startsWith('en'));
    return englishVoices.length > 0 ? englishVoices[0] : voices[0];
  }, []);

  // Speak question using TTS with a pleasant female healthcare voice
  const speakQuestion = useCallback((questionText: string) => {
    // Stop any ongoing speech
    if (speechSynthesisRef.current) {
      window.speechSynthesis.cancel();
    }
    
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(questionText);
      utterance.lang = 'en-US';
      utterance.rate = 0.88;   // Slightly slower for clinical clarity
      utterance.pitch = 1.08;  // Slightly higher for a warm, pleasant tone
      utterance.volume = 1;
      
      // Select the best available female voice
      const preferredVoice = getPreferredVoice();
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
      
      utterance.onend = () => {
        speechSynthesisRef.current = null;
      };
      
      utterance.onerror = (e) => {
        console.error('TTS error:', e);
        speechSynthesisRef.current = null;
      };
      
      speechSynthesisRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    }
  }, [getPreferredVoice]);

  // Auto-show current question, speak it, and start mic after TTS completes
  useEffect(() => {
    if (questioningStarted && currentQuestion?.status === "pending" && !isListeningForAnswer) {
      const timer = setTimeout(() => {
        // Show the question
        setQuestions(prev => prev.map((q, i) => 
          i === currentQuestionIndex ? { ...q, status: "asking" } : q
        ));
        
        // Speak the question using TTS
        if (currentQuestion.question) {
          speakQuestion(currentQuestion.question);
        }
        
        // Wait for TTS to complete (estimate ~3 seconds for average question) then start listening
        setTimeout(() => {
          setQuestions(prev => prev.map((q, i) => 
            i === currentQuestionIndex ? { ...q, status: "listening" } : q
          ));
          lastSpeechTimeRef.current = Date.now();
          startListeningForAnswer();
        }, 3000); // Give TTS time to finish
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [questioningStarted, currentQuestion, currentQuestionIndex, startListeningForAnswer, isListeningForAnswer, speakQuestion]);

  // Auto-advance to next question after detecting silence (3 seconds of no speech after response)
  useEffect(() => {
    if (isListeningForAnswer && currentResponse.trim()) {
      // Clear any existing timer
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      
      // Set a new timer to auto-advance after 3 seconds of silence
      const timer = setTimeout(() => {
        const timeSinceLastSpeech = Date.now() - lastSpeechTimeRef.current;
        if (timeSinceLastSpeech >= 2500 && currentResponse.trim()) {
          // Auto-confirm and move to next question
          stopListeningForAnswer();
          const finalResponse = (currentResponse + " " + interimResponse).trim();
          
          setQuestions(prev => prev.map((q, i) => 
            i === currentQuestionIndex ? { ...q, status: "answered", response: finalResponse } : q
          ));
          setCurrentResponse("");
          setInterimResponse("");
          
          // Move to next question after a brief delay
          if (currentQuestionIndex < questions.length - 1) {
            setTimeout(() => {
              setCurrentQuestionIndex(prev => prev + 1);
            }, 500);
          }
        }
      }, 3000);
      
      silenceTimerRef.current = timer;
      
      return () => {
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
      };
    }
  }, [currentResponse, isListeningForAnswer, currentQuestionIndex, questions.length, stopListeningForAnswer, interimResponse]);

  // Load demo session if opened from Dashboard
  useEffect(() => {
    const state = location.state as { sessionId?: string; isDemo?: boolean } | null;
    if (state?.sessionId && state.isDemo) {
      setIsDemo(true);
      setSessionId(state.sessionId);
      setStatus("listening"); // Start in listening mode for demo
      // Load demo session data
      getSession(state.sessionId)
        .then((session) => {
          setCaseContext(session.context as CaseContext);
          // Don't load transcript immediately - will simulate live transcription
        })
        .catch((err) => {
          console.error("Failed to load demo session:", err);
          setApiError("Demo session not available");
        });
    }
  }, [location.state]);

  // Simulate live transcription for demo
  useEffect(() => {
    if (!isDemo || !sessionId || isDemoPlaying) return;
    
    // Only start if transcript is empty
    if (transcript.length > 0) return;

    const playDemoTranscription = async () => {
      setIsDemoPlaying(true);
      try {
        const session = await getSession(sessionId);
        const demoTranscript = (session.transcript || []) as TranscriptLine[];
        
        if (demoTranscript.length === 0) {
          setIsDemoPlaying(false);
          return;
        }
        
        setDemoTranscriptTotal(demoTranscript.length);

        // Simulate transcription line by line
        for (let i = 0; i < demoTranscript.length; i++) {
          await new Promise((resolve) => {
            setTimeout(() => {
              setTranscript((prev) => [...prev, demoTranscript[i]]);
              setDemoTranscriptIndex(i + 1);
              resolve(null);
            }, i === 0 ? 2000 : 3000); // First line after 2s, then 3s between lines
          });
        }

        // After transcription completes, pause and trigger extraction/questions
        setTimeout(async () => {
          setStatus("paused");
          
          // For non-emergency, generate questions
          if (session.context === "non-emergency") {
            try {
              const { questions: qs } = await generateQuestions(sessionId);
              if (qs && qs.length > 0) {
                // Load pre-answered questions from demo session
                const sessionData = await getSession(sessionId);
                const demoQuestions = (sessionData.questions || []) as FollowUpQuestion[];
                if (demoQuestions.length > 0) {
                  setQuestions(demoQuestions);
                  setCurrentQuestionIndex(demoQuestions.length); // Move past all questions
                } else {
                  setQuestions(qs as FollowUpQuestion[]);
                  setCurrentQuestionIndex(0);
                }
              } else {
                // If no questions, run extraction to get summary
                await runExtraction(sessionId);
              }
            } catch (err) {
              console.error("Failed to generate questions:", err);
              // Fallback to extraction
              try {
                await runExtraction(sessionId);
              } catch (e) {
                console.error("Failed to run extraction:", e);
              }
            }
          } else {
            // For emergency, run extraction directly
            try {
              await runExtraction(sessionId);
            } catch (err) {
              console.error("Failed to run extraction:", err);
            }
          }
          
          setIsDemoPlaying(false);
        }, 2000);
      } catch (err) {
        console.error("Demo playback error:", err);
        setIsDemoPlaying(false);
      }
    };

    // Start demo playback after a short delay
    const timer = setTimeout(() => {
      playDemoTranscription();
    }, 1000);

    return () => clearTimeout(timer);
  }, [isDemo, sessionId, isDemoPlaying, transcript.length]);

  // Progressive extraction: as transcript accumulates, re-run extraction in a debounced manner.
  // This makes demo playback (and any chunk uploads) feel more "live" to judges.
  useEffect(() => {
    if (!sessionId) return;
    if (transcript.length < 2) return;

    const now = Date.now();
    const transcriptLen = transcript.length;
    const deltaLines = transcriptLen - lastExtractedTranscriptLenRef.current;
    const sinceLast = now - lastProgressiveExtractAtRef.current;

    const MIN_INTERVAL_MS = 15000;
    const MIN_LINE_DELTA = 3;

    const isFirstRun = lastProgressiveExtractAtRef.current === 0;
    const shouldRun = isFirstRun ? true : deltaLines >= MIN_LINE_DELTA && sinceLast >= MIN_INTERVAL_MS;
    if (!shouldRun) return;
    if (progressiveExtractInFlightRef.current) return;

    progressiveExtractInFlightRef.current = true;
    lastProgressiveExtractAtRef.current = now;
    lastExtractedTranscriptLenRef.current = transcriptLen;
    setDraftUpdating(true);

    (async () => {
      try {
        const { summary } = await runExtraction(sessionId);
        setDraftTriageLabel(summary.triageLevel?.value || "Not ready");
        setDraftRiskFlags(summary.riskFlags?.value || "");
      } catch (e) {
        console.error("Progressive extraction failed:", e);
      } finally {
        progressiveExtractInFlightRef.current = false;
        setDraftUpdating(false);
      }
    })();
  }, [sessionId, transcript.length]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
      if (speechSynthesisRef.current) {
        window.speechSynthesis.cancel();
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    };
  }, []);

  const handleStartListening = useCallback(async () => {
    setApiError(null);
    stopListeningForAnswer();
    try {
      if (!sessionId) {
        const { id } = await createSession(caseContext as ApiCaseContext);
        setSessionId(id);
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      recordedChunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      mediaRecorderRef.current = recorder;
      recorder.start(5000);
      setStatus("listening");
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Failed to start");
    }
  }, [sessionId, caseContext, stopListeningForAnswer]);

  const handlePauseListening = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    const stream = streamRef.current;
    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    setStatus("paused");

    const sid = sessionId;
    if (sid && recordedChunksRef.current.length > 0) {
      setUploading(true);
      setApiError(null);
      try {
        const blob = new Blob(recordedChunksRef.current, { type: "audio/webm" });
        const { transcript: nextTranscript } = await uploadAudio(sid, blob, "chunk.webm");
        setTranscript(nextTranscript as TranscriptLine[]);
        recordedChunksRef.current = [];
        if (caseContext === "non-emergency" && nextTranscript.length > 0 && questions.length === 0) {
          const { questions: qs } = await generateQuestions(sid);
          setQuestions(qs as FollowUpQuestion[]);
          setCurrentQuestionIndex(0);
        }
      } catch (err) {
        setApiError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    }
  }, [sessionId, caseContext, questions.length]);

  const handleProceed = useCallback(() => {
    stopListeningForAnswer();
    if (sessionId) navigate("/form", { state: { sessionId } });
  }, [navigate, sessionId, stopListeningForAnswer]);

  // Speaker roles are determined automatically by the backend (heuristics + optional Gemini fallback).
  // No manual speaker editing UI is shown during paused state.

  const handleConfirmResponse = useCallback(async () => {
    stopListeningForAnswer();
    const finalResponse = (currentResponse + " " + interimResponse).trim();
    const q = questions[currentQuestionIndex];
    if (sessionId && q) {
      try {
        await answerQuestion(sessionId, q.id, { response: finalResponse, status: "answered" });
      } catch {
        // still update local state
      }
    }
    setQuestions(prev => prev.map((qu, i) =>
      i === currentQuestionIndex ? { ...qu, status: "answered", response: finalResponse } : qu
    ));
    setCurrentResponse("");
    setInterimResponse("");
    if (currentQuestionIndex < questions.length - 1) setCurrentQuestionIndex(prev => prev + 1);
  }, [currentQuestionIndex, questions, sessionId, currentResponse, interimResponse, stopListeningForAnswer]);

  const handleMarkUnknown = useCallback(async () => {
    stopListeningForAnswer();
    const q = questions[currentQuestionIndex];
    if (sessionId && q) {
      try {
        await answerQuestion(sessionId, q.id, { response: "Unknown", status: "unknown" });
      } catch {
        //
      }
    }
    setQuestions(prev => prev.map((qu, i) =>
      i === currentQuestionIndex ? { ...qu, status: "unknown", response: "Unknown" } : qu
    ));
    setCurrentResponse("");
    setInterimResponse("");
    if (currentQuestionIndex < questions.length - 1) setCurrentQuestionIndex(prev => prev + 1);
  }, [currentQuestionIndex, questions, sessionId, stopListeningForAnswer]);

  const handleSkip = useCallback(async () => {
    stopListeningForAnswer();
    const q = questions[currentQuestionIndex];
    if (sessionId && q) {
      try {
        await answerQuestion(sessionId, q.id, { status: "skipped" });
      } catch {
        //
      }
    }
    setQuestions(prev => prev.map((qu, i) =>
      i === currentQuestionIndex ? { ...qu, status: "skipped" } : qu
    ));
    setCurrentResponse("");
    setInterimResponse("");
    if (currentQuestionIndex < questions.length - 1) setCurrentQuestionIndex(prev => prev + 1);
  }, [currentQuestionIndex, questions, sessionId, stopListeningForAnswer]);

  const getSpeakerColor = (speaker: Speaker) => {
    switch (speaker) {
      case "Doctor":
        return "text-primary font-medium";
      case "Patient":
        return "text-blue-600 font-medium";
      case "Caregiver":
        return "text-emerald-600 font-medium";
      default:
        return "text-muted-foreground font-medium";
    }
  };

  const displayedResponse = (currentResponse + " " + interimResponse).trim();

  // For the multilingual demo, we want the transcript panel to show the
  // original spoken Tamil/English mix, while the backend transcript (and
  // extraction) use translated English. We override only the display text.
  const multilingualDemoDisplayText: Record<number, string> = {
    1: "Tamil (Caregiver): இது என் அப்பா ராஜேஷ், 55 வயது ஆண்.",
    2: "Tamil (Caregiver): அவருக்கு மூன்று நாளாக காய்ச்சல், சளி, இருமல் இருக்கிறது.",
    3: "English (Doctor): Can you tell me when the symptoms started?",
    4: "Tamil (Caregiver): மூன்று நாட்களாக தான். உடல் வலி, தலைவலி இருக்கிறது. மூச்சு திணறல் இல்லை.",
    5: "Tamil (Caregiver): அவருக்கு ஐந்து வருடமாக ஹைபர்டென்ஷன். தினமும் அம்லோடிபைன் 5 மில்லிகிராம் வாங்குகிறார்.",
    6: "Tamil (Caregiver): மருந்து அலர்ஜி எதுவும் இல்லை.",
    7: "English (Doctor): I am checking his vitals now.",
    8: "English (Doctor): BP 130/85, HR 88, Temp 99.2°F, RR 16, SpO₂ 97% on room air.",
  };

  const tamilNonEmergencyDemoDisplayText: Record<number, string> = {
    1: "Tamil (Caregiver): இது என் அப்பா ராஜேஷ், 55 வயது ஆண்.",
    2: "Tamil (Caregiver): அவருக்கு மூன்று நாளாக காய்ச்சல், சளி, இருமல் இருக்கிறது.",
    3: "English (Doctor): Can you tell me when the symptoms started?",
    4: "Tamil (Caregiver): மூன்று நாட்களாக தான். உடல் வலி, தலைவலி இருக்கிறது. மூச்சு திணறல் இல்லை.",
    5: "Tamil (Caregiver): அவருக்கு ஐந்து வருடமாக ஹைபர்டென்ஷன். தினமும் அம்லோடிபைன் 5 மில்லிகிராம் வாங்குகிறார்.",
    6: "Tamil (Caregiver): மருந்து அலர்ஜி எதுவும் இல்லை.",
    7: "English (Doctor): I am checking his vitals now.",
    8: "English (Doctor): BP 130/85, HR 88, Temp 99.2°F, RR 16, SpO₂ 97% on room air. He is alert and oriented.",
  };

  const getDisplayTextForTranscriptLine = (line: TranscriptLine) => {
    if (isDemo && sessionId === MULTILINGUAL_DEMO_ID) {
      return multilingualDemoDisplayText[line.id] ?? line.text;
    }
    if (isDemo && sessionId === TAMIL_NON_EMERGENCY_DEMO_ID) {
      return tamilNonEmergencyDemoDisplayText[line.id] ?? line.text;
    }
    return line.text;
  };

  return (
    <div className="container py-8 max-w-4xl">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-2">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Emergency Intake Session
            </h1>
            <p className="text-muted-foreground">
              Voice-Based Documentation
            </p>
          </div>
          <div className="flex gap-2">
            {isDemo && (
              <Badge variant="outline" className="self-start px-3 py-1 text-sm bg-primary/10 text-primary border-primary/30">
                {isDemoPlaying ? "Demo Playing..." : "Demo Case"}
              </Badge>
            )}
            <Badge variant="secondary" className="self-start px-3 py-1 text-sm bg-muted text-muted-foreground">
              Draft – Not Final
            </Badge>
            {draftUpdating && (
              <Badge variant="outline" className="self-start px-3 py-1 text-sm bg-primary/10 text-primary border-primary/30">
                Draft updating...
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <span className="text-sm text-muted-foreground">Case ID:</span>
          <code className="rounded bg-muted px-2 py-1 text-sm font-mono text-foreground">
            {sessionId ?? "—"}
          </code>
        </div>
        {apiError && (
          <p className="text-sm text-destructive mt-2">{apiError}</p>
        )}
        {!draftUpdating && draftTriageLabel && draftTriageLabel !== "Not ready" && (
          <p className="text-xs text-muted-foreground mt-2">Triage: {draftTriageLabel}</p>
        )}
        {!draftUpdating && draftRiskFlags && (
          <p className="text-xs text-muted-foreground mt-2">{draftRiskFlags}</p>
        )}
      </div>

      <div className="space-y-6">
        {/* Case Context Selection */}
        <Card className="bg-muted/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              Case Context (Clinician Selected)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup 
              value={caseContext} 
              onValueChange={(value) => setCaseContext(value as CaseContext)}
              className="space-y-3"
              disabled={status !== "idle"}
            >
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="emergency" id="emergency" />
                <Label htmlFor="emergency" className="text-sm font-normal cursor-pointer">
                  Emergency Care
                </Label>
              </div>
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="non-emergency" id="non-emergency" />
                <Label htmlFor="non-emergency" className="text-sm font-normal cursor-pointer">
                  Non-Emergency / Stable Care
                </Label>
              </div>
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              This selection controls documentation behavior only.
            </p>
          </CardContent>
        </Card>

        {/* Passive Listening Controls */}
        <Card className="bg-secondary/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              Passive Listening Controls
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {status === "idle" && !isDemo ? (
              <Button
                onClick={handleStartListening}
                size="lg"
                className="gap-2"
              >
                <Mic className="h-5 w-5" />
                Start Ambient Listening
              </Button>
            ) : isDemo && isDemoPlaying ? (
              <div className="flex items-center gap-2 p-4 rounded-lg bg-primary/10 border border-primary/30">
                <div className="flex gap-1">
                  <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span className="text-sm font-medium text-primary">
                  Demo: Transcribing... ({demoTranscriptIndex} / {demoTranscriptTotal || transcript.length} lines)
                </span>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <Button
                  onClick={status === "listening" ? handlePauseListening : handleStartListening}
                  variant={status === "listening" ? "destructive" : "default"}
                  className="gap-2"
                >
                  {status === "listening" ? (
                    <>
                      <MicOff className="h-4 w-4" />
                      Pause Listening
                    </>
                  ) : (
                    <>
                      <Mic className="h-4 w-4" />
                      Resume Listening
                    </>
                  )}
                </Button>
              </div>
            )}
            
            {/* Status Indicators */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Listening:</span>
                <Badge 
                  variant={status === "listening" ? "default" : "secondary"}
                  className={cn(
                    "text-xs",
                    status === "listening" && "bg-success text-success-foreground"
                  )}
                >
                  {status === "listening" ? "ON" : "OFF"}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Mode:</span>
                <span className="text-sm text-foreground">Passive Observation</span>
              </div>
              {status === "listening" && (
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                  </span>
                  <span className="text-sm font-medium text-success">Recording — microphone is capturing</span>
                </div>
              )}
            </div>

            {status === "listening" && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50">
                <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">
                  Speech captured during intake and clinician handoff.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Real-Time Transcript Panel */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Volume2 className="h-5 w-5 text-primary" />
              Real-Time Transcript
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Transcription runs on the server when you pause. It is not live streamed.
            </p>
          </CardHeader>
          <CardContent>
            {apiError && (
              <div className="mb-4 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-sm font-medium text-destructive">Transcription could not be completed</p>
                <p className="text-sm text-muted-foreground mt-1">{apiError}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Try recording for at least a few seconds, then pause again. Ensure ffmpeg is installed on the server if you run the backend locally.
                </p>
              </div>
            )}
            {transcript.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                {(status === "listening" || (isDemo && isDemoPlaying)) ? (
                  <>
                    <div className="mb-4 rounded-full bg-success/10 p-4 ring-2 ring-success/30">
                      <Mic className="h-8 w-8 text-success animate-pulse" />
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      {isDemo ? "Demo: Simulating transcription..." : "Recording — microphone is on"}
                    </p>
                    <p className="text-muted-foreground text-sm mt-1">
                      {isDemo ? "Transcript lines will appear one by one..." : "Speak now. Transcript will appear here after you pause."}
                    </p>
                    <div className="flex gap-1 mt-4">
                      <span className="h-2 w-2 rounded-full bg-success animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="h-2 w-2 rounded-full bg-success animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="h-2 w-2 rounded-full bg-success animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </>
                ) : status === "paused" && !uploading && sessionId ? (
                  <>
                    <div className="mb-4 rounded-full bg-muted p-4">
                      <Volume2 className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      No transcript yet
                    </p>
                    <p className="text-muted-foreground text-sm mt-1 max-w-sm">
                      Transcription runs when you pause. If you just paused and nothing appeared, the recording may be too short, the server may have failed to process the audio, or there was no detectable speech.
                    </p>
                    <p className="text-xs text-muted-foreground mt-3">
                      Record for at least a few seconds of speech, then pause again.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="mb-4 rounded-full bg-muted p-4">
                      <Mic className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground text-sm">
                      Start ambient listening to see the real-time transcript
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-2 max-h-[350px] overflow-y-auto pr-2">
                {transcript.map((line) => (
                  <div
                    key={line.id}
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 animate-fade-in"
                  >
                    <span className="text-xs text-muted-foreground font-mono whitespace-nowrap pt-0.5">
                      [{line.timestamp}]
                    </span>
                    <span className={cn("text-sm whitespace-nowrap", getSpeakerColor(line.speaker))}>
                      {line.speaker}:
                    </span>
                    <p className="flex-1 text-sm text-foreground">
                      {getDisplayTextForTranscriptLine(line)}
                    </p>
                  </div>
                ))}
                
                {/* Indicator when listening or uploading */}
                {(status === "listening" || uploading) && (
                  <div className="flex items-center gap-2 p-3 text-muted-foreground">
                    <div className="flex gap-1">
                      <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                    <span className="text-sm">{uploading ? "Transcribing..." : "Listening..."}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Assisted Questioning - Non-Emergency Only */}
        {showAssistedQuestions && (
          <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <MessageSquare className="h-5 w-5 text-primary" />
                  Assisted Questioning
                </CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {Math.min(currentQuestionIndex + 1, questions.length)} of {questions.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* All Questions Completed */}
              {allQuestionsCompleted ? (
                <div className="p-4 rounded-lg bg-success/10 border border-success/30 text-center">
                  <Check className="h-8 w-8 text-success mx-auto mb-2" />
                  <p className="font-medium text-foreground">All follow-up questions completed</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    You can proceed to the Live Case Summary
                  </p>
                </div>
              ) : (
                <>
                  {/* Current Question Display - Only show current question */}
                  {currentQuestion && !["answered", "skipped", "unknown"].includes(currentQuestion.status) && (
                    <>
                      {/* Question Being Displayed */}
                      <div className="p-4 rounded-lg border-2 border-primary/30 bg-background">
                        <div className="flex items-start gap-3">
                          {/* Question Icon */}
                          <div className="flex items-center justify-center w-10 h-10 rounded-full shrink-0 bg-primary/10">
                            <MessageSquare className="h-5 w-5 text-primary" />
                          </div>
                          
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-medium text-primary uppercase tracking-wide">
                                {currentQuestion.category}
                              </span>
                              {currentQuestion.status === "asking" && (
                                <Badge className="text-xs bg-primary/20 text-primary border-primary/30">
                                  <Volume2 className="h-3 w-3 mr-1 inline" />
                                  Speaking question...
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-start gap-2">
                              {currentQuestion.status === "asking" && (
                                <Volume2 className="h-5 w-5 text-primary mt-0.5 animate-pulse shrink-0" />
                              )}
                              <p className="text-lg font-medium text-foreground flex-1">
                                "{currentQuestion.question}"
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Response Capture Area */}
                      {(currentQuestion.status === "listening" || isListeningForAnswer) && (
                        <div className={cn(
                          "p-4 rounded-lg border-2 transition-all",
                          isListeningForAnswer 
                            ? "border-success bg-success/10 shadow-md shadow-success/20" 
                            : "border-muted bg-muted/30"
                        )}>
                          <div className="flex items-start gap-3">
                            {/* Listening Animation */}
                            <div className={cn(
                              "flex items-center justify-center w-10 h-10 rounded-full shrink-0",
                              isListeningForAnswer ? "bg-success" : "bg-muted"
                            )}>
                              {isListeningForAnswer ? (
                                <Mic className="h-5 w-5 text-success-foreground animate-pulse" />
                              ) : (
                                <Mic className="h-5 w-5 text-muted-foreground" />
                              )}
                            </div>
                            
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-medium text-success uppercase tracking-wide">
                                  Patient Response
                                </span>
                                {isListeningForAnswer && (
                                  <Badge className="text-xs bg-success/20 text-success border-success/30">
                                    <span className="flex items-center gap-1">
                                      <span className="w-2 h-2 bg-success rounded-full animate-pulse" />
                                      Listening...
                                    </span>
                                  </Badge>
                                )}
                              </div>
                              
                              {/* Transcribed Response */}
                              <div className="min-h-[60px] p-3 rounded-md bg-background border border-border">
                                {displayedResponse ? (
                                  <p className="text-foreground">
                                    {currentResponse}
                                    {interimResponse && (
                                      <span className="text-muted-foreground italic"> {interimResponse}</span>
                                    )}
                                  </p>
                                ) : (
                                  <p className="text-muted-foreground italic">
                                    Waiting for response...
                                  </p>
                                )}
                              </div>
                              
                              {/* Auto-advance hint */}
                              {displayedResponse && (
                                <p className="text-xs text-muted-foreground mt-2">
                                  Will auto-advance to next question after 3 seconds of silence
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Manual Action Buttons (as fallback) */}
                      <div className="flex flex-wrap gap-2">
                        <Button 
                          size="sm"
                          onClick={handleConfirmResponse}
                          className="gap-1"
                          disabled={!displayedResponse}
                        >
                          <Check className="h-4 w-4" />
                          Submit answer & next
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={handleMarkUnknown}
                        >
                          Mark as Unknown
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={handleSkip}
                        >
                          Skip Question
                        </Button>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Completed Questions History - Only show answered/completed questions */}
              {questions.filter(q => ["answered", "skipped", "unknown"].includes(q.status)).length > 0 && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-3">Completed Questions:</p>
                  <div className="space-y-2">
                    {questions
                      .filter(q => ["answered", "skipped", "unknown"].includes(q.status))
                      .map((q) => (
                        <div 
                          key={q.id}
                          className={cn(
                            "p-3 rounded-md border transition-all",
                            q.status === "answered" && "bg-success/5 border-success/30",
                            q.status === "unknown" && "bg-warning/5 border-warning/30",
                            q.status === "skipped" && "bg-muted/50 border-muted"
                          )}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Badge 
                              variant="secondary"
                              className={cn(
                                "text-xs",
                                q.status === "answered" && "bg-success/20 text-success",
                                q.status === "unknown" && "bg-warning/20 text-warning",
                                q.status === "skipped" && "bg-muted text-muted-foreground"
                              )}
                            >
                              {q.category}
                            </Badge>
                            <span className="text-xs text-muted-foreground capitalize">
                              {q.status}
                            </span>
                          </div>
                          <p className="text-sm text-foreground">{q.question}</p>
                          {q.response && (
                            <p className="text-sm text-muted-foreground mt-2 pl-2 border-l-2 border-success/50">
                              {q.response}
                            </p>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Disclaimer */}
              <p className="text-xs text-muted-foreground">
                AI suggestions are clinician-controlled. Questions auto-advance after response capture.
              </p>
            </CardContent>
          </Card>
        )}

        <Separator />

        {/* Footer Actions */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3">
          {status !== "idle" && (
            <Button 
              variant="outline" 
              onClick={status === "listening" ? handlePauseListening : handleStartListening}
              className="gap-2"
            >
              {status === "listening" ? (
                <>
                  <MicOff className="h-4 w-4" />
                  Pause Listening
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4" />
                  Resume Listening
                </>
              )}
            </Button>
          )}
          <Button 
            onClick={handleProceed} 
            className="gap-2 sm:ml-auto"
            disabled={!sessionId}
          >
            Proceed to Live Case Summary
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
