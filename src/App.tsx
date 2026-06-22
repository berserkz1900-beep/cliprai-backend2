import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Video,
  Youtube,
  Scissors,
  Type,
  Download,
  Settings,
  RefreshCw,
  Layers,
  Sparkles,
  Check,
  AlertTriangle,
  FileText,
  Info,
  Clock,
  Sliders,
  Play,
  ArrowRight
} from "lucide-react";

interface TranscriptSegment {
  timestamp: string;
  seconds: number;
  text: string;
}

export default function App() {
  // Input states
  const [youtubeUrl, setYoutubeUrl] = useState("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  const [useDemoMode, setUseDemoMode] = useState(false);
  
  // API Loading & Result States
  const [isFetchingTranscript, setIsFetchingTranscript] = useState(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  
  // Video Metadata
  const [videoMetadata, setVideoMetadata] = useState<{
    videoId: string;
    title: string;
    duration: number; // in seconds
    transcript: string;
    wordCount: number;
  } | null>(null);

  // Segment Selector States
  const [hookStart, setHookStart] = useState(0);
  const [hookEnd, setHookEnd] = useState(3);
  const [bodyStart, setBodyStart] = useState(3);
  const [bodyEnd, setBodyEnd] = useState(15);
  const [endingStart, setEndingStart] = useState(15);
  const [endingEnd, setEndingEnd] = useState(20);

  // Caption Customizations
  const [hookText, setHookText] = useState("WAIT FOR IT! 😱");
  const [subHook, setSubHook] = useState("Mindblowing Moment");
  const [captions, setCaptions] = useState<string[]>([
    "OPUS CLIP",
    "ALTERNATIVE",
    "CLIPR.AI",
    "FREE FOREVER"
  ]);

  const [platform, setPlatform] = useState("tiktok"); // tiktok, shorts, reels

  // Job processing & polling states
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<{
    status: string;
    progress: number;
    step: string;
    downloadUrl?: string;
    error?: string;
  } | null>(null);

  // Parsed Transcript Items for Clicking Interaction
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);

  // Local static demo transcripts if user wants to play immediately or if key is missing
  const demoTranscriptOption = {
    videoId: "dQw4w9WgXcQ",
    title: "Awesome Podcast - The Secrets of Visual Engineering with FFmpeg",
    duration: 180,
    wordCount: 145,
    transcript: `[0:00] Hey guys, today we are going to build the ultimate video clipper.
[0:02] It's called CLIPR.AI, and it divides long landscape videos into viral shorts.
[0:05] Wait for it - you don't need any complex AI cloud setup or expensive tools!
[0:09] First, we download the highest resolution standard stream using yt-dlp.
[0:12] Next, we cut it up neatly, combine the parts, and crop it to vertical 9:16.
[0:16] Finally, we bake in animated captions at the bottom with FFmpeg!
[0:19] This is a free alternative to Opus Clip running directly on your server!
[0:22] Try deploying it yourself and start generating unlimited clips instantly.
[0:26] Make sure to star the repository and share this with your friends!`
  };

  // Synchronize parsed transcript segments whenever metadata updates
  useEffect(() => {
    if (videoMetadata) {
      setTranscriptSegments(parseTranscriptToSegments(videoMetadata.transcript));
    } else {
      setTranscriptSegments([]);
    }
  }, [videoMetadata]);

  // Parse [M:SS] Text lines
  function parseTranscriptToSegments(rawText: string): TranscriptSegment[] {
    if (!rawText) return [];
    const lines = rawText.split("\n");
    const parsed: TranscriptSegment[] = [];

    for (const line of lines) {
      const match = line.match(/^\[(\d+):(\d+)\]\s*(.*)/);
      if (match) {
        const mins = parseInt(match[1], 10);
        const secs = parseInt(match[2], 10);
        const totalSeconds = mins * 60 + secs;
        parsed.push({
          timestamp: `${mins}:${secs.toString().padStart(2, "0")}`,
          seconds: totalSeconds,
          text: match[3].trim()
        });
      } else if (line.trim()) {
        parsed.push({
          timestamp: "0:00",
          seconds: 0,
          text: line.trim()
        });
      }
    }
    return parsed;
  }

  // Handle Transcript Retrieval
  async function fetchTranscript() {
    setIsFetchingTranscript(true);
    setTranscriptError(null);
    setVideoMetadata(null);

    if (useDemoMode) {
      setTimeout(() => {
        setVideoMetadata({ ...demoTranscriptOption });
        // Set standard segment times based on duration
        setHookStart(0);
        setHookEnd(3);
        setBodyStart(3);
        setBodyEnd(15);
        setEndingStart(15);
        setEndingEnd(25);
        setIsFetchingTranscript(false);
      }, 800);
      return;
    }

    try {
      const response = await fetch("/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: youtubeUrl })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `Server returned error status ${response.status}`);
      }

      if (result.success) {
        setVideoMetadata({
          videoId: result.videoId,
          title: result.title,
          duration: result.duration,
          transcript: result.transcript,
          wordCount: result.wordCount
        });
        
        // Populate standard ranges
        const totalDur = result.duration || 60;
        setHookStart(0);
        setHookEnd(Math.min(3, totalDur));
        setBodyStart(Math.min(3, totalDur));
        setBodyEnd(Math.min(15, totalDur));
        setEndingStart(Math.min(15, totalDur));
        setEndingEnd(Math.min(25, totalDur));
      } else {
        throw new Error(result.error || "Failed to parse transcript");
      }
    } catch (err: any) {
      console.error(err);
      setTranscriptError(err.message || "An error occurred while fetching video transcripts.");
      
      // Proactively prompt fallback option for supreme user-friendliness
      setTranscriptError(
        `${err.message || 'Can not connect.'} (Tip: If you haven't configured your SUPADATA_KEY secret yet, please check 'Use Local Demo Mode' above to explore CLIPR.AI instantly!)`
      );
    } finally {
      setIsFetchingTranscript(false);
    }
  }

  // Set time targets based on clicking transcript segments
  const handleSegmentClick = (item: TranscriptSegment, targetType: "hook" | "body" | "ending", isStart: boolean) => {
    const value = item.seconds;
    if (targetType === "hook") {
      if (isStart) setHookStart(value);
      else setHookEnd(Math.max(value, hookStart + 1));
    } else if (targetType === "body") {
      if (isStart) setBodyStart(value);
      else setBodyEnd(Math.max(value, bodyStart + 1));
    } else if (targetType === "ending") {
      if (isStart) setEndingStart(value);
      else setEndingEnd(Math.max(value, endingStart + 1));
    }
  };

  // Handle CLIP Processing Launch
  async function handleCreateClip() {
    if (!videoMetadata) return;

    setIsProcessing(true);
    setJobStatus({
      status: "processing",
      progress: 0,
      step: "Initializing process..."
    });

    const bodyPayload = {
      url: youtubeUrl,
      videoId: videoMetadata.videoId,
      clipId: uuidv4(),
      hook: { startSeconds: hookStart, endSeconds: hookEnd },
      body: { startSeconds: bodyStart, endSeconds: bodyEnd },
      ending: { startSeconds: endingStart, endSeconds: endingEnd },
      captions,
      hookText,
      subHook,
      platform
    };

    try {
      const response = await fetch("/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to start cutting process.");
      }

      if (result.success && result.jobId) {
        setActiveJobId(result.jobId);
        startStatusPolling(result.jobId);
      } else {
        throw new Error("No Job ID returned from processing.");
      }
    } catch (err: any) {
      setIsProcessing(false);
      setJobStatus({
        status: "error",
        progress: 0,
        step: "Failed",
        error: err.message || "Could not launch job."
      });
    }
  }

  // Generate local unique job identifier helper
  function uuidv4() {
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c: any) =>
      (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
    );
  }

  // Poll status interval
  let pollingTimerRef = useRef<NodeJS.Timeout | null>(null);

  function startStatusPolling(jobId: string) {
    if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);

    pollingTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/status/${jobId}`);
        if (!res.ok) {
          throw new Error(`Job status returned HTTP ${res.status}`);
        }
        const data = await res.json();
        
        setJobStatus({
          status: data.status,
          progress: data.progress,
          step: data.step,
          downloadUrl: data.downloadUrl,
          error: data.error
        });

        if (data.status === "completed" || data.status === "error") {
          setIsProcessing(false);
          if (pollingTimerRef.current) {
            clearInterval(pollingTimerRef.current);
            pollingTimerRef.current = null;
          }
        }
      } catch (err: any) {
        console.error("Polling error:", err);
        setJobStatus(prev => ({
          status: "error",
          progress: prev?.progress || 0,
          step: "Status check failed",
          error: err.message || "Failed check status polling connection."
        }));
        setIsProcessing(false);
        if (pollingTimerRef.current) {
          clearInterval(pollingTimerRef.current);
          pollingTimerRef.current = null;
        }
      }
    }, 1500);
  }

  useEffect(() => {
    return () => {
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 antialiased selection:bg-indigo-500 selection:text-white pb-16" id="clipr-app-body">
      
      {/* Header Bar */}
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-10 shadow-xs" id="clipr-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200" id="clipr-logo-box">
              <Scissors className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-display text-indigo-950 tracking-tight flex items-center gap-1.5 leading-none">
                CLIPR.AI
                <span className="text-[10px] tracking-wider uppercase bg-emerald-100 text-emerald-800 font-semibold px-1.5 py-0.5 rounded">
                  Free Alternative
                </span>
              </h1>
              <p className="text-xs text-slate-500 font-medium">Auto-Cut YouTube Shorts in Seconds</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <span className="text-xs text-slate-400 font-mono hidden md:inline bg-slate-100 px-2 py-1 rounded">
              Railway Ready & Free Tier Optimized
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        
        {/* Intro Banner */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-xs mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6" id="clipr-intro-banner">
          <div className="space-y-2 max-w-2xl">
            <h2 className="text-2xl font-bold text-slate-900 font-display tracking-tight">
              Create short viral clips from high-length footage.
            </h2>
            <p className="text-slate-600 text-sm leading-relaxed">
              We extract transcripts from YouTube automatically, divide tracks into Hook, Body, and Outro sections, convert videos to 9:16 vertical orientation, and compile embedded text graphics — powered by Express, robust yt-dlp pipelines, and system FFmpeg.
            </p>
          </div>
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex items-start space-x-3 shrink-0 md:max-w-sm">
            <Sparkles className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
            <div className="text-xs text-indigo-900 space-y-1">
              <span className="font-semibold block">Production Architecture</span>
              <p className="text-indigo-800 leading-relaxed">
                Complete configurations for Railway.app with Docker system dependencies are exported. Perfect for high speed deployment.
              </p>
            </div>
          </div>
        </div>

        {/* Input & Form Area */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8" id="clipr-dashboard-grid">
          
          {/* Controls Column (Left) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs" id="clipr-input-card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-900 font-display flex items-center gap-2">
                  <Youtube className="w-5 h-5 text-red-600" />
                  1. Setup Source Video
                </h3>
                <label className="inline-flex items-center space-x-1.5 cursor-pointer bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition text-xs font-semibold user-select-none">
                  <input
                    type="checkbox"
                    checked={useDemoMode}
                    onChange={(e) => setUseDemoMode(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                  />
                  <span>Interactive Demo Mode</span>
                </label>
              </div>

              <div className="space-y-4">
                <div className="group relative">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    YouTube URL
                  </label>
                  <div className="relative">
                    <input
                      type="url"
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..."
                      disabled={useDemoMode}
                      className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition disabled:opacity-60"
                      id="youtube-url-input"
                    />
                    <Video className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  </div>
                  {useDemoMode && (
                    <span className="text-[11px] text-amber-600 font-medium block mt-1">
                      💡 Demo Mode enabled: Using podcast sample transcript.
                    </span>
                  )}
                </div>

                <button
                  onClick={fetchTranscript}
                  disabled={isFetchingTranscript || !youtubeUrl}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium py-2.5 px-4 rounded-xl text-sm transition flex items-center justify-center space-x-2 shadow-sm pointer shadow-indigo-100"
                  id="fetch-transcript-btn"
                >
                  {isFetchingTranscript ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Retrieving Transcripts...</span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4" />
                      <span>Fetch Transcript & Timestamps</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Custom Captions Box */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs" id="clipr-style-card">
              <h3 className="text-lg font-bold text-slate-900 font-display flex items-center gap-2 mb-4">
                <Type className="w-5 h-5 text-violet-600" />
                2. Caption Styles & Layout
              </h3>

              <div className="space-y-4">
                {/* Platform */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Target Format / Platform
                  </label>
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition"
                    id="platform-selector"
                  >
                    <option value="tiktok">TikTok Video (9:16 Vertical - 1080x1920)</option>
                    <option value="shorts">YouTube Shorts (9:16 - 1080x1920)</option>
                    <option value="reels">Instagram Reels (9:16 - 1080x1920)</option>
                  </select>
                </div>

                {/* Hook Text overlay */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Intro Hook Text
                    </label>
                    <input
                      type="text"
                      value={hookText}
                      onChange={(e) => setHookText(e.target.value)}
                      placeholder="WAIT FOR IT!"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Intro Sub Hook
                    </label>
                    <input
                      type="text"
                      value={subHook}
                      onChange={(e) => setSubHook(e.target.value)}
                      placeholder="Absolute Secrets"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    />
                  </div>
                </div>

                {/* Captain phrases */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex justify-between">
                    <span>Captions Queue (Displays sequentially)</span>
                    <span className="text-[10px] text-slate-400 normal-case font-mono">Max 4 phrases rendered</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {captions.map((cap, idx) => (
                      <input
                        key={idx}
                        type="text"
                        value={cap}
                        onChange={(e) => {
                          const updated = [...captions];
                          updated[idx] = e.target.value.toUpperCase();
                          setCaptions(updated);
                        }}
                        placeholder={`Caption phrase ${idx + 1}`}
                        className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold uppercase font-mono bg-slate-50 focus:bg-white text-indigo-900"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Time Adjustments */}
            {videoMetadata && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs" id="clipr-times-card">
                <h3 className="text-lg font-bold text-slate-900 font-display flex items-center gap-2 mb-4">
                  <Sliders className="w-5 h-5 text-emerald-600" />
                  3. Fine-Tune Timing Ranges (Seconds)
                </h3>

                <div className="space-y-4">
                  {/* Hook Track */}
                  <div className="p-3 bg-red-50/50 border border-red-100 rounded-xl space-y-2">
                    <span className="text-xs font-bold text-red-900 flex items-center justify-between">
                      <span>🎬 Hook Segment (Normal: 0 - 3s)</span>
                      <span className="font-mono">{hookStart}s to {hookEnd}s (Duration: {hookEnd - hookStart}s)</span>
                    </span>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[10px] text-red-600 font-medium">Start Second</span>
                        <input
                          type="number"
                          value={hookStart}
                          min="0"
                          max={videoMetadata.duration}
                          onChange={(e) => setHookStart(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-full px-2 py-1 text-xs border border-red-200 rounded-lg bg-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-red-600 font-medium">End Second</span>
                        <input
                          type="number"
                          value={hookEnd}
                          min="0"
                          max={videoMetadata.duration}
                          onChange={(e) => setHookEnd(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-full px-2 py-1 text-xs border border-red-200 rounded-lg bg-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Body Track */}
                  <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-2">
                    <span className="text-xs font-bold text-indigo-900 flex items-center justify-between">
                      <span>📝 Body Segment (Normal: 3 - 15s)</span>
                      <span className="font-mono">{bodyStart}s to {bodyEnd}s (Duration: {bodyEnd - bodyStart}s)</span>
                    </span>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[10px] text-indigo-600 font-medium">Start Second</span>
                        <input
                          type="number"
                          value={bodyStart}
                          min="0"
                          max={videoMetadata.duration}
                          onChange={(e) => setBodyStart(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-full px-2 py-1 text-xs border border-indigo-200 rounded-lg bg-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-indigo-600 font-medium">End Second</span>
                        <input
                          type="number"
                          value={bodyEnd}
                          min="0"
                          max={videoMetadata.duration}
                          onChange={(e) => setBodyEnd(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-full px-2 py-1 text-xs border border-indigo-200 rounded-lg bg-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Ending Track */}
                  <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-2">
                    <span className="text-xs font-bold text-emerald-950 flex items-center justify-between">
                      <span>🏁 Outro Ending Segment (Normal: 15 - 25s)</span>
                      <span className="font-mono">{endingStart}s to {endingEnd}s (Duration: {endingEnd - endingStart}s)</span>
                    </span>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[10px] text-emerald-800 font-medium">Start Second</span>
                        <input
                          type="number"
                          value={endingStart}
                          min="0"
                          max={videoMetadata.duration}
                          onChange={(e) => setEndingStart(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-full px-2 py-1 text-xs border border-emerald-200 rounded-lg bg-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-emerald-800 font-medium">End Second</span>
                        <input
                          type="number"
                          value={endingEnd}
                          min="0"
                          max={videoMetadata.duration}
                          onChange={(e) => setEndingEnd(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-full px-2 py-1 text-xs border border-emerald-200 rounded-lg bg-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Action Cut Trigger */}
                  <button
                    onClick={handleCreateClip}
                    disabled={isProcessing}
                    className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white font-semibold py-3 px-4 rounded-xl text-sm transition flex items-center justify-center space-x-2 shadow-md shadow-violet-100 cursor-pointer text-center"
                    id="trigger-clipping-btn"
                  >
                    <Scissors className="w-5 h-5" />
                    <span>Cut, Combine, & Polish Clip!</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Interactive Workspace / Transcripts (Right) */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Show error if transcript failed */}
            {transcriptError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl p-5 flex items-start space-x-3" id="clipr-error-box">
                <AlertTriangle className="w-5 h-5 text-rose-600 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <h4 className="font-bold text-sm">Transcript Retrieval Failed</h4>
                  <p className="text-xs text-rose-800 leading-relaxed font-medium">{transcriptError}</p>
                  
                  {/* Detailed Secrets Setup Steps */}
                  <div className="mt-4 p-3.5 bg-rose-100/50 rounded-xl border border-rose-200/50 space-y-2 text-rose-950 text-xs">
                    <span className="font-bold">How to connect real Youtube Transcripts:</span>
                    <ol className="list-decimal pl-4 space-y-1 font-medium text-[11px] text-rose-900">
                      <li>Log in to <a href="https://supadata.ai" target="_blank" rel="noreferrer" className="underline font-bold text-indigo-700">supadata.ai</a> and grab a free API Key.</li>
                      <li>Open the <span className="font-bold">Secrets / Settings Panel</span> in Google AI Studio or Railway.</li>
                      <li>Introduce a new variable named <code className="font-mono font-bold bg-white text-rose-700 px-1 py-0.5 rounded">SUPADATA_KEY</code> with your key token.</li>
                      <li>Refresh this app, uncheck Demo Mode, and enjoy instant transcription services!</li>
                    </ol>
                  </div>
                </div>
              </div>
            )}

            {/* If no video is active */}
            {!videoMetadata && !isFetchingTranscript && (
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center flex flex-col items-center justify-center min-h-[450px]" id="clipr-placeholder-box">
                <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 mb-4 shadow-sm">
                  <Play className="w-6 h-6 animate-pulse" />
                </div>
                <h4 className="text-lg font-bold text-slate-900 font-display">No YouTube Video Loaded</h4>
                <p className="text-slate-500 text-sm max-w-sm mt-1 leading-relaxed">
                  Enter your video url on the left and fetch its segment data to start editing interactive clips.
                </p>
                <div className="mt-6 flex flex-wrap gap-2 justify-center max-w-md bg-indigo-50/50 border border-indigo-100 rounded-xl p-3">
                  <span className="text-[11px] text-indigo-900 font-semibold block w-full mb-1">💡 Super Tip:</span>
                  <p className="text-[11px] text-indigo-800 leading-relaxed text-left">
                    You can quickly test everything in 1 click! Tap the <strong>"Interactive Demo Mode"</strong> checkbox above to load a podcast with timelines and click-to-select cutting mechanics instantly!
                  </p>
                </div>
              </div>
            )}

            {/* Fetching Skeleton Loading State */}
            {isFetchingTranscript && (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 animate-pulse min-h-[450px]" id="clipr-skeleton-box">
                <div className="h-6 bg-slate-200 rounded w-1/3"></div>
                <div className="h-4 bg-slate-100 rounded w-2/3"></div>
                <div className="space-y-2 pt-6">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="flex space-x-3 items-center">
                      <div className="h-5 bg-slate-200 rounded-lg w-12"></div>
                      <div className="h-4 bg-slate-100 rounded w-4/5"></div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Active Video Workspace */}
            {videoMetadata && (
              <div className="space-y-6" id="clipr-workspace">
                
                {/* Video Info Header */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex items-center space-x-3 font-mono text-xs text-indigo-600 font-bold mb-1 uppercase tracking-wider">
                    <span className="bg-indigo-100 px-2 py-0.5 rounded text-[10px]">{videoMetadata.videoId}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {Math.floor(videoMetadata.duration / 60)}:{(videoMetadata.duration % 60).toString().padStart(2, '0')} min duration
                    </span>
                    <span>•</span>
                    <span>{videoMetadata.wordCount} words detected</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 font-display line-clamp-2 leading-snug">
                    {videoMetadata.title}
                  </h3>
                </div>

                {/* Subtitle / Interactive Timelines Segmentizer */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col min-h-[380px]">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-100 pb-4 mb-4 gap-2">
                    <div>
                      <h4 className="font-bold text-slate-900 font-display flex items-center gap-2">
                        <FileText className="w-4 h-4 text-indigo-600" />
                        Interactive Interactive Transcript
                      </h4>
                      <p className="text-xs text-slate-500 font-medium">Click on any transcript statement row to assign time boundaries</p>
                    </div>
                  </div>

                  {/* Lines List */}
                  <div className="space-y-1.5 max-h-[450px] overflow-y-auto pr-2" id="transcript-scroller">
                    {transcriptSegments.length === 0 ? (
                      <p className="text-slate-400 text-xs italic py-6">No timestamped segments found. Try adding a timestamped transcript or utilizing the interactive demo mode.</p>
                    ) : (
                      transcriptSegments.map((item, index) => {
                        const inHook = item.seconds >= hookStart && item.seconds < hookEnd;
                        const inBody = item.seconds >= bodyStart && item.seconds < bodyEnd;
                        const inEnding = item.seconds >= endingStart && item.seconds < endingEnd;

                        return (
                          <div
                            key={index}
                            className={`group flex items-start p-2.5 rounded-xl border text-xs transition duration-150 relative ${
                              inHook
                                ? "bg-red-50/70 border-red-200/60 hover:bg-red-50"
                                : inBody
                                ? "bg-indigo-50/70 border-indigo-200/60 hover:bg-indigo-50"
                                : inEnding
                                ? "bg-emerald-50/70 border-emerald-200/60 hover:bg-emerald-50"
                                : "bg-slate-50/30 border-slate-200/60 hover:bg-slate-100/70"
                            }`}
                          >
                            <span className="font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded mr-3 shrink-0">
                              {item.timestamp}
                            </span>
                            <span className="text-slate-700 font-medium select-text pr-20 break-words leading-relaxed flex-1 pt-0.5">
                              {item.text}
                            </span>

                            {/* Hover Options Overlay */}
                            <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white p-1 rounded-lg border border-slate-200 shadow-sm z-10">
                              <button
                                onClick={() => handleSegmentClick(item, "hook", true)}
                                className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 hover:bg-red-200 text-red-800"
                                title="Set as Hook Start"
                              >
                                Hook [H]
                              </button>
                              <button
                                onClick={() => handleSegmentClick(item, "body", true)}
                                className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 hover:bg-indigo-200 text-indigo-800"
                                title="Set as Body Start"
                              >
                                Body [B]
                              </button>
                              <button
                                onClick={() => handleSegmentClick(item, "ending", true)}
                                className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 hover:bg-emerald-200 text-emerald-800"
                                title="Set as Outro Start"
                              >
                                Outro [O]
                              </button>
                            </div>

                            {/* Active Tags markers explicitly shown inside rows */}
                            <div className="absolute right-2.5 top-2.5 flex items-center gap-1 group-hover:hidden select-none pointer-events-none">
                              {inHook && (
                                <span className="text-[10px] uppercase font-bold text-red-700 font-mono tracking-wider bg-red-100/80 px-1.5 py-0.5 rounded">
                                  Hook
                                </span>
                              )}
                              {inBody && (
                                <span className="text-[10px] uppercase font-bold text-indigo-700 font-mono tracking-wider bg-indigo-100/80 px-1.5 py-0.5 rounded">
                                  Body
                                </span>
                              )}
                              {inEnding && (
                                <span className="text-[10px] uppercase font-bold text-emerald-800 font-mono tracking-wider bg-emerald-100/80 px-1.5 py-0.5 rounded">
                                  Outro
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Segment Color key Legend */}
                  <div className="mt-auto pt-4 border-t border-slate-100 grid grid-cols-3 gap-2 text-center text-[11px] font-semibold">
                    <div className="bg-red-50 text-red-800 border border-red-100 rounded-lg py-1.5">
                      🔴 Hook Track
                    </div>
                    <div className="bg-indigo-50 text-indigo-800 border border-indigo-100 rounded-lg py-1.5">
                      🔵 Body Track
                    </div>
                    <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-lg py-1.5">
                      🟢 Outro Outline
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>

        {/* Floating Interactive Video Generation Progress Modal Overlay */}
        <AnimatePresence>
          {isProcessing || jobStatus ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 z-50"
              id="clipr-progress-modal-bg"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="bg-white rounded-2xl border border-slate-200 max-w-xl w-full p-6 md:p-8 shadow-2xl relative overflow-hidden"
                id="clipr-status-modal"
              >
                
                {/* Visual Header */}
                <div className="flex items-center space-x-3 pb-4 border-b border-slate-100 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold font-display text-slate-900 leading-tight">
                      {jobStatus?.status === "completed" ? "Generation Completed!" : "Baking & Compiling Video"}
                    </h4>
                    <p className="text-xs text-slate-500">Job ID: {activeJobId || "Starting up..."}</p>
                  </div>
                </div>

                {/* Processing States */}
                {jobStatus && (
                  <div className="space-y-6">
                    
                    {/* Progress Bar Info */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider text-slate-500">
                        <span>Current Phase</span>
                        <span className="font-mono text-indigo-600 text-sm font-black">{jobStatus.progress}%</span>
                      </div>
                      
                      {/* Active Step Indicator Banner */}
                      <div className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-200/70 text-slate-800 font-semibold text-sm flex items-center space-x-2.5">
                        <span className="relative flex h-2.5 w-2.5 shrink-0">
                          {jobStatus.status === "processing" ? (
                            <>
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-600"></span>
                            </>
                          ) : jobStatus.status === "completed" ? (
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                          ) : (
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                          )}
                        </span>
                        <span>{jobStatus.step}</span>
                      </div>

                      {/* Visual Progress Bar track */}
                      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ease-out ${
                            jobStatus.status === "error" ? "bg-rose-500" : "bg-indigo-600"
                          }`}
                          style={{ width: `${jobStatus.progress}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Step lists with Checkmarks */}
                    <div className="p-4 bg-slate-50 border border-slate-200/50 rounded-xl space-y-3.5 text-xs">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-200/60 pb-1.5">
                        <span>Video Construction Phases</span>
                        <span>Status</span>
                      </div>
                      
                      {/* Step 1 */}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600 font-medium">1. Parse metadata and download original video stream</span>
                        {jobStatus.progress >= 30 ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : jobStatus.status === "error" ? (
                          <span className="text-rose-500 font-bold uppercase">Err</span>
                        ) : (
                          <span className="text-slate-400 font-bold">Pending</span>
                        )}
                      </div>

                      {/* Step 2 */}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600 font-medium">2. Segment clips into Hook, Body, and Outro tracks</span>
                        {jobStatus.progress >= 65 ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <span className="text-slate-400 font-medium">-</span>
                        )}
                      </div>

                      {/* Step 3 */}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600 font-medium">3. Compile tracks and crop coordinates to 9:16 aspect ratios</span>
                        {jobStatus.progress >= 80 ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <span className="text-slate-400 font-medium">-</span>
                        )}
                      </div>

                      {/* Step 4 */}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600 font-medium">4. Generate text graphical templates with target subtitles</span>
                        {jobStatus.progress >= 95 ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <span className="text-slate-400 font-medium">-</span>
                        )}
                      </div>
                    </div>

                    {/* Simulation Notification Caution */}
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 flex items-start space-x-2.5">
                      <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                      <div className="space-y-1">
                        <span className="font-bold block">Sandbox Execution Note</span>
                        <p className="text-amber-800 leading-relaxed font-semibold">
                          CLIPR.AI will run real ffmpeg cutouts on Railway.app. If running inside AI Studio without CLI tools, it utilizes high-fidelity mockup simulations to test polling and streaming interfaces perfectly.
                        </p>
                      </div>
                    </div>

                    {/* Result Options */}
                    {jobStatus.status === "completed" && jobStatus.downloadUrl && (
                      <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
                        <span className="text-xs text-slate-500 font-medium">Finished output file will be retained for 1 hour.</span>
                        <a
                          href={jobStatus.downloadUrl}
                          className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition flex items-center gap-2 shadow-lg shadow-emerald-100 cursor-pointer shrink-0"
                          download
                        >
                          <Download className="w-4.5 h-4.5" />
                          Download Final Clip (.mp4)
                        </a>
                      </div>
                    )}

                    {/* Error Display */}
                    {jobStatus.status === "error" && (
                      <div className="p-4 bg-rose-50 text-rose-900 border border-rose-200 rounded-xl text-xs space-y-2">
                        <span className="font-bold block">🚨 Command Execution Failure:</span>
                        <code className="block bg-white border border-rose-300 rounded p-2 text-rose-800 font-mono break-all font-semibold">
                          {jobStatus.error || "An unknown background exception triggered standard job termination."}
                        </code>
                        <span className="text-[11px] font-medium block text-rose-700 font-sans">
                          Tip: Ensure your Railway.app platform has python3, pip, yt-dlp, and ffmpeg configured correctly via the included Dockerfile.
                        </span>
                      </div>
                    )}

                  </div>
                )}

                {/* Close Button once complete or errored */}
                {(jobStatus?.status === "completed" || jobStatus?.status === "error") && (
                  <button
                    onClick={() => setJobStatus(null)}
                    className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-sm font-bold bg-slate-100 hover:bg-slate-200 w-8 h-8 rounded-full flex items-center justify-center transition cursor-pointer"
                  >
                    ✕
                  </button>
                )}

              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>

      </main>
    </div>
  );
}
