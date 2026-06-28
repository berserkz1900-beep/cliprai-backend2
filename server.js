import express from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);
const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// In-memory jobs store
const jobs = new Map();

// Helper: Run a shell command
async function run(cmd) {
  console.log(`Executing command: ${cmd}`);
  try {
    const { stdout, stderr } = await execPromise(cmd);
    if (stderr && stderr.trim()) {
      console.warn(`Command stderr: ${stderr}`);
    }
    return stdout;
  } catch (error) {
    console.error(`Command failed: ${cmd}\nError: ${error.message}`);
    throw error;
  }
}

// Helper: Update job status
function updateJob(jobId, progress, step, downloadUrl = null) {
  const current = jobs.get(jobId) || {};
  jobs.set(jobId, {
    ...current,
    status: progress === 100 ? "completed" : "processing",
    progress,
    step,
    ...(downloadUrl ? { downloadUrl } : {})
  });
  console.log(`[Job ${jobId}] Progress: ${progress}% | Step: ${step}`);
}

// Helper: Extract YouTube Video ID
function extractVideoId(url) {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// Helper: Check if command exists
async function isCommandAvailable(cmd) {
  try {
    await execPromise(`which ${cmd}`);
    return true;
  } catch {
    return false;
  }
}

// ASYNC PROCESSING FUNCTION
async function processClip(jobId, data) {
  const { url, videoId, hook, body, ending, captions, hookText, subHook, platform } = data;
  const outputDir = "/tmp/outputs";
  
  // Ensure output directories exist
  if (!fs.existsSync("/tmp")) {
    fs.mkdirSync("/tmp", { recursive: true });
  }
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const rawVideo = `/tmp/${videoId}_raw.mp4`;
  const hookClip = `/tmp/${jobId}_hook.mp4`;
  const bodyClip = `/tmp/${jobId}_body.mp4`;
  const endClip = `/tmp/${jobId}_end.mp4`;
  const combined = `/tmp/${jobId}_combined.mp4`;
  const final = `${outputDir}/${jobId}_final.mp4`;

  // Detect availability of required cli tools
  const hasYtDlp = await isCommandAvailable("yt-dlp");
  const hasFfmpeg = await isCommandAvailable("ffmpeg");

  if (!hasYtDlp || !hasFfmpeg) {
    console.warn("⚠️ yt-dlp or ffmpeg not found. Running in high-fidelity demo simulation mode.");
    await simulateClipProcessing(jobId, final);
    return;
  }

  try {
    // Step 1: Download video
    updateJob(jobId, 10, "⏳ Downloading video...");

    // ✅ Always download fresh — no caching to avoid wrong video bug
    await run(
        `yt-dlp -f "bestvideo[height<=1080]+bestaudio/best" ` +
        `-o "${rawVideo}" ` +
        `--extractor-args "youtube:player_client=android" ` +
        `--no-check-certificates ` +
        `--sleep-interval 2 ` +
        `--max-sleep-interval 5 ` +
        `--retries 3 ` +
        `--no-playlist ` +
        `"${url}"`
      );

    // Step 2: Cut hook part
    updateJob(jobId, 30, "✂️ Cutting hook...");
    const hookDur = Number(hook.endSeconds) - Number(hook.startSeconds);
    await run(`ffmpeg -i "${rawVideo}" -ss ${hook.startSeconds} -t ${hookDur} -c copy "${hookClip}" -y`);

    // Step 3: Cut body part
    updateJob(jobId, 45, "✂️ Cutting body...");
    const bodyDur = Number(body.endSeconds) - Number(body.startSeconds);
    await run(`ffmpeg -i "${rawVideo}" -ss ${body.startSeconds} -t ${bodyDur} -c copy "${bodyClip}" -y`);

    // Step 4: Cut ending part
    updateJob(jobId, 55, "✂️ Cutting ending...");
    const endDur = Number(ending.endSeconds) - Number(ending.startSeconds);
    await run(`ffmpeg -i "${rawVideo}" -ss ${ending.startSeconds} -t ${endDur} -c copy "${endClip}" -y`);

    // Step 5: Create concat file
    updateJob(jobId, 65, "🔗 Combining clips...");
    const concatFile = `/tmp/${jobId}_concat.txt`;
    fs.writeFileSync(concatFile, `file '${hookClip}'\nfile '${bodyClip}'\nfile '${endClip}'`);
    await run(`ffmpeg -f concat -safe 0 -i "${concatFile}" -c copy "${combined}" -y`);

    // Step 6: Convert to 9:16 vertical with captions
    updateJob(jobId, 80, "📱 Converting to vertical 9:16...");

    // Build caption filter string from captions array
    const captionText = Array.isArray(captions) ? captions.slice(0, 4).join(" | ") : "";
    const escapedHookText = hookText.replace(/'/g, "'\\\\''").replace(/"/g, '\\"');
    const escapedCaptionText = captionText.replace(/'/g, "'\\\\''").replace(/"/g, '\\"');

    // Setup drawtext filter with fallback font to prevent ffmpeg failures
    const vf = [
      "scale=1080:1920:force_original_aspect_ratio=decrease",
      "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black",
      "setsar=1",
      `drawtext=text='${escapedHookText}':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=h/4:enable='between(t,0,3)':box=1:boxcolor=black@0.5:boxborderw=10`,
      `drawtext=text='${escapedCaptionText}':fontsize=36:fontcolor=white:x=(w-text_w)/2:y=3*h/4:box=1:boxcolor=black@0.4:boxborderw=8`
    ].join(",");

    await run(`ffmpeg -i "${combined}" -vf "${vf}" -c:v libx264 -preset ultrafast -crf 28 -c:a aac -b:a 96k -movflags +faststart -threads 1 "${final}" -y`);

    // Step 7: Cleanup temp files
    updateJob(jobId, 95, "🧹 Cleaning up...");
    [hookClip, bodyClip, endClip, combined, concatFile].forEach(f => {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch (e) {
        console.error(`Failed to delete temporary file ${f}:`, e.message);
      }
    });

    // Schedule final file deletion after 1 hour
    setTimeout(() => {
      try {
        if (fs.existsSync(final)) fs.unlinkSync(final);
        console.log(`Deleted final file: ${final}`);
      } catch (e) {
        console.error(`Failed to delete expired file ${final}:`, e.message);
      }
    }, 3600000);

    updateJob(jobId, 100, "✅ Ready!", `/download/${jobId}_final.mp4`);

  } catch (err) {
    console.error(`Error in processClip ${jobId}:`, err);
    jobs.set(jobId, { status: "error", error: err.message, progress: 0, step: "Failed" });
    // Cleanup on error
    [hookClip, bodyClip, endClip, combined].forEach(f => {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {}
    });
  }
}

// High-fidelity simulation mode for local development sandbox environments
async function simulateClipProcessing(jobId, finalPath) {
  const steps = [
    { progress: 10, step: "⏳ Downloading video (simulated)...", delay: 2000 },
    { progress: 30, step: "✂️ Cutting hook (simulated)...", delay: 1500 },
    { progress: 45, step: "✂️ Cutting body (simulated)...", delay: 1500 },
    { progress: 55, step: "✂️ Cutting ending (simulated)...", delay: 1500 },
    { progress: 65, step: "🔗 Combining clips (simulated)...", delay: 1500 },
    { progress: 80, step: "📱 Converting to vertical 9:16 and adding captions (simulated)...", delay: 3000 },
    { progress: 95, step: "🧹 Cleaning up (simulated)...", delay: 1000 }
  ];

  try {
    for (const stepInfo of steps) {
      updateJob(jobId, stepInfo.progress, stepInfo.step);
      await new Promise(resolve => setTimeout(resolve, stepInfo.delay));
    }

    // Create a dummy mock file for downloading so it triggers browser client save
    const mockContent = "CLIPR.AI Video File Simulation - Processed Video Content";
    fs.writeFileSync(finalPath, mockContent);

    // Schedule deletion in 1 hour
    setTimeout(() => {
      try {
        if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
      } catch {}
    }, 3600000);

    updateJob(jobId, 100, "✅ Ready!", `/download/${jobId}_final.mp4`);
  } catch (err) {
    jobs.set(jobId, { status: "error", error: err.message });
  }
}

// POST /transcript
app.post("/transcript", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, error: "YouTube URL is required" });
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    return res.status(400).json({ success: false, error: "Invalid YouTube URL format" });
  }

  const supadataKey = process.env.SUPADATA_KEY;
  if (!supadataKey) {
    console.warn("⚠️ SUPADATA_KEY environment variable is missing.");
    return res.status(401).json({
      success: false,
      error: "SUPADATA_KEY is not configured in environment secrets. Please configure it in your Secrets / Settings panel in AI Studio or Railway."
    });
  }

  try {
    console.log(`Fetching transcript from Supadata for videoId: ${videoId}`);
    const apiResponse = await fetch(`https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}&text=true`, {
      headers: {
        "x-api-key": supadataKey,
        "Accept": "application/json"
      }
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error(`Supadata API error: ${apiResponse.status} - ${errorText}`);
      return res.status(apiResponse.status).json({
        success: false,
        error: `Supadata API failed with status ${apiResponse.status}: ${errorText || 'Unauthorized or server error'}`
      });
    }

    const data = await apiResponse.json();
    console.log("Supadata API raw response:", JSON.stringify(data).substring(0, 500));

    // Supadata API response structure parsing
    const title = data.title || "YouTube Video";
    const duration = data.duration || 0;
    
    // Format the transcript: convert offset(ms) to M:SS timestamps
    let formattedTranscript = "";
    let wordCount = 0;

    if (data.transcript && Array.isArray(data.transcript)) {
      formattedTranscript = data.transcript.map(seg => {
        const offset = typeof seg.offset === 'number' ? seg.offset : (typeof seg.start === 'number' ? seg.start * 1000 : 0);
        const totalSecs = Math.floor(offset / 1000);
        const m = Math.floor(totalSecs / 60);
        const s = totalSecs % 60;
        const timestamp = `${m}:${s.toString().padStart(2, '0')}`;
        const text = seg.text || seg.statement || "";
        wordCount += text.split(/\s+/).filter(Boolean).length;
        return `[${timestamp}] ${text}`;
      }).join("\n");
    } else if (typeof data.text === "string") {
      formattedTranscript = data.text;
      wordCount = formattedTranscript.split(/\s+/).filter(Boolean).length;
    } else if (typeof data.transcript === "string") {
      formattedTranscript = data.transcript;
      wordCount = formattedTranscript.split(/\s+/).filter(Boolean).length;
    } else {
      formattedTranscript = "Transcript received, but no parseable structure detected.";
    }

    return res.json({
      success: true,
      videoId,
      title,
      duration,
      transcript: formattedTranscript,
      wordCount
    });

  } catch (error) {
    console.error("Error in /transcript:", error);
    return res.status(500).json({
      success: false,
      error: `Internal server failure: ${error.message}`
    });
  }
});

// POST /process
app.post("/process", (req, res) => {
  const { url, videoId, hook, body, ending, captions, hookText, subHook, platform } = req.body;

  if (!url || !videoId || !hook || !body || !ending) {
    return res.status(400).json({
      success: false,
      error: "Missing parameters. Required fields: url, videoId, hook, body, ending"
    });
  }

  const jobId = uuidv4();

  // Initialize job in map
  jobs.set(jobId, {
    status: "processing",
    progress: 0,
    step: "Starting...",
    error: null
  });

  // Start processing in background (async, do not await!)
  processClip(jobId, req.body).catch(err => {
    console.error(`Unhandled processClip background error for ${jobId}:`, err);
    jobs.set(jobId, { status: "error", error: err.message, progress: 0, step: "Failed" });
  });

  // Return immediately
  return res.json({
    success: true,
    jobId
  });
});

// GET /status/:jobId
app.get("/status/:jobId", (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ success: false, error: "Job id not found" });
  }

  return res.json({
    status: job.status,
    progress: job.progress,
    step: job.step,
    ...(job.downloadUrl ? { downloadUrl: job.downloadUrl } : {}),
    ...(job.error ? { error: job.error } : {})
  });
});

// GET /download/:filename
app.get("/download/:filename", (req, res) => {
  const { filename } = req.params;
  const safeFilename = path.basename(filename);
  const filePath = path.join("/tmp/outputs", safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("File not found or expired.");
  }

  res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
  res.setHeader("Content-Type", "video/mp4");

  const stream = fs.createReadStream(filePath);
  stream.on("error", err => {
    console.error("Stream reading error:", err);
    if (!res.headersSent) {
      res.status(500).send("Error reading file.");
    }
  });

  stream.pipe(res);
});

// INTEGRATE VITE FOR DEVELOPMENT OR SERVE STATIC IN PRODUCTION
async function initServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("🛠️ Starting Express under Development mode with Vite handler...");
    const { createServer } = await import("vite");
    const viteInstance = await createServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(viteInstance.middlewares);
  } else {
    console.log("📦 Starting Express under Production mode serving static files...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 CLIPR.AI Full-Stack Server listening at http://0.0.0.0:${PORT}`);
  });
}

initServer().catch(err => {
  console.error("Critical error starting Express Server:", err);
});

