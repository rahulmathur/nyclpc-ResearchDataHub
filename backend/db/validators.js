/**
 * Database validators for ensuring data integrity
 */

const { getEnumMap } = require('./utils');

/**
 * Validates data fields against PostgreSQL enum values for a given table
 * @param {string} tableName - The name of the table to validate against
 * @param {Object} data - The data object with field/value pairs to validate
 * @returns {Promise<{valid: boolean, errors: string[]}>} Validation result
 */
async function validateEnumFields(tableName, data) {
  const enumMap = await getEnumMap(tableName);
  const errors = [];

  for (const [k, v] of Object.entries(data)) {
    if (v == null) continue;
    const allowed = enumMap[k];
    if (Array.isArray(allowed) && allowed.length > 0 && !allowed.includes(String(v))) {
      errors.push(`Invalid value for ${k}: ${v}. Allowed values: ${allowed.join(', ')}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateEnumFields };
