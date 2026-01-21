import axios from 'axios';

// Configure axios default base URL
// In development: uses proxy from package.json (relative URLs = empty baseURL)
// In production/staging: uses REACT_APP_API_URL if set, otherwise relative URLs (Cloudflare function proxy)
const baseURL = process.env.REACT_APP_API_URL || '';

// Set default base URL for all axios requests
axios.defaults.baseURL = baseURL;

// Set default headers
axios.defaults.headers.common['Content-Type'] = 'application/json';

// Response interceptor: log errors in development
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (process.env.NODE_ENV === 'development') {
      console.error('API Error:', error.response?.data || error.message);
    }
    return Promise.reject(error);
  }
);

// Export axios (now configured) for use throughout the app
export default axios;
