const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const axios = require("axios");
const querystring = require("querystring");
require("dotenv").config(); // Make sure this is near the top

// --- NEW: Import Google Generative AI ---
const { GoogleGenerativeAI } = require('@google/generative-ai');
// --- END NEW ---

const app = express();

// --- MIDDLEWARE ---
app.use(cookieParser());
// Serve files from the 'public' directory IF your index.html is there
// If index.html is in the root, this might not be needed or needs adjustment
app.use(express.static("public"));
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // *** Add this line to parse JSON request bodies ***
// --- END MIDDLEWARE ---


// --- Spotify Config ---
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;
// Placeholder URLs (keep as they are if they work with your setup)
const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE_URL = "https://api.spotify.com/v1";
// --- End Spotify Config ---

// --- NEW: Gemini Config ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("CRITICAL: GEMINI_API_KEY not found in .env file!");
  // Optionally exit if the key is essential for the app to run
  // process.exit(1);
}
let genAI;
let geminiModel;
if (GEMINI_API_KEY) {
    try {
        genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        // Choose a model - 'gemini-1.5-flash' is fast and capable
        geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        console.log("Gemini AI SDK Initialized successfully.");
    } catch (error) {
        console.error("Error initializing Gemini AI SDK:", error.message);
        // Handle initialization error if needed
    }
} else {
    console.warn("Gemini functionality disabled because API key is missing.");
}
// --- END NEW ---


console.log('--- Configuration ---');
console.log('CLIENT_ID:', CLIENT_ID ? 'Loaded' : 'MISSING!');
console.log('CLIENT_SECRET:', CLIENT_SECRET ? 'Loaded' : 'MISSING!');
console.log('REDIRECT_URI:', REDIRECT_URI);
console.log('GEMINI_API_KEY:', GEMINI_API_KEY ? 'Loaded' : 'MISSING!'); // Log Gemini key status
console.log('---------------------');


// === EXISTING SPOTIFY ROUTES (/login, /callback, /me, /playlists, /playlist-tracks) ===
// Keep all your existing Spotify routes exactly as they are.
// ... (your /login route) ...
// ... (your /callback route) ...
// ... (your /me route) ...
// ... (your /playlists route) ...
// ... (your /playlist-tracks/:playlist_id route) ...

// === NEW GEMINI API ENDPOINT ===
app.post("/api/generate-mockery", async (req, res) => {
    console.log("Received request for /api/generate-mockery");

    // Check if Gemini was initialized successfully
    if (!geminiModel) {
         console.error("Gemini model not available (check API key and initialization).");
         return res.status(500).json({ error: "AI functionality is currently unavailable." });
    }

    // 1. Get the prompt constructed by the frontend
    const { prompt } = req.body;

    if (!prompt) {
        console.warn("Request to /api/generate-mockery missing 'prompt' in body.");
        return res.status(400).json({ error: 'Prompt is required in request body' });
    }

    try {
        // 2. Make the call to the Gemini API
        console.log("Sending prompt to Gemini..."); // Don't log the full prompt here if it contains sensitive user data
        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        console.log("Received response from Gemini."); // Don't log the response text by default

        // 3. Send the generated text back to the frontend
        res.json({ mockery: text });

    } catch (error) {
        console.error("Error calling Gemini API:", error.message);
        // Check for specific Gemini error types if needed
        res.status(500).json({ error: 'AI failed to generate a response. Please try again.' });
    }
});
// --- END NEW GEMINI ENDPOINT ---


// Start server (keep as is)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`\nServer running on http://localhost:${PORT}`));