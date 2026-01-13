import React from 'react';
import { Badge } from './ui/badge';

function ConnectionStatus({ status }) {
  if (!status) return null;
  const isConnected = status.database === 'connected';

  return (
    <Badge variant={isConnected ? 'success' : 'destructive'}>
      {isConnected ? `✓ Connected to ${status.dbType}` : '✗ Disconnected'}
    </Badge>
  );
}

export default ConnectionStatus;
