'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createFFmpeg } from '@ffmpeg/ffmpeg';
import { FileAudio, Loader2, Download, Languages, AlertCircle, Copy, Check, FileText, File as FileIcon, ChevronDown, Cpu, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun } from 'docx';

export default function Transcriber() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'processing' | 'done' | 'error'>('idle');
  const [transcript, setTranscript] = useState('');
  const [copied, setCopied] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ffmpeg, setFfmpeg] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const loadEngines = async () => {
      try {
        const ffmpegInstance = createFFmpeg({
          log: true,
          corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
        });
        await ffmpegInstance.load();
        setFfmpeg(ffmpegInstance);
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
      }
      if (status === 'error') {
        setErrorMessage(error || 'AI processing failed.');
        setStatus('error');
      }
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setStatus('idle');
      setTranscript('');
    }
  };

  const startTranscription = async () => {
    if (!file || !ffmpeg || !workerRef.current) return;

    setStatus('processing');
    setProgress(0);
    
    try {
      // 1. Pro Audio Extraction: Mount the 4GB file to disk
      const inputName = file.name;
      const outputName = 'output.wav';

      try { ffmpeg.FS('unmount', '/mnt'); } catch (e) {}
      try { ffmpeg.FS('mkdir', '/mnt'); } catch (e) {}
      
      ffmpeg.FS('mount', (window as any).WorkerFS, {
        files: [file]
      }, '/mnt');
      
      // Extract audio: 16kHz, mono, WAV (required for Whisper)
      // This reads directly from disk, saving GBs of RAM
      await ffmpeg.run(
        '-i', `/mnt/${inputName}`, 
        '-ar', '16000', 
        '-ac', '1', 
        '-c:a', 'pcm_s16le', 
        outputName
      );
      
      const data = ffmpeg.FS('readFile', outputName);
      const audioBlob = new Blob([data.buffer], { type: 'audio/wav' });
      const audioURL = URL.createObjectURL(audioBlob);

      // Cleanup
      ffmpeg.FS('unlink', outputName);
      ffmpeg.FS('unmount', '/mnt');

      // 2. Send to Worker for AI processing
      workerRef.current.postMessage({ 
        audioURL, 
        modelName: 'Xenova/whisper-tiny.en' 
      });

    } catch (err: any) {
      console.error('Transcription error:', err);
      setErrorMessage('Audio extraction failed. Try a smaller file or a different format.');
      setStatus('error');
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
            Start Pro Transcription
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
