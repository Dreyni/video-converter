'use client';

import React, { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { FileAudio, Loader2, Download, Languages, AlertCircle, Copy, Check, FileText, File as FileIcon, ChevronDown, Cpu, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { createJob, updateJob } from '@/lib/jobs';

export default function Transcriber() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'processing' | 'done' | 'error'>('idle');
  const [transcript, setTranscript] = useState('');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [copied, setCopied] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressPhase, setProgressPhase] = useState('');
  const [startTime, setStartTime] = useState<number | null>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const [backendMessage, setBackendMessage] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const loadEngines = async () => {
      try {
        const ffmpeg = new FFmpeg();
        ffmpeg.on('progress', ({ progress: ratio }) => {
          setProgress(Math.round(ratio * 100));
          setProgressPhase('Extracting audio...');
        });

        const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.10/dist/umd';
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
          workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
        });

        ffmpegRef.current = ffmpeg;
      } catch (err) {
        console.error('FFmpeg load error:', err);
      }
    };

    loadEngines();

    // Initialize Worker for AI
    workerRef.current = new Worker(new URL('../lib/transcription-worker.ts', import.meta.url));
    workerRef.current.onmessage = (e) => {
      const { status, progress, transcript, liveText, error } = e.data;
      
      if (status === 'progress') {
        setProgress(progress);
        setProgressPhase('Transcribing...');
      }
      
      if (status === 'loading') {
        setStatus('loading');
        setProgress(0);
        setProgressPhase('Loading AI model...');
      }
      
      if (status === 'processing') {
        setStatus('processing');
        setProgressPhase('Transcribing...');
      }
      
      if (status === 'live_text') {
        setLiveTranscript(liveText);
      }
      
      if (status === 'done') {
        setTranscript(transcript);
        setLiveTranscript('');
        setStatus('done');
        setProgress(100);
        if (jobIdRef.current) {
          void updateJob(jobIdRef.current, {
            status: 'done',
            transcript,
          }).catch((backendError) => {
            console.warn('Failed to save completed transcript job:', backendError);
          });
        }
      }
      
      if (status === 'error') {
        setErrorMessage(error || 'Something went wrong during transcription.');
        setStatus('error');
        if (jobIdRef.current) {
          void updateJob(jobIdRef.current, {
            status: 'error',
            errorMessage: error || 'Transcription failed.',
          }).catch((backendError) => {
            console.warn('Failed to save transcript error job:', backendError);
          });
        }
      }
    };

    return () => {
      workerRef.current?.terminate();
      ffmpegRef.current?.terminate();
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setStatus('idle');
      setTranscript('');
      setLiveTranscript('');
      setErrorMessage('');
      setBackendMessage('');
      setJobId(null);
      jobIdRef.current = null;

      void (async () => {
        try {
          const job = await createJob({
            kind: 'transcribe',
            filename: selectedFile.name,
            fileSize: selectedFile.size,
          });

          setJobId(job.id);
          jobIdRef.current = job.id;
          setBackendMessage(`Saved job ${job.id.slice(0, 8)} to Supabase.`);
        } catch (error) {
          console.warn('Failed to create backend job:', error);
          setBackendMessage('Backend job could not be saved, but local transcription still works.');
        }
      })();
    }
  };

  const startTranscription = async () => {
    const ffmpeg = ffmpegRef.current;
    if (!file || !ffmpeg || !workerRef.current) return;

    setStatus('processing');
    setProgress(0);
    setErrorMessage('');
    setLiveTranscript('');
    let activeJobId = jobId;
    
    const mountPoint = '/input';
    try {
      const inputName = file.name;
      const outputName = 'output.wav';

      if (!activeJobId) {
        const job = await createJob({
          kind: 'transcribe',
          filename: file.name,
          fileSize: file.size,
        });
        activeJobId = job.id;
        setJobId(job.id);
        jobIdRef.current = job.id;
      }

      if (activeJobId) {
        await updateJob(activeJobId, { status: 'processing' });
      }

      // Clean up any previous mounts and files
      try { await ffmpeg.unmount(mountPoint); } catch (e) {}

      const fileSizeGB = file.size / (1024 * 1024 * 1024);
      console.log(`File size: ${fileSizeGB.toFixed(2)} GB`);
      
      // Check if file is too large for browser processing
      const maxBrowserSize = 2 * 1024 * 1024 * 1024; // 2GB limit for browser
      if (file.size > maxBrowserSize) {
        throw new Error(`File size (${fileSizeGB.toFixed(2)} GB) exceeds browser processing limit of 2GB. Please use a smaller file or process on a server.`);
      }
      
      let inputPath = inputName;
      
      // For all files, load directly - FFmpeg.js handles the memory
      console.log('Loading file to FFmpeg virtual filesystem...');
      
      try {
        const fileBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(fileBuffer);
        await ffmpeg.writeFile(inputName, uint8Array);
        console.log('File loaded successfully.');
        setProgress(50);
      } catch (loadError) {
        console.error('Failed to load file:', loadError);
        throw new Error(`Failed to load file into processing engine: ${String(loadError)}. The file may be too large or corrupted.`);
      }
      
      // Run FFmpeg conversion
      console.log('Starting FFmpeg audio extraction...');
      setProgress(50);
      await ffmpeg.exec([
        '-i',
        inputPath,
        '-ar', '16000', 
        '-ac', '1', 
        '-c:a', 'pcm_s16le', 
        outputName,
      ]);
      console.log('FFmpeg conversion complete.');
      setProgress(80);
      
      // Add delay and read output file with retry
      await new Promise(resolve => setTimeout(resolve, 300));
      
      let data: any;
      let retries = 5;
      while (retries > 0) {
        try {
          console.log(`Reading output file (attempt ${6 - retries}/5)...`);
          data = await ffmpeg.readFile(outputName);
          console.log('Output file read successfully.');
          break;
        } catch (readError) {
          retries--;
          if (retries === 0) {
            console.error('Failed to read output file after retries:', readError);
            throw new Error(`Failed to read audio output: ${String(readError)}`);
          }
          console.warn(`Read attempt failed, retrying...`, readError);
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      
      // Convert to Blob
      const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
      const outputBuffer = (bytes.buffer as ArrayBuffer).slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const audioBlob = new Blob([outputBuffer], { type: 'audio/wav' });
      const audioURL = URL.createObjectURL(audioBlob);
      console.log('Audio blob created successfully.');
      setProgress(90);

      // Cleanup files
      try { await ffmpeg.deleteFile(outputName); } catch (e) { console.warn('Failed to delete output file:', e); }
      try { await ffmpeg.deleteFile(inputName); } catch (e) { console.warn('Failed to delete input file:', e); }

      // Send to worker for transcription
      console.log('Sending audio to worker for transcription...');
      setProgress(95);
      workerRef.current.postMessage({ 
        audioURL, 
        modelName: 'Xenova/whisper-tiny.en' 
      });

    } catch (err: any) {
      console.error('Transcription error:', err);
      const errorMsg = err?.message || String(err) || 'Unknown error';
      setErrorMessage('Audio extraction failed: ' + errorMsg);
      setStatus('error');
      if (activeJobId) {
        try {
          await updateJob(activeJobId, {
            status: 'error',
            errorMessage: errorMsg,
          });
        } catch (backendError) {
          console.warn('Failed to update transcription job:', backendError);
        }
      }
      try { await ffmpeg.unmount(mountPoint); } catch (e) {}
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadTxt = () => {
    const blob = new Blob([transcript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcription-${new Date().getTime()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setShowDownloadMenu(false);
  };

  const downloadPdf = () => {
    const doc = new jsPDF();
    const splitText = doc.splitTextToSize(transcript, 180);
    doc.text(splitText, 10, 10);
    doc.save(`transcription-${new Date().getTime()}.pdf`);
    setShowDownloadMenu(false);
  };

  const downloadDocx = async () => {
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            children: [new TextRun(transcript)],
          }),
        ],
      }],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcription-${new Date().getTime()}.docx`;
    a.click();
    URL.revokeObjectURL(url);
    setShowDownloadMenu(false);
  };

  return (
    <div className="card" style={{ maxWidth: '900px', margin: '2rem auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <h1 className="gradient-text" style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '0.75rem' }}>
          Convert Audio to Text
        </h1>
        <p style={{ color: '#cbd5e1', fontSize: '1.1rem', marginBottom: '0.5rem' }}>
          Fast transcription powered by AI. Upload videos or audio files up to 2GB, get instant transcripts. Results are saved to your account.
        </p>
        {backendMessage && (
          <p style={{ marginTop: '0.75rem', color: '#10b981', fontSize: '0.95rem', background: 'rgba(16, 185, 129, 0.1)', padding: '0.5rem 1rem', borderRadius: '8px', display: 'inline-block' }}>
            ✓ {backendMessage}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.75rem', 
          background: 'rgba(14, 165, 233, 0.1)', 
          padding: '1rem',
          borderRadius: '12px',
          border: '1px solid rgba(14, 165, 233, 0.2)'
        }}>
          <Zap size={20} color="var(--secondary)" />
          <p style={{ fontSize: '0.9rem', color: '#e2e8f0' }}>
            <strong>Supported:</strong> Videos and audio files up to 2GB • Works in your browser • Results saved securely
          </p>
        </div>

        <div 
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: '2px dashed var(--glass-border)',
            borderRadius: '20px',
            padding: '3rem',
            textAlign: 'center',
            cursor: 'pointer',
            background: file ? 'rgba(139, 92, 246, 0.05)' : 'transparent',
            transition: 'all 0.2s ease',
          }}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept="video/*,audio/*" 
            style={{ display: 'none' }} 
          />
          
          {file ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
              <FileAudio size={48} color="var(--primary)" />
              <div>
                <p style={{ fontWeight: 600 }}>{file.name}</p>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '1.5rem', borderRadius: '50%' }}>
                <Languages size={32} color="#94a3b8" />
              </div>
              <div>
                <p style={{ fontWeight: 500, marginBottom: '0.25rem' }}>Click to upload or drag and drop</p>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>MP4, MOV, WAV, MP3 • Max 2GB</p>
              </div>
            </div>
          )}
        </div>

        {file && status === 'idle' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <button onClick={startTranscription} className="btn btn-primary" style={{ alignSelf: 'center', width: '100%', maxWidth: '300px' }}>
              Start Transcription
            </button>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center' }}>
              Your file will be processed in the browser and saved to your account history.
            </p>
          </div>
        )}

        {(status === 'loading' || status === 'processing') && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '2rem', padding: '2.5rem 2rem', background: 'rgba(15, 23, 42, 0.5)', borderRadius: '16px', border: '1px solid rgba(148, 163, 184, 0.1)' }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ marginBottom: '1.5rem' }}>
                <Loader2 className="animate-spin" size={48} color="var(--primary)" style={{ margin: '0 auto' }} />
              </div>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 600, marginBottom: '0.5rem', color: '#e2e8f0' }}>
                {status === 'loading' ? 'Preparing AI Model' : 'Transcribing Your Audio'}
              </h3>
              <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
                {progressPhase}
              </p>
              
              {/* Progress Bar */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ 
                  width: '100%', 
                  height: '8px', 
                  background: 'rgba(148, 163, 184, 0.1)', 
                  borderRadius: '10px',
                  overflow: 'hidden',
                  marginBottom: '0.75rem'
                }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ type: 'tween', duration: 0.3 }}
                    style={{
                      height: '100%',
                      background: 'linear-gradient(90deg, var(--primary), #22c55e)',
                      borderRadius: '10px',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>{progress}% complete</p>
                  <p style={{ color: '#64748b', fontSize: '0.8rem' }}>
                    {status === 'processing' ? 'This may take a minute...' : 'Loading model...'}
                  </p>
                </div>
              </div>
            </div>

            {/* Live Transcription Text */}
            {status === 'processing' && liveTranscript && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  background: 'rgba(20, 184, 166, 0.1)',
                  border: '1px solid rgba(20, 184, 166, 0.2)',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  maxHeight: '300px',
                  overflowY: 'auto'
                }}
              >
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.75rem', fontWeight: 500 }}>LIVE TRANSCRIPTION</p>
                <p style={{
                  color: '#e2e8f0',
                  fontSize: '1rem',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'system-ui, -apple-system, sans-serif'
                }}>
                  {liveTranscript}
                  <span style={{ display: 'inline-block', width: '2px', height: '1.2em', background: 'var(--primary)', marginLeft: '4px', animation: 'blink 1s infinite' }} />
                </p>
              </motion.div>
            )}
          </motion.div>
        )}

        {status === 'done' && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '0.5rem' }}
          >
            <div style={{ 
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: '12px',
              padding: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}>
              <Check size={24} color="#22c55e" />
              <div>
                <p style={{ color: '#22c55e', fontWeight: 600, marginBottom: '0.25rem' }}>Transcription Complete!</p>
                <p style={{ color: '#86efac', fontSize: '0.9rem' }}>Your audio has been successfully converted to text.</p>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <h3 style={{ color: '#e2e8f0', fontSize: '1.2rem', fontWeight: 600 }}>Your Transcription</h3>
              <div style={{ display: 'flex', gap: '0.75rem', position: 'relative' }}>
                <button onClick={copyToClipboard} className="btn btn-outline" style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                  {copied ? <><Check size={16} color="#22c55e" /> Copied!</> : <><Copy size={16} /> Copy</>}
                </button>
                
                <div style={{ position: 'relative' }}>
                  <button 
                    onClick={() => setShowDownloadMenu(!showDownloadMenu)} 
                    className="btn btn-primary" 
                    style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    <Download size={16} />
                    Download
                    <ChevronDown size={14} />
                  </button>

                  <AnimatePresence>
                    {showDownloadMenu && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        style={{
                          position: 'absolute',
                          top: '110%',
                          right: 0,
                          background: 'var(--card)',
                          border: '1px solid var(--glass-border)',
                          borderRadius: '12px',
                          overflow: 'hidden',
                          zIndex: 10,
                          width: '160px',
                          boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
                        }}
                      >
                        <button onClick={downloadTxt} className="download-option">
                          <FileText size={16} /> Text (.txt)
                        </button>
                        <button onClick={downloadDocx} className="download-option">
                          <FileIcon size={16} /> Word (.docx)
                        </button>
                        <button onClick={downloadPdf} className="download-option">
                          <FileIcon size={16} /> PDF (.pdf)
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
            
            <div style={{ 
              background: 'rgba(0,0,0,0.2)', 
              padding: '1.5rem', 
              borderRadius: '12px', 
              border: '1px solid var(--glass-border)',
              minHeight: '150px',
              maxHeight: '400px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              fontSize: '1rem',
              lineHeight: '1.6'
            }}>
              {transcript}
            </div>
          </motion.div>
        )}

        {status === 'error' && (
          <div style={{ 
            background: 'rgba(239, 44, 44, 0.1)', 
            padding: '1.5rem', 
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            color: '#f87171'
          }}>
            <AlertCircle size={24} />
            <p>{errorMessage}</p>
          </div>
        )}
      </div>

      <style jsx>{`
        .download-option {
          width: 100%;
          padding: 0.75rem 1rem;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: transparent;
          border: none;
          color: white;
          cursor: pointer;
          font-size: 0.9rem;
          text-align: left;
          transition: background 0.2s;
        }
        .download-option:hover {
          background: rgba(255, 255, 255, 0.05);
          color: var(--primary);
        }
        @keyframes blink {
          0%, 49% {
            opacity: 1;
          }
          50%, 100% {
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
