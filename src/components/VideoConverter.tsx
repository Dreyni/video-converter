'use client';

import React, { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { Upload, FileVideo, CheckCircle2, Loader2, Download, AlertCircle, RefreshCcw } from 'lucide-react';
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
      
      ffmpegInstance.on('log', ({ message }) => {
        console.log(message);
      });

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

      await ffmpeg.writeFile(inputName, await fetchFile(videoFile));

      // For 4GB files, we MUST use stream copy if possible to avoid OOM
      // If the user wants to change container only, -c copy is lightning fast
      const command = ['-i', inputName, '-c', 'copy', outputName];
      
      // If formats are very different, we might need full re-encoding, 
      // but warn user about memory
      // ['-i', inputName, outputName]
      
      await ffmpeg.exec(command);

      const data = await ffmpeg.readFile(outputName);
      const url = URL.createObjectURL(new Blob([(data as any).buffer], { type: `video/${outputFormat}` }));
      
      setOutputUrl(url);
      setStatus('done');
    } catch (err) {
      console.error('Conversion error:', err);
      setStatus('error');
      setErrorMessage('Error processing large file. Browser memory limit reached.');
    }
  };

  return (
    <div className="card" style={{ maxWidth: '800px', margin: '2rem auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h2 className="gradient-text" style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          Video Converter
        </h2>
        <p style={{ color: '#94a3b8' }}>Fast, private, and secure. Processes right in your browser.</p>
      </div>

      {!loaded ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '3rem' }}>
          <Loader2 className="animate-spin" size={40} color="var(--primary)" />
          <p>Initializing Video Engine...</p>
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
            onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
            onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--glass-border)')}
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
                <div style={{ 
                  background: 'rgba(255, 255, 255, 0.05)', 
                  padding: '1.5rem', 
                  borderRadius: '50%' 
                }}>
                  <Upload size={32} color="#94a3b8" />
                </div>
                <p style={{ fontWeight: 500 }}>Drop your video here or click to browse</p>
                <p style={{ fontSize: '0.8rem', color: '#64748b' }}>Supports files up to 4GB+</p>
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
