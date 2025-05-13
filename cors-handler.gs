/**
 * CORS Handler for Google Apps Script Web Apps
 * Include this file in both Google Apps Script projects to ensure proper cross-origin requests
 */

// Wrapper for doGet to add CORS headers
function doGetWithCORS(e, callback) {
  const output = callback(e);
  return addCorsHeaders(output);
}

// Wrapper for doPost to add CORS headers
function doPostWithCORS(e, callback) {
  const output = callback(e);
  return addCorsHeaders(output);
}

// Add CORS headers to the response
function addCorsHeaders(output) {
  // If output is already a TextOutput object
  if (output.getContentType && output.getContentType() === ContentService.MimeType.JSON) {
    return output
      .setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      .setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      .setHeader('Access-Control-Max-Age', '3600');
  }
  
  // If output is not a TextOutput object, convert it
  const text = (typeof output === 'object') ? JSON.stringify(output) : String(output);
  return ContentService.createTextOutput(text)
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    .setHeader('Access-Control-Max-Age', '3600');
}

/**
 * Handle OPTIONS requests for CORS preflight
 * This function should be called at the beginning of both doGet and doPost
 */
function handleOptions() {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    .setHeader('Access-Control-Max-Age', '3600');
}
