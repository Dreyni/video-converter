import React from 'react';
import { Video, Zap } from 'lucide-react';

export default function Header() {
  return (
    <header style={{ 
      padding: '1.5rem 2rem', 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center',
      borderBottom: '1px solid var(--glass-border)',
      background: 'rgba(10, 10, 12, 0.8)',
      backdropFilter: 'blur(10px)',
      position: 'sticky',
      top: 0,
      zIndex: 100
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ 
          background: 'var(--primary)', 
          padding: '0.5rem', 
          borderRadius: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Video size={24} color="white" />
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.5px' }}>
          Ultra<span style={{ color: 'var(--primary)' }}>Convert</span>
        </h1>
      </div>
      
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: '#94a3b8' }}>
          <Zap size={16} color="var(--secondary)" />
          <span>No size limits</span>
        </div>
        <button className="btn btn-outline" style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>
          How it works
        </button>
      </div>
    </header>
  );
}
