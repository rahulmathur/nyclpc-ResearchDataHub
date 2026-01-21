import React from 'react';
import { Label, Icon } from 'semantic-ui-react';

function ConnectionStatus({ status }) {
  if (!status) return null;
  const db = status.database ?? status.data?.database;
  const isConnected = db === 'connected';
  const hint = status._hint;

  return (
    <Label color={isConnected ? 'green' : 'red'} title={hint || undefined}>
      <Icon name={isConnected ? 'plug' : 'unlink'} />
      {isConnected ? `Connected` : 'Disconnected'}
    </Label>
  );
}

export default ConnectionStatus;
