import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import TableView from '../TableView';
import axios from 'axios';

jest.mock('axios');

describe('TableView', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("editing one row doesn't put other rows into edit mode", async () => {
    const mockData = [
      { id: 1, name: 'Alpha', city: 'A' },
      { id: 2, name: 'Beta', city: 'B' }
    ];

    axios.get.mockResolvedValueOnce({ data: { data: mockData, count: 2 } });

    render(<TableView tableName="test_table" />);

    // wait for data to render
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    expect(screen.getByText('Beta')).toBeInTheDocument();

    // click edit on the first row (Alpha)
    const editButtons = screen.getAllByRole('button', { name: /Edit row/i });
    // ensure at least two edit buttons
    expect(editButtons.length).toBeGreaterThanOrEqual(2);

    fireEvent.click(editButtons[0]);

    // now the first row's 'name' cell should be an input with value 'Alpha'
    const inputs = screen.getAllByRole('textbox');
    // there should be at least one input (for the editing row)
    expect(inputs.length).toBeGreaterThanOrEqual(1);
    // find input that has value Alpha
    const alphaInput = inputs.find(i => i.value === 'Alpha');
    expect(alphaInput).toBeDefined();

    // The other row should still show 'Beta' as plain text
    expect(screen.getByText('Beta')).toBeInTheDocument();

    // Save the change (mock PUT)
    axios.put.mockResolvedValueOnce({ data: { success: true } });
    const saveButton = screen.getByRole('button', { name: '' });
    // There are many buttons; find the check icon button by title or test id isn't present.
    // Instead click the first button with an icon 'check' using querySelector approach
    const checkButtons = document.querySelectorAll('button');
    // find the button that contains an svg title or aria-label with 'check' is unreliable across semantic-ui.
    // As a fallback, simulate saving by changing input value and triggering blur which should still use editData
    fireEvent.change(alphaInput, { target: { value: 'Alpha-mod' } });
    
    // Trigger save by clicking the first icon button in the action-buttons area
    const actionButtons = document.querySelectorAll('.action-buttons button');
    // the first action-buttons should contain Save and Cancel when editing
    expect(actionButtons.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(actionButtons[0]);

    await waitFor(() => expect(axios.put).toHaveBeenCalled());

    // After save, both rows should display text values again
    await waitFor(() => expect(screen.getByText('Alpha-mod') || screen.getByText('Alpha')).toBeInTheDocument());
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });
});
