import { useState, useCallback, useEffect } from 'react';
import axios from '../api/axiosConfig';

/**
 * Custom hook for loading table data with schema information.
 * Fetches column metadata automatically on mount and provides
 * a reusable data loading function with error handling.
 *
 * @param {string} tableName - The database table name for fetching schema (e.g., 'hub_projects')
 * @param {string} endpoint - The API endpoint to fetch data from (e.g., '/api/projects')
 * @returns {Object} Hook state and functions
 * @returns {Array} returns.data - The loaded data array
 * @returns {Array|null} returns.schema - The column schema array or null if not loaded
 * @returns {boolean} returns.loading - Whether data is currently loading
 * @returns {string|null} returns.error - Error message if an error occurred
 * @returns {Function} returns.load - Function to load data with optional params
 * @returns {Function} returns.reload - Alias for load function
 */
export function useTableData(tableName, endpoint) {
  const [data, setData] = useState([]);
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * Fetches column metadata from /api/columns/{tableName}
   */
  const fetchSchema = useCallback(async () => {
    try {
      const res = await axios.get(`/api/columns/${tableName}`);
      setSchema(res.data?.columns || []);
    } catch (e) {
      console.warn(`Schema fetch failed for ${tableName}`, e);
      setSchema([]);
    }
  }, [tableName]);

  /**
   * Loads data from the endpoint with optional query parameters
   * @param {Object} params - Optional query parameters to pass to the endpoint
   * @returns {Object} The response data object
   */
  const load = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(endpoint, { params });
      setData(res.data?.data || []);
      return res.data;
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to load data';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  // Auto-fetch schema on mount
  useEffect(() => {
    fetchSchema();
  }, [fetchSchema]);

  return { data, schema, loading, error, load, reload: load };
}

export default useTableData;
