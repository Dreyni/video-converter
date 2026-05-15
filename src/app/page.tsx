'use client';

import React, { useState } from 'react';
import Header from '@/components/Header';
import VideoConverter from '@/components/VideoConverter';
import Transcriber from '@/components/Transcriber';
import { Shield, Smartphone, Cpu, Repeat, Type } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'convert' | 'transcribe'>('convert');

  return (
    <main>
      <Header />
      
      <div className="container">
        <section style={{ textAlign: 'center', padding: '4rem 0' }}>
          <h1 className="gradient-text animate-fade-in" style={{ fontSize: '4rem', fontWeight: 900, lineHeight: 1.1, marginBottom: '1.5rem' }}>
            The Ultimate Browser-Based<br />Video Toolkit
          </h1>
          <p className="animate-fade-in" style={{ fontSize: '1.25rem', color: '#94a3b8', maxWidth: '700px', margin: '0 auto', animationDelay: '0.1s' }}>
            Convert 4GB+ videos or transcribe them instantly. 
            No server uploads, no privacy compromises.
          </p>
        </section>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '3rem' }}>
          <button 
            onClick={() => setActiveTab('convert')}
            className={`btn ${activeTab === 'convert' ? 'btn-primary' : 'btn-outline'}`}
            style={{ padding: '0.75rem 2rem' }}
          >
            <Repeat size={20} />
            Convert
          </button>
          <button 
            onClick={() => setActiveTab('transcribe')}
            className={`btn ${activeTab === 'transcribe' ? 'btn-primary' : 'btn-outline'}`}
            style={{ padding: '0.75rem 2rem' }}
          >
            <Type size={20} />
            Transcribe
          </button>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            {activeTab === 'convert' ? <VideoConverter /> : <Transcriber />}
          </motion.div>
        </AnimatePresence>

        <section style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
          gap: '2rem',
          margin: '6rem 0'
        }}>
          <div className="card">
            <Shield size={32} color="var(--primary)" style={{ marginBottom: '1rem' }} />
            <h3 style={{ marginBottom: '0.5rem' }}>Privacy First</h3>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Your files never leave your device. All processing happens in your browser's memory.</p>
          </div>
          <div className="card">
            <Cpu size={32} color="var(--secondary)" style={{ marginBottom: '1rem' }} />
            <h3 style={{ marginBottom: '0.5rem' }}>Local Power</h3>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Uses FFmpeg.wasm for professional-grade conversion with no server-side limitations.</p>
          </div>
          <div className="card">
            <Smartphone size={32} color="var(--accent)" style={{ marginBottom: '1rem' }} />
            <h3 style={{ marginBottom: '0.5rem' }}>No Limits</h3>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Bypass the 1GB limit found in other online tools. If your browser can handle it, we can convert it.</p>
          </div>
        </section>

        <footer style={{ textAlign: 'center', padding: '4rem 0', color: '#64748b', fontSize: '0.9rem', borderTop: '1px solid var(--glass-border)' }}>
          <p>&copy; 2026 UltraConvert. Powered by FFmpeg.wasm.</p>
        </footer>
      </div>
    </main>
  );
}
