import React from 'react';
import './BrandHeader.css';

export default function BrandHeader() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="logo-section p-4">
        {/* Use public asset path so the uploaded PNG can be swapped without rebuilding */}
        <img src="/assets/research-hub-logo.png" alt="Research Data Hub" className="lpc-logo" />
        <div>
          <a href="https://www.nyc.gov/site/lpc/index.page" className="agency-link" target="_blank" rel="noopener noreferrer"><h1 className="app-title">Research Data Hub</h1></a>
        </div>
      </div>
    </header>
  );
}
