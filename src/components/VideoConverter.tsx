'use client';

import React, { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { Upload, FileVideo, CheckCircle2, Loader2, Download, AlertCircle, RefreshCcw, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function VideoConverter() {
  const [ffmpeg, setFfmpeg] = useState<FFmpeg | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'converting' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [outputFormat, setOutputFormat] = useState('mp4');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadFFmpeg();
  }, []);

  const loadFFmpeg = async () => {
    try {
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      const ffmpegInstance = new FFmpeg();
      
      ffmpegInstance.on('progress', ({ progress }) => {
        setProgress(Math.round(progress * 100));
      });

      await ffmpegInstance.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      setFfmpeg(ffmpegInstance);
      setLoaded(true);
    } catch (err) {
      console.error('Failed to load FFmpeg:', err);
      setStatus('error');
      setErrorMessage('Failed to load video engine. Please refresh.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      setOutputUrl(null);
      setStatus('idle');
      setProgress(0);
    }
  };

  const convertVideo = async () => {
    if (!ffmpeg || !videoFile) return;

    setStatus('converting');
    setProgress(0);

    try {
      const inputName = 'input' + videoFile.name.substring(videoFile.name.lastIndexOf('.'));
      const outputName = `output.${outputFormat}`;

      // Memory optimization: Writing directly
      await ffmpeg.writeFile(inputName, await fetchFile(videoFile));

      // Always use 'copy' for large files to avoid OOM
      // If we don't re-encode, we don't use much memory
      const command = ['-i', inputName, '-c', 'copy', outputName];
      
      await ffmpeg.exec(command);

      const data = await ffmpeg.readFile(outputName);
      const url = URL.createObjectURL(new Blob([(data as any).buffer], { type: `video/${outputFormat}` }));
      
      setOutputUrl(url);
      setStatus('done');

      // Immediate cleanup
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
      
    } catch (err: any) {
      console.error('Conversion error:', err);
      setStatus('error');
      
      if (videoFile.size > 2 * 1024 * 1024 * 1024) {
        setErrorMessage('File exceeds browser limit (2GB+). Browsers cannot handle 4GB files yet. Try a smaller file.');
      } else {
        setErrorMessage('Conversion failed. Your browser ran out of memory.');
      }
    }
  };

  return (
    <div className="card" style={{ maxWidth: '800px', margin: '2rem auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h2 className="gradient-text" style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          Video Converter
        </h2>
        <p style={{ color: '#94a3b8' }}>Fast, private, and secure. Optimized for large files.</p>
      </div>

      {!loaded ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '3rem' }}>
          <Loader2 className="animate-spin" size={40} color="var(--primary)" />
          <p>Initializing Video Engine...</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {videoFile && videoFile.size > 2 * 1024 * 1024 * 1024 && (
            <div style={{ 
              background: 'rgba(234, 179, 8, 0.1)', 
              padding: '1rem', 
              borderRadius: '12px',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              display: 'flex',
              gap: '0.75rem',
              color: '#eab308',
              fontSize: '0.9rem'
            }}>
              <Info size={20} />
              <p>
                <strong>Large File Detected:</strong> Files over 2GB may fail due to browser memory limits. 
                We will use "Stream Copy" to save memory.
              </p>
            </div>
          )}

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
                <p style={{ fontWeight: 500 }}>Drop your video here or click to browse</p>
                <p style={{ fontSize: '0.8rem', color: '#64748b' }}>Best performance for files under 2GB</p>
              </div>
            )}
          </div>

          {videoFile && status === 'idle' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem' }}
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
                <option value="webm">WebM</option>
              </select>
              <button onClick={convertVideo} className="btn btn-primary">
                Start Conversion
              </button>
            </motion.div>
          )}

          {status === 'converting' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span>Processing...</span>
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
              <p style={{ fontWeight: 600 }}>Conversion Complete!</p>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <a 
                  href={outputUrl} 
                  download={`converted-${videoFile?.name.split('.')[0]}.${outputFormat}`}
                  className="btn btn-primary"
                >
                  <Download size={18} />
                  Download
                </a>
                <button onClick={() => setStatus('idle')} className="btn btn-outline">
                  <RefreshCcw size={18} />
                  Convert Another
                </button>
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
      )}
    </div>
  );
}
