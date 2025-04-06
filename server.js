const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const axios = require("axios");
const querystring = require("querystring");
require("dotenv").config();

const app = express();
app.use(cookieParser()); // Use cookie-parser middleware

app.use(express.static("public")); // Serve files from the 'public' directory
app.use(cors()); // Enable CORS for all routes

// --- Placeholder Spotify URLs ---
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;

const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE_URL = "https://api.spotify.com/v1"; // Base for API calls
// --- End Placeholder Spotify URLs ---

console.log('--- Configuration ---');
console.log('CLIENT_ID:', CLIENT_ID ? 'Loaded' : 'MISSING!');
console.log('CLIENT_SECRET:', CLIENT_SECRET ? 'Loaded' : 'MISSING!');
console.log('REDIRECT_URI:', REDIRECT_URI);
console.log('---------------------');


// Helper function for generating state parameter
const generateRandomString = (length) => {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

// Step 1: Redirect user to Spotify login
app.get("/login", (req, res) => {
    const scope = "user-read-private user-read-email user-library-read playlist-read-private"; // Added playlist-read-private
    const state = generateRandomString(16);
    res.cookie('spotify_auth_state', state);

    const authQuery = querystring.stringify({
        response_type: "code",
        client_id: CLIENT_ID,
        scope: scope,
        redirect_uri: REDIRECT_URI,
        state: state
    });
    const redirectUrl = `${SPOTIFY_AUTH_URL}?${authQuery}`;
    console.log(`Redirecting user to Spotify for authorization: ${redirectUrl}`);
    res.redirect(redirectUrl);
});

// Step 2: Handle callback from Spotify, exchange code for token
app.get("/callback", async (req, res) => {
    const code = req.query.code || null;
    const state = req.query.state || null;
    const storedState = req.cookies ? req.cookies['spotify_auth_state'] : null;

    console.log("Received callback from Spotify.");
    console.log("  Code received:", code ? 'Yes' : 'No');
    console.log("  State received:", state);
    console.log("  Stored state in cookie:", storedState);

    // *** IMPORTANT: Uncomment the state check for production/security ***
    /*
    if (state === null || state !== storedState) {
        console.error("State mismatch error. Possible CSRF attack.");
        console.error(`  Query State: ${state}, Cookie State: ${storedState}`);
        res.redirect('/#error=state_mismatch');
        return; // Stop execution
    } else {
        res.clearCookie('spotify_auth_state'); // Clear the state cookie once validated
    */
        // --- Temporarily bypassing state check as requested ---
        console.warn("!!! State check bypassed for debugging !!!");
         if (req.cookies && req.cookies['spotify_auth_state']) {
             res.clearCookie('spotify_auth_state');
         }
        // --- END Temporary Bypass ---

        const authOptions = {
            url: SPOTIFY_TOKEN_URL,
            method: 'post',
            data: querystring.stringify({
                code: code,
                redirect_uri: REDIRECT_URI,
                grant_type: "authorization_code",
            }),
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: `Basic ${Buffer.from(
                    `${CLIENT_ID}:${CLIENT_SECRET}`
                ).toString("base64")}`,
            },
        };

        try {
            console.log(`Requesting access token from: ${SPOTIFY_TOKEN_URL}`);
            const response = await axios(authOptions);

            if (response.status === 200) {
                const { access_token, refresh_token, expires_in } = response.data;
                console.log("Successfully obtained tokens.");
                console.log(" Expires In:", expires_in);

                const query = querystring.stringify({
                    access_token: access_token,
                    expires_in: expires_in
                });
                console.log("Redirecting to frontend with token info in hash.");
                res.redirect(`/#${query}`);

            } else {
                console.error("Token exchange failed with status:", response.status, response.statusText);
                const query = querystring.stringify({
                    error: 'token_exchange_failed',
                    status: response.status
                 });
                res.redirect(`/#${query}`);
            }
        } catch (error) {
            console.error("Error requesting access token from Spotify:");
            if (error.response) {
                console.error("  Status:", error.response.status);
                console.error("  Headers:", error.response.headers);
                console.error("  Data:", error.response.data);
                 const query = querystring.stringify({
                    error: 'invalid_token_request',
                    details: error.response.data?.error_description || 'Check server logs'
                 });
                 res.redirect(`/#${query}`);
            } else if (error.request) {
                console.error("  No response received:", error.request);
                 res.redirect('/#error=spotify_no_response');
            } else {
                console.error("  Error setting up request:", error.message);
                 res.redirect('/#error=request_setup_error');
            }
        }
    //} // End of the 'else' block for the state check (if uncommented)
});

// API Endpoint: Get current user's profile
app.get("/me", async (req, res) => {
    console.log("Received request for /me");
    const authHeader = req.headers.authorization;
    const access_token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(" ")[1] : null;

    if (!access_token) {
        console.warn("Authorization token missing or malformed for /me request.");
        return res.status(401).json({ error: "Authorization token missing or invalid" });
    }

    const apiUrl = `${SPOTIFY_API_BASE_URL}/me`; // Should resolve to https://api.spotify.com/v1/me
    console.log(`Attempting to fetch from Spotify API: ${apiUrl}`);

    try {
        const response = await axios.get(apiUrl, {
            headers: { Authorization: `Bearer ${access_token}` },
        });
        console.log("Successfully fetched /me data from Spotify.");
        res.json(response.data);
    } catch (err) {
        console.error(`Error fetching ${apiUrl}:`);
        // ... (error handling as before) ...
        if (err.response) { console.error("...", err.response.status, err.response.data); res.status(err.response.status).json({ error: "Error fetching user info from Spotify", details: err.response.data }); } else { console.error("...", err.message); res.status(500).json({ error: "Failed to connect to Spotify API" }); }
    }
});

// API Endpoint: Get current user's playlists
app.get("/playlists", async (req, res) => {
    console.log("Received request for /playlists");
    const authHeader = req.headers.authorization;
    const access_token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(" ")[1] : null;

    if (!access_token) {
        console.warn("Authorization token missing or malformed for /playlists request.");
        return res.status(401).json({ error: "Authorization token missing or invalid" });
    }

    const apiUrl = `${SPOTIFY_API_BASE_URL}/me/playlists`; // Should resolve to https://api.spotify.com/v1/me/playlists base
    console.log(`Attempting to fetch from Spotify API: ${apiUrl}`);

    try {
        const response = await axios.get(apiUrl, {
            headers: { Authorization: `Bearer ${access_token}` },
            params: { limit: 50 } // Fetch up to 50 playlists
        });
        console.log("Successfully fetched /playlists data from Spotify.");
        res.json(response.data);
    } catch (err) {
        console.error(`Error fetching ${apiUrl}:`);
         // ... (error handling as before) ...
        if (err.response) { console.error("...", err.response.status, err.response.data); res.status(err.response.status).json({ error: "Error fetching playlists from Spotify", details: err.response.data }); } else { console.error("...", err.message); res.status(500).json({ error: "Failed to connect to Spotify API" }); }
    }
});

// --- NEW ENDPOINT: Get tracks for a specific playlist ---
app.get("/playlist-tracks/:playlist_id", async (req, res) => {
    const playlistId = req.params.playlist_id;
    console.log(`Received request for /playlist-tracks/${playlistId}`);

    const authHeader = req.headers.authorization;
    const access_token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(" ")[1] : null;

    if (!access_token) {
        console.warn(`Authorization token missing for /playlist-tracks/${playlistId} request.`);
        return res.status(401).json({ error: "Authorization token missing or invalid" });
    }
    if (!playlistId) {
         console.warn("Playlist ID missing from request.");
        return res.status(400).json({ error: "Missing playlist ID" });
    }

    // Construct the URL using the API Base URL + specific endpoint path
    // Placeholder: https://www.google.com/search?q=http://developer.spotify.com/dashboard/{playlist_id}/tracks
    const spotifyTrackApiUrl = `${SPOTIFY_API_BASE_URL}/playlists/${playlistId}/tracks`;
    console.log(`Attempting to fetch tracks from Spotify API: ${spotifyTrackApiUrl}`);

    try {
        const response = await axios.get(spotifyTrackApiUrl, {
            headers: { Authorization: `Bearer ${access_token}` },
            params: {
                limit: 100, // Get up to 100 tracks per request (adjust as needed)
                // Request specific fields to reduce response size
                fields: 'items(track(id,name,uri,duration_ms,artists(name),album(name)))'
            }
        });
        console.log(`Successfully fetched tracks for playlist ${playlistId}.`);
        // We only need the 'items' array from the response
        res.json(response.data); // Send Spotify's track data structure back
    } catch (err) {
        console.error(`Error fetching tracks for playlist ${playlistId}:`);
        if (err.response) {
            console.error("  Spotify API Error Status:", err.response.status);
            console.error("  Spotify API Error Data:", err.response.data);
            res.status(err.response.status).json({
                 error: "Error fetching playlist tracks from Spotify",
                 details: err.response.data
            });
        } else {
             console.error("  Network or other error:", err.message);
             res.status(500).json({ error: "Failed to connect to Spotify API" });
        }
    }
});
// --- END NEW ENDPOINT ---


// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`\nServer running on http://localhost:${PORT}`));