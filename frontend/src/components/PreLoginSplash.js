import React, { useState } from 'react';
import { Button, Modal, Form, Message } from 'semantic-ui-react';
import researchSplash from '../assets/research-splash.jpg';
import './PreLoginSplash.css';

const AUTH_STORAGE_KEY = 'lpc_rdh_authenticated';
const VALID_EMAIL = 'user@lpc.nyc.gov';
const VALID_PASSWORD = 'lpc123';

export default function PreLoginSplash({ onLoginSuccess }) {
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  const openLoginModal = () => {
    setEmail('');
    setPassword('');
    setError(null);
    setLoginModalOpen(true);
  };

  const closeLoginModal = () => {
    setLoginModalOpen(false);
    setEmail('');
    setPassword('');
    setError(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);
    if (email === VALID_EMAIL && password === VALID_PASSWORD) {
      localStorage.setItem(AUTH_STORAGE_KEY, 'true');
      closeLoginModal();
      onLoginSuccess();
    } else {
      setError('Invalid email or password.');
    }
  };

  return (
    <div className="prelogin-splash">
      <div
        className="prelogin-hero"
        role="img"
        aria-label="Research Data Hub"
        style={{ backgroundImage: `url(${researchSplash})` }}
      >
        <div className="prelogin-hero-overlay">
          <div className="prelogin-hero-content">
            <h1 className="prelogin-title">Research Data Hub</h1>
            <p className="prelogin-subtitle">Landmarks Preservation Commission</p>
            <p className="prelogin-description">
              Search, explore, and manage LPC's research dataset. Sign in to continue.
            </p>
            <Button primary size="large" className="prelogin-login-btn" onClick={openLoginModal}>
              Login
            </Button>
          </div>
        </div>
      </div>

      <Modal open={loginModalOpen} onClose={closeLoginModal} size="small" className="prelogin-modal">
        <Modal.Header>Sign in</Modal.Header>
        <Modal.Content>
          <Form onSubmit={handleSubmit}>
            {error && (
              <Message negative onDismiss={() => setError(null)}>
                {error}
              </Message>
            )}
            <Form.Input
              label="Email"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e, { value }) => setEmail(value)}
              autoComplete="email"
            />
            <Form.Input
              label="Password"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e, { value }) => setPassword(value)}
              autoComplete="current-password"
            />
            <Form.Button primary type="submit" content="Sign in" />
          </Form>
        </Modal.Content>
      </Modal>
    </div>
  );
}
