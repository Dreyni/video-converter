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
  const [copied, setCopied] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [progress, setProgress] = useState(0);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [debugLog, setDebugLog] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const [backendMessage, setBackendMessage] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const loadEngines = async () => {
      try {
        const ffmpeg = new FFmpeg();
        ffmpeg.on('log', ({ message }) => {
          setDebugLog(message);
          console.log('[ffmpeg]', message);
        });
        ffmpeg.on('progress', ({ progress: ratio }) => {
          setProgress(Math.round(ratio * 100));
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
      const { status, progress, transcript, error } = e.data;
      if (status === 'progress') setProgress(progress);
      if (status === 'loading' || status === 'processing') setStatus(status as any);
      if (status === 'done') {
        setTranscript(transcript);
        setStatus('done');
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
        setErrorMessage(error || 'AI processing failed.');
        setStatus('error');
        if (jobIdRef.current) {
          void updateJob(jobIdRef.current, {
            status: 'error',
            errorMessage: error || 'AI processing failed.',
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
      setErrorMessage('');
      setDebugLog('');
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
    setDebugLog('');
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

      try { await ffmpeg.unmount(mountPoint); } catch (e) {}

      await ffmpeg.mount('WORKERFS' as any, { files: [file] }, mountPoint);
      
      await ffmpeg.exec([
        '-i',
        `${mountPoint}/${inputName}`,
        '-ar', '16000', 
        '-ac', '1', 
        '-c:a', 'pcm_s16le', 
        outputName,
      ]);
      
      const data = await ffmpeg.readFile(outputName);
      const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
      const outputBuffer = (bytes.buffer as ArrayBuffer).slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const audioBlob = new Blob([outputBuffer], { type: 'audio/wav' });
      const audioURL = URL.createObjectURL(audioBlob);

      await ffmpeg.deleteFile(outputName);
      try { await ffmpeg.unmount(mountPoint); } catch (e) {}

      workerRef.current.postMessage({ 
        audioURL, 
        modelName: 'Xenova/whisper-tiny.en' 
      });

    } catch (err: any) {
      console.error('Transcription error:', err);
      setErrorMessage('Audio extraction failed: ' + (err?.message || String(err) || 'Unknown error'));
      setStatus('error');
      if (activeJobId) {
        try {
          await updateJob(activeJobId, {
            status: 'error',
            errorMessage: err?.message || String(err) || 'Audio extraction failed',
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
    <div className="card" style={{ maxWidth: '800px', margin: '2rem auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h2 className="gradient-text" style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          Free Local Transcriber
        </h2>
        <p style={{ color: '#94a3b8' }}>Pro audio extraction powered by Direct Disk Mounting.</p>
        {backendMessage && <p style={{ marginTop: '0.75rem', color: '#cbd5e1', fontSize: '0.9rem' }}>{backendMessage}</p>}
      </div>

              {debugLog && <p style={{ marginTop: '0.5rem', color: '#fecaca', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{debugLog}</p>}
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
            <strong>Direct Disk Mounting:</strong> Extracting audio from 4GB+ files without crashing your browser.
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
                  {(file.size / (1024 * 1024 * 1024)).toFixed(2)} GB
                </p>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '1.5rem', borderRadius: '50%' }}>
                <Languages size={32} color="#94a3b8" />
              </div>
              <p style={{ fontWeight: 500 }}>Upload large video or audio</p>
            </div>
          )}
        </div>

        {file && status === 'idle' && (
          <button onClick={startTranscription} className="btn btn-primary" style={{ alignSelf: 'center' }}>
            Transcribe
          </button>
        )}

        {(status === 'loading' || status === 'processing') && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', padding: '2rem' }}>
            <Loader2 className="animate-spin" size={40} color="var(--primary)" />
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontWeight: 600 }}>{status === 'loading' ? 'Downloading AI Model...' : 'Processing audio...'}</p>
              {status === 'loading' && <p style={{ fontSize: '0.8rem', color: '#64748b' }}>{progress}%</p>}
            </div>
          </div>
        )}

        {status === 'done' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ color: '#94a3b8' }}>Result</h4>
              <div style={{ display: 'flex', gap: '0.5rem', position: 'relative' }}>
                <button onClick={copyToClipboard} className="btn btn-outline" style={{ padding: '0.5rem' }}>
                  {copied ? <Check size={18} color="#22c55e" /> : <Copy size={18} />}
                </button>
                
                <div style={{ position: 'relative' }}>
                  <button 
                    onClick={() => setShowDownloadMenu(!showDownloadMenu)} 
                    className="btn btn-primary" 
                    style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                  >
                    <Download size={18} />
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
      `}</style>
    </div>
  );
}
