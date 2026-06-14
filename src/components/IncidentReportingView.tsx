import React, { useState, useEffect, useRef } from "react";
import {
  Mic,
  MicOff,
  Send,
  Languages,
  AlertCircle,
  CheckCircle2,
  Globe,
  Volume2,
  Trash2,
  FileText,
  MapPin,
  LocateFixed,
  Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Language {
  code: string;
  name: string;
  flag: string;
  voiceCode: string;
}

const LANGUAGES: Language[] = [
  { code: "en",  name: "English",     flag: "🇺🇸", voiceCode: "en-US"  },
  { code: "ur",  name: "اردو",        flag: "🇵🇰", voiceCode: "ur-PK"  },
  { code: "rom", name: "Roman Urdu",  flag: "🇵🇰", voiceCode: "ur-PK"  },
  { code: "ps",  name: "پښتو",        flag: "🇦🇫", voiceCode: "ps-AF"  },
  { code: "sd",  name: "سنڌي",        flag: "🇵🇰", voiceCode: "ur-PK"  },
  { code: "ar",  name: "العربية",     flag: "🇸🇦", voiceCode: "ar-SA"  },
  { code: "hi",  name: "हिन्दी",      flag: "🇮🇳", voiceCode: "hi-IN"  },
];

// Roman Urdu / Urdu keyword patterns for client-side auto-detection
const ROMAN_URDU_REGEX = /\b(pani|baadh|aag|baarish|bijli|zalzala|tezab|seli|taofan|rehna|ghar|gali|sadak|rasta|road|marg|hua|gaya|aya|hai|hain|mein|hum|tum|woh|yeh|kya|kahan|kyun|aur|lekin|magar|phir|ab|abhi|yahan|wahan|log|aadmi|bachay|auraten|maut|zakhmi|hospital|ambulance|police|fauj|madad|emergency|karachi|lahore|islamabad|peshawar|quetta|multan|rawalpindi|hyderabad|faisalabad|sector|block|area|mohalla)\b/i;
const URDU_ARABIC_REGEX = /[؀-ۿ]/;
const PASHTO_REGEX = /[پچژگی]/;

function autoDetectLanguage(text: string): { lang: Language; confidence: number } | null {
  if (!text.trim()) return null;
  if (PASHTO_REGEX.test(text))     return { lang: LANGUAGES.find(l => l.code === "ps")!,  confidence: 0.85 };
  if (URDU_ARABIC_REGEX.test(text)) return { lang: LANGUAGES.find(l => l.code === "ur")!,  confidence: 0.92 };
  if (ROMAN_URDU_REGEX.test(text))  return { lang: LANGUAGES.find(l => l.code === "rom")!, confidence: 0.78 };
  return null;
}

interface SubmissionResult {
  incidentId?: string;
  severity?: string;
  confidence?: number;
  detectedLanguage?: string;
  isRomanUrdu?: boolean;
  type?: string;
  message?: string;
  confidenceBreakdown?: {
    socialMedia:  { score: number; verdict: string };
    weather:      { score: number; verdict: string };
    mapsTraffic:  { score: number; verdict: string };
    weightedScore: number;
    displayLevel:  string;
  };
}

export default function IncidentReportingView() {
  const [report, setReport] = useState("");
  const [selectedLang, setSelectedLang] = useState(LANGUAGES[0]);
  const [isRecording, setIsRecording] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoDetected, setAutoDetected] = useState<{ lang: Language; confidence: number } | null>(null);
  const [submissionResult, setSubmissionResult] = useState<SubmissionResult | null>(null);
  const [userChoseLang, setUserChoseLang] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating]   = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const [interimText, setInterimText] = useState("");
  const recognitionRef = useRef<any>(null);
  const debounceRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-detect language as user types (debounced 700ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!report.trim() || userChoseLang) { setAutoDetected(null); return; }
    debounceRef.current = setTimeout(() => {
      const detected = autoDetectLanguage(report);
      if (detected) {
        setAutoDetected(detected);
        setSelectedLang(detected.lang);
        if (recognitionRef.current && isRecording) {
          recognitionRef.current.lang = detected.lang.voiceCode;
        }
      } else {
        setAutoDetected(null);
      }
    }, 700);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [report, userChoseLang]);

  const handleSpeak = () => {
    if (!report.trim()) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(report);
    utterance.lang = selectedLang.voiceCode;
    
    // Find matching voice
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang === selectedLang.voiceCode || v.lang.startsWith(selectedLang.code));
    if (voice) utterance.voice = voice;

    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    // Check if browser supports SpeechRecognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous    = true;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onresult = (event: any) => {
        let finalPart   = "";
        let interimPart = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) finalPart   += t + " ";
          else                           interimPart += t;
        }
        if (finalPart) {
          setReport(prev => (prev + (prev.trim() ? " " : "") + finalPart.trim()).trimStart());
          setInterimText("");
        }
        if (interimPart) setInterimText(interimPart);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsRecording(false);
        setInterimText("");
        if (event.error !== "no-speech") setError(`Voice error: ${event.error}`);
      };

      recognitionRef.current.onend = () => {
        setIsRecording(false);
        setInterimText("");
      };
    }

    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      setError(null);
      recognitionRef.current.lang = selectedLang.voiceCode;
      recognitionRef.current.start();
      setIsRecording(true);
    }
  };

  const handleLocate = () => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation not supported by this browser.");
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      (err) => {
        setLocationError(`Location unavailable: ${err.message}`);
        setLocating(false);
      },
      { timeout: 10000 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!report.trim()) return;

    setIsSubmitting(true);
    setError(null);
    setSubmissionResult(null);
    try {
      const res = await fetch('/api/ingest-signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'call',
          type:   'manual_report',
          location: location ?? undefined,
          data: {
            text: report,
            language: selectedLang.code,
            voiceCode: selectedLang.voiceCode,
            submittedVia: 'IncidentReportingView',
          },
          urgency: 7,
        }),
      });
      const json = await res.json();
      const inc  = json.incident;
      setSubmissionResult({
        incidentId:          inc?.incidentId,
        severity:            inc?.severity,
        confidence:          inc?.confidence,
        detectedLanguage:    inc?.detectedLanguage ?? autoDetected?.lang.name,
        isRomanUrdu:         inc?.isRomanUrdu,
        type:                inc?.type,
        message:             json.message,
        confidenceBreakdown: inc?.confidenceBreakdown,
      });
      setSubmitted(true);
      setReport("");
      setUserChoseLang(false);
      setTimeout(() => { setSubmitted(false); setSubmissionResult(null); }, 10000);
    } catch (err: any) {
      setError(`Submission failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0c10] text-[#e0e0e0] font-sans p-4 md:p-8 animate-in fade-in duration-500 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 mt-4 md:mt-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-[0_0_20px_rgba(6,182,212,0.1)]">
            <AlertCircle className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tighter text-white uppercase flex items-center gap-2">
              Incident <span className="text-primary">Reporting</span>
            </h1>
            <p className="text-[10px] md:text-xs font-bold text-on-surface-variant uppercase tracking-[0.3em] opacity-60">
              Maestro-Link: Multi-Lingual Priority Channel
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-white/5 p-1.5 rounded-2xl border border-white/10">
          <Globe className="w-4 h-4 text-primary ml-2 hidden sm:block" />
          <div className="flex gap-1 flex-wrap max-w-[420px]">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => { setSelectedLang(lang); setUserChoseLang(true); setAutoDetected(null); }}
                className={cn(
                  "px-2 py-1.5 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-wider transition-all",
                  selectedLang.code === lang.code
                    ? "bg-primary text-on-primary shadow-lg shadow-primary/20"
                    : "text-white/40 hover:text-white"
                )}
                title={lang.name}
              >
                <span className="mr-0.5">{lang.flag}</span>
                <span className="hidden lg:inline">{lang.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-20 md:mb-10">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-surface-container/40 backdrop-blur-md border border-white/10 rounded-[32px] p-6 md:p-8 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
              <FileText className="w-48 h-48 text-primary" />
            </div>

            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Languages className="w-5 h-5 text-primary" />
                <h2 className="text-sm md:text-base font-black tracking-tight text-white/90 uppercase">
                  Report Transcript ({selectedLang.name})
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span className="text-[9px] font-mono text-primary font-bold uppercase tracking-widest">
                  Live Encoding
                </span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
              {/* Auto-detection badge */}
              <AnimatePresence>
                {autoDetected && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-xl text-[10px] font-black uppercase tracking-wider text-primary"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    Auto-detected: {autoDetected.lang.flag} {autoDetected.lang.name}
                    <span className="ml-auto text-primary/60">
                      {Math.round(autoDetected.confidence * 100)}% confidence
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="relative">
                <textarea
                  value={report}
                  onChange={(e) => { setReport(e.target.value); if (userChoseLang && !e.target.value.trim()) setUserChoseLang(false); }}
                  placeholder={`Describe the incident in ${selectedLang.name}… (language auto-detects as you type)`}
                  className={cn(
                    "w-full h-64 bg-black/40 border rounded-2xl p-6 text-sm md:text-base text-white/80 placeholder:text-white/20 focus:outline-none focus:ring-1 transition-all resize-none font-medium leading-relaxed custom-scrollbar",
                    isRecording ? "border-red-500/40 focus:border-red-500/60 focus:ring-red-500/20" : "border-white/5 focus:border-primary/50 focus:ring-primary/20"
                  )}
                />
                {/* Live interim speech preview */}
                <AnimatePresence>
                  {interimText && (
                    <motion.div
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="absolute bottom-20 left-4 right-4 px-3 py-2 bg-black/60 border border-red-500/20 rounded-xl flex items-center gap-2 pointer-events-none"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse shrink-0" />
                      <span className="text-xs text-white/40 italic truncate">{interimText}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
                
                <div className="absolute bottom-4 right-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setReport("")}
                    className="p-3 bg-white/5 hover:bg-error/20 rounded-xl text-white/40 hover:text-error transition-all border border-white/5"
                    title="Clear Content"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleSpeak}
                    disabled={!report.trim()}
                    className={cn(
                      "p-3 rounded-xl border transition-all flex items-center justify-center gap-2",
                      isSpeaking 
                        ? "bg-primary text-on-primary shadow-[0_0_20px_rgba(6,182,212,0.4)] border-primary" 
                        : "bg-white/5 text-white/40 border-white/5 hover:border-primary/50 hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                    title={isSpeaking ? "Stop Reading" : "Read Aloud"}
                  >
                    <Volume2 className={cn("w-5 h-5", isSpeaking && "animate-pulse")} />
                  </button>
                  <button
                    type="button"
                    onClick={toggleRecording}
                    className={cn(
                      "p-3 rounded-xl border transition-all flex items-center justify-center gap-3",
                      isRecording 
                        ? "bg-error text-white shadow-[0_0_20px_rgba(248,113,113,0.4)] border-error" 
                        : "bg-surface text-primary border-white/5 hover:border-primary/50"
                    )}
                  >
                    {isRecording ? (
                      <>
                        <MicOff className="w-5 h-5" />
                        <span className="text-[10px] font-black uppercase tracking-widest animate-pulse">Recording</span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-5 h-5" />
                      </>
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 p-4 bg-error/10 border border-error/20 rounded-xl text-error text-xs font-bold"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </motion.div>
              )}

              <AnimatePresence>
                {submitted && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="p-6 bg-primary/10 border border-primary/20 rounded-2xl text-primary space-y-4"
                  >
                    <div className="flex items-center gap-4">
                      <CheckCircle2 className="w-8 h-8 shrink-0" />
                      <div>
                        <h4 className="text-sm font-black uppercase">Report Received — Verifying</h4>
                        <p className="text-[10px] font-bold text-primary/60 uppercase tracking-widest mt-1">
                          {submissionResult?.incidentId
                            ? `Incident ID: ${submissionResult.incidentId.slice(0, 8)}… · Marked UNVERIFIED on map`
                            : submissionResult?.message ?? "Maestro-ARES: Protocol Gamma-4 Initialized"}
                        </p>
                      </div>
                    </div>

                    {submissionResult && (
                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-primary/10">
                        {submissionResult.detectedLanguage && (
                          <div className="bg-black/30 rounded-xl p-3">
                            <p className="text-[8px] font-black uppercase text-primary/40 mb-1">Detected Language</p>
                            <p className="text-xs font-black text-white">{submissionResult.detectedLanguage}{submissionResult.isRomanUrdu ? ' (Roman)' : ''}</p>
                          </div>
                        )}
                        {submissionResult.severity && (
                          <div className="bg-black/30 rounded-xl p-3">
                            <p className="text-[8px] font-black uppercase text-primary/40 mb-1">Severity</p>
                            <p className={cn("text-xs font-black uppercase", {
                              'text-red-400':    submissionResult.severity === 'critical',
                              'text-orange-400': submissionResult.severity === 'high',
                              'text-yellow-400': submissionResult.severity === 'medium',
                              'text-green-400':  submissionResult.severity === 'low',
                            })}>{submissionResult.severity}</p>
                          </div>
                        )}
                        {submissionResult.confidence !== undefined && (
                          <div className="bg-black/30 rounded-xl p-3">
                            <p className="text-[8px] font-black uppercase text-primary/40 mb-1">Confidence</p>
                            <p className="text-xs font-black text-white">{Math.round((submissionResult.confidence ?? 0) * 100)}%</p>
                          </div>
                        )}
                        {submissionResult.type && (
                          <div className="bg-black/30 rounded-xl p-3">
                            <p className="text-[8px] font-black uppercase text-primary/40 mb-1">Type</p>
                            <p className="text-xs font-black text-white">{submissionResult.type}</p>
                          </div>
                        )}
                        {submissionResult.confidenceBreakdown && (
                          <div className="col-span-2 bg-black/30 rounded-xl p-3 space-y-2">
                            <p className="text-[8px] font-black uppercase text-primary/40">3-Source Confidence</p>
                            {(['socialMedia', 'weather', 'mapsTraffic'] as const).map(src => {
                              const s = submissionResult.confidenceBreakdown![src];
                              if (!s) return null;
                              return (
                                <div key={src} className="flex items-center gap-3">
                                  <span className="text-[8px] uppercase text-white/40 w-20 font-bold shrink-0">{src === 'mapsTraffic' ? 'Maps' : src === 'socialMedia' ? 'Social' : 'Weather'}</span>
                                  <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-primary rounded-full" style={{ width: `${Math.round(s.score * 100)}%` }} />
                                  </div>
                                  <span className="text-[8px] font-black text-primary w-8 text-right">{Math.round(s.score * 100)}%</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Location pin */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleLocate}
                  disabled={locating}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all",
                    location
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-white/5 border-white/10 text-white/50 hover:border-primary/40 hover:text-primary"
                  )}
                >
                  {locating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : location ? (
                    <LocateFixed className="w-3.5 h-3.5" />
                  ) : (
                    <MapPin className="w-3.5 h-3.5" />
                  )}
                  {locating ? "Locating…" : location ? "Location Captured" : "Share My Location"}
                </button>
                {location && (
                  <span className="text-[9px] font-mono text-white/30">
                    {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                  </span>
                )}
                {location && (
                  <button
                    type="button"
                    onClick={() => setLocation(null)}
                    className="ml-auto text-[9px] text-white/20 hover:text-error font-bold uppercase"
                  >
                    Remove
                  </button>
                )}
              </div>
              {locationError && (
                <p className="text-[9px] text-error/70 font-bold uppercase tracking-wide -mt-2">{locationError}</p>
              )}

              <button
                disabled={!report.trim() || isSubmitting}
                className={cn(
                  "w-full py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-xs transition-all relative overflow-hidden group",
                  !report.trim() || isSubmitting
                    ? "bg-white/5 text-white/20 cursor-not-allowed border border-white/5"
                    : "bg-gradient-to-tr from-primary to-secondary text-on-primary shadow-lg hover:shadow-primary/40 active:scale-[0.98]"
                )}
              >
                <div className="flex items-center justify-center gap-3 relative z-10">
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin" />
                      <span>Encrypting...</span>
                    </>
                  ) : (
                    <>
                      <Send className={cn("w-4 h-4 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1", !report.trim() ? "opacity-20" : "")} />
                      <span>Dispatch Information</span>
                    </>
                  )}
                </div>
              </button>
            </form>
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          <div className="bg-surface-container/20 border border-white/10 rounded-[32px] p-6 md:p-8">
            <div className="flex items-center gap-3 mb-6">
              <Volume2 className="w-5 h-5 text-primary" />
              <h3 className="text-sm md:text-base font-black tracking-tight text-white/90 uppercase">
                Reporting Protocol
              </h3>
            </div>
            
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0 text-primary font-black text-xs border border-white/10">1</div>
                <div>
                  <h4 className="text-[11px] font-black text-white uppercase mb-1">Select Language</h4>
                  <p className="text-[10px] text-on-surface-variant leading-relaxed opacity-60">System supports 32 localized modules via real-time neural translation.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0 text-primary font-black text-xs border border-white/10">2</div>
                <div>
                  <h4 className="text-[11px] font-black text-white uppercase mb-1">Method Selection</h4>
                  <p className="text-[10px] text-on-surface-variant leading-relaxed opacity-60">Utilize tactile input or vocal stream for data entry. Encryption is automatic.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0 text-primary font-black text-xs border border-white/10">3</div>
                <div>
                  <h4 className="text-[11px] font-black text-white uppercase mb-1">Neural Validation</h4>
                  <p className="text-[10px] text-on-surface-variant leading-relaxed opacity-60">Data is cross-referenced with satellite telemetry and IoT sensor grids.</p>
                </div>
              </div>
            </div>
            
            <div className="mt-10 pt-6 border-t border-white/5">
              <div className="flex justify-between items-center mb-4">
                <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Active Channels</span>
                <span className="px-2 py-0.5 bg-primary/10 text-primary text-[8px] font-black rounded uppercase">Encrypted</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {["AES-256", "Quantum-Safe", "Geo-Link", "IPFS-Backup"].map(tag => (
                   <span key={tag} className="text-[8px] font-bold text-white/20 bg-white/5 px-2 py-1 rounded-full border border-white/5">{tag}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-primary/5 border border-primary/20 rounded-[32px] p-6 overflow-hidden relative group">
             <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-primary/20 blur-[50px] rounded-full group-hover:scale-150 transition-transform duration-700" />
             <div className="relative z-10">
                <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-3">Priority Support</h4>
                <p className="text-xs text-white/60 leading-relaxed font-medium italic">
                  "If verbal communication is restricted, use the silent SOS macro (Hold Record for 5s) to broadcast location telemetry immediately."
                </p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
