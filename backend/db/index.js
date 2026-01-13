let pool = null;

module.exports = {
  setPool(p) { pool = p; },
  getPool() { return pool; }
};
