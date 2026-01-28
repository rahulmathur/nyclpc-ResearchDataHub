import { useState, useCallback } from 'react';
import axios from '../api/axiosConfig';

/**
 * Custom hook for handling delete operations with confirmation dialog.
 * Shows a confirmation prompt before deleting and handles errors gracefully.
 *
 * @param {string} endpoint - The base API endpoint for deletion (e.g., '/api/projects')
 * @param {Function} onSuccess - Callback function to execute after successful deletion
 * @param {string} [itemType='item'] - The type of item being deleted, used in confirmation message
 * @returns {Object} Hook state and functions
 * @returns {Function} returns.handleDelete - Function to delete an item (shows confirmation first)
 * @returns {boolean} returns.deleting - Whether a delete operation is in progress
 * @returns {string|null} returns.error - Error message if the delete failed
 */
export function useDelete(endpoint, onSuccess, itemType = 'item') {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Handles the deletion of an item with confirmation
   * @param {Object} item - The item to delete (must have id property)
   * @param {string} [item.name] - Optional name for display in confirmation
   * @param {string|number} item.id - The item's unique identifier
   */
  const handleDelete = useCallback(async (item) => {
    const itemName = item.name || item.id;
    if (!window.confirm(`Delete ${itemType} "${itemName}"?`)) return;

    setDeleting(true);
    setError(null);
    try {
      await axios.delete(`${endpoint}/${item.id}`);
      if (onSuccess) await onSuccess();
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || `Failed to delete ${itemType}`;
      setError(errorMsg);
      throw err;
    } finally {
      setDeleting(false);
    }
  }, [endpoint, onSuccess, itemType]);

  return { handleDelete, deleting, error };
}

export default useDelete;
