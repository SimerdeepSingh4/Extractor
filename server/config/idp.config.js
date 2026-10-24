module.exports = {
  // OCR preprocessing configuration
  ENABLE_OCR_PREPROCESS: process.env.ENABLE_OCR_PREPROCESS !== 'false', // default true
  OCR_PREPROCESS_OPTIONS: {
    // Example Sharp options; customize via env or code as needed
    // resize: { width: 2000 }, // optional resize width
    // threshold: true, // apply binary threshold
  },
  // OCR configuration (tesseract.js works out-of-the-box)
  OCR: {},
  // Google Document AI configuration – values read from environment variables
  DOCUMENT_AI: {
    projectId: process.env.GCP_PROJECT_ID,
    location: process.env.GCP_LOCATION || 'us',
    processorId: process.env.GCP_DOCUMENT_AI_PROCESSOR_ID,
  },
  // OpenAI LLM configuration
  OPENAI: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },
  ENABLE_IDP: process.env.ENABLE_IDP === 'true',
  // New flag – force OCR for PDFs even if embedded text exists
  FORCE_OCR_FOR_PDF: process.env.FORCE_OCR_FOR_PDF === 'true',
};