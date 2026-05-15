'use client';

import React, { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { Upload, FileVideo, CheckCircle2, Loader2, Download, AlertCircle, RefreshCcw } from 'lucide-react';
import { motion } from 'framer-motion';

export default function VideoConverter() {
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'converting' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [debugLog, setDebugLog] = useState('');
  const [outputFormat, setOutputFormat] = useState('mp4');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadFFmpeg = async () => {
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
        setLoaded(true);
      } catch (err) {
        console.error('Failed to load FFmpeg:', err);
        setStatus('error');
        setErrorMessage('Failed to load video engine. Please refresh.');
      }
    };

    loadFFmpeg();

    return () => {
      ffmpegRef.current?.terminate();
      ffmpegRef.current = null;
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      setOutputUrl(null);
      setStatus('idle');
      setProgress(0);
      setErrorMessage('');
    }
  };

  const convertVideo = async () => {
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg || !videoFile) return;

    setStatus('converting');
    setProgress(0);
    setErrorMessage('');
    setDebugLog('');

    const mountPoint = '/';
    const inputName = videoFile.name;
    const outputName = `output.${outputFormat}`;

    try {
      // Unmount if already mounted
      try { await ffmpeg.unmount(mountPoint); } catch (e) {}

      // Mount the file
      await ffmpeg.mount('WORKERFS' as any, { files: [videoFile] }, mountPoint);

      // Simple FFmpeg command - just copy streams
      await ffmpeg.exec([
        '-i', `/${inputName}`,
        '-c', 'copy',
        outputName
      ]);

      // Read output
      const data = await ffmpeg.readFile(outputName);
      const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
      const buffer = (bytes.buffer as ArrayBuffer).slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const url = URL.createObjectURL(new Blob([buffer], { type: `video/${outputFormat}` }));
      
      setOutputUrl(url);
      setStatus('done');
      setProgress(100);

      // Cleanup
      try { await ffmpeg.deleteFile(outputName); } catch (e) {}
      
    } catch (err: any) {
      console.error('Error:', err);
      setStatus('error');
      setErrorMessage(err?.message || String(err) || 'Conversion failed');
    } finally {
      try { await ffmpeg.unmount(mountPoint); } catch (e) {}
    }
  };

  return (
    <div className="card" style={{ maxWidth: '800px', margin: '2rem auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h2 className="gradient-text" style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          Video Converter
        </h2>
        <p style={{ color: '#94a3b8' }}>Convert videos locally in your browser</p>
      </div>

      {!loaded ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '3rem' }}>
          <Loader2 className="animate-spin" size={40} color="var(--primary)" />
          <p>Initializing Pro Engine...</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          <div 
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed var(--glass-border)',
              borderRadius: '20px',
              padding: '3rem',
              textAlign: 'center',
              cursor: 'pointer',
              background: videoFile ? 'rgba(139, 92, 246, 0.05)' : 'transparent',
              transition: 'all 0.2s ease',
            }}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept="video/*" 
              style={{ display: 'none' }} 
            />
            
            {videoFile ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                <FileVideo size={48} color="var(--primary)" />
                <div>
                  <p style={{ fontWeight: 600 }}>{videoFile.name}</p>
                  <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    {(videoFile.size / (1024 * 1024 * 1024)).toFixed(2)} GB
                  </p>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '1.5rem', borderRadius: '50%' }}>
                  <Upload size={32} color="#94a3b8" />
                </div>
                <p style={{ fontWeight: 500 }}>Drop your 4GB+ video here</p>
              </div>
            )}
          </div>

          {videoFile && status === 'idle' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}
            >
              <span>Convert to:</span>
              <select 
                value={outputFormat}
                onChange={(e) => setOutputFormat(e.target.value)}
                style={{
                  background: 'var(--glass-bg)',
                  border: '1px solid var(--glass-border)',
                  color: 'white',
                  padding: '0.5rem 1rem',
                  borderRadius: '8px',
                  outline: 'none'
                }}
              >
                <option value="mp4">MP4</option>
                <option value="mov">MOV</option>
                <option value="mkv">MKV</option>
                <option value="webm">WEBM</option>
                <option value="avi">AVI</option>
              </select>
              <button onClick={convertVideo} className="btn btn-primary">
                Convert
              </button>
            </motion.div>
          )}

          {status === 'converting' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span>Processing Large File...</span>
                <span>{progress}%</span>
              </div>
              <div style={{ 
                height: '8px', 
                background: 'rgba(255, 255, 255, 0.1)', 
                borderRadius: '4px',
                overflow: 'hidden'
              }}>
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  style={{ 
                    height: '100%', 
                    background: 'linear-gradient(90deg, var(--primary), var(--secondary))',
                    borderRadius: '4px'
                  }} 
                />
              </div>
            </div>
          )}

          {status === 'done' && outputUrl && (
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              style={{ 
                background: 'rgba(34, 197, 94, 0.1)', 
                padding: '1.5rem', 
                borderRadius: '16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1rem'
              }}
            >
              <CheckCircle2 size={32} color="#22c55e" />
              <p style={{ fontWeight: 600 }}>Done!</p>
              <a href={outputUrl} download={`output.${outputFormat}`} className="btn btn-primary">
                <Download size={18} /> Download
              </a>
            </motion.div>
          )}

          {status === 'error' && (
            <div style={{ 
              background: 'rgba(239, 68, 68, 0.1)', 
              padding: '1rem', 
              borderRadius: '12px',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              display: 'flex',
              gap: '1rem'
            }}>
              <AlertCircle size={20} color="#ef4444" />
              <div>
                <p style={{ color: '#fca5a5' }}>{errorMessage}</p>
                {debugLog && <p style={{ marginTop: '0.5rem', color: '#fecaca', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{debugLog}</p>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
