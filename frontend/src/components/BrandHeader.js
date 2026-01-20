import React from 'react';
import { Menu } from 'semantic-ui-react';
import logo from '../assets/logo.png';
import './BrandHeader.css';

export default function BrandHeader() {
  return (
    <Menu.Item header className="brand-header-item">
      <div className="logo-section">
        <img src={logo} alt="Research Data Hub" className="lpc-logo" />
        <div className="brand-text">
          <h1 className="app-title">Research Data Hub</h1>
          <a href="https://www.nyc.gov/site/lpc/index.page" className="agency-link" target="_blank" rel="noopener noreferrer">
            Landmarks Preservation Commission
          </a>
        </div>
      </div>
    </Menu.Item>
  );
} 
