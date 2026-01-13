import React from 'react';
import { Menu } from 'semantic-ui-react';
import './BrandHeader.css';

export default function BrandHeader() {
  return (
    <Menu.Item header>
      <div className="logo-section">
        {/* Use public asset path so the uploaded PNG can be swapped without rebuilding */}
        <img src="/assets/research-hub-logo.png" alt="Research Data Hub" className="lpc-logo" />
        <div>
          <a href="https://www.nyc.gov/site/lpc/index.page" className="agency-link" target="_blank" rel="noopener noreferrer"><h1 className="app-title">Research Data Hub</h1></a>
        </div>
      </div>
    </Menu.Item>
  );
} 
