import React from 'react';
import { Label, Icon } from 'semantic-ui-react';

function ConnectionStatus({ status }) {
  if (!status) return null;
  const isConnected = status.database === 'connected';

  return (
    <Label color={isConnected ? 'green' : 'red'}>
      <Icon name={isConnected ? 'plug' : 'unlink'} />
      {isConnected ? `Connected to ${status.dbType}` : 'Disconnected'}
    </Label>
  );
}

export default ConnectionStatus;
