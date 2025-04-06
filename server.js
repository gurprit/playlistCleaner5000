const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const axios = require("axios");
const querystring = require("querystring");
require("dotenv").config();

const app = express();
app.use(cookieParser()); // Use cookie-parser middleware

app.use(express.static("public")); // Serve files from the 'public' directory
app.use(cors());

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;

// --- CORRECT SPOTIFY URLS ---
const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE_URL = "https://api.spotify.com/v1";
// --- END CORRECT SPOTIFY URLS ---

console.log('CLIENT_ID:', CLIENT_ID);
console.log('CLIENT_SECRET:', CLIENT_SECRET);
console.log('REDIRECT_URI:', REDIRECT_URI);

// Root route now implicitly serves public/index.html via express.static
// We can keep this simple GET for testing if needed, but it's not strictly required
// if index.html is your entry point.
// app.get("/", (req, res) => {
//     // express.static handles serving index.html from the 'public' directory
//     // You could add a message here if needed, but it might conflict
//     // res.send("Spotify API Backend is running! Go to <a href='/login'>Login with Spotify</a>");
// });

// Step 1: Redirect user to Spotify login
app.get("/login", (req, res) => {
    const scope = "user-read-private user-read-email user-library-read playlist-read-private"; // Added playlist-read-private for potentially private playlists
    const state = generateRandomString(16); // Generate random state for security
    res.cookie('spotify_auth_state', state); // Store state in cookie

    const authQuery = querystring.stringify({
        response_type: "code",
        client_id: CLIENT_ID,
        scope: scope,
        redirect_uri: REDIRECT_URI,
        state: state // Include state in the authorization request
    });
    console.log(`Redirecting to: ${SPOTIFY_AUTH_URL}?${authQuery}`);
    res.redirect(`${SPOTIFY_AUTH_URL}?${authQuery}`);
});

// Step 2: Handle callback and get access token
app.get("/callback", async (req, res) => {
    const code = req.query.code || null;
    const state = req.query.state || null;
    const storedState = req.cookies ? req.cookies['spotify_auth_state'] : null;

    console.log("Callback received - Code:", code ? 'Yes' : 'No', "State:", state, "Stored State:", storedState);


    // --- STATE VALIDATION ---
    if (state === null || state !== storedState) {
        console.error("State mismatch error.");
        res.redirect('/#error=state_mismatch'); // Redirect with error hash
        return; // Stop execution
    } else {
        res.clearCookie('spotify_auth_state'); // Clear the state cookie once validated
        // --- END STATE VALIDATION ---

        try {
            console.log("Requesting token from:", SPOTIFY_TOKEN_URL);
            const response = await axios.post(
                SPOTIFY_TOKEN_URL,
                querystring.stringify({
                    code: code,
                    redirect_uri: REDIRECT_URI,
                    grant_type: "authorization_code",
                }),
                {
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                        Authorization: `Basic ${Buffer.from(
                            `${CLIENT_ID}:${CLIENT_SECRET}`
                        ).toString("base64")}`,
                    },
                }
            );

            const { access_token, refresh_token, expires_in } = response.data;
            console.log("Tokens received:", { access_token: '***', refresh_token: '***', expires_in }); // Don't log full tokens ideally

            // --- CORRECT REDIRECT ---
            // Redirect back to the root of the frontend app (index.html)
            // Append the access token as a query parameter
            // Using a hash (#) is often preferred for client-side tokens to avoid server logs/browser history
             const query = querystring.stringify({
                 access_token: access_token,
                 // refresh_token: refresh_token // Don't usually send refresh token to client
                 expires_in: expires_in
             });
             res.redirect(`/#${query}`); // Redirect to root with token info in hash
            // Alternatively, using query string as originally planned by frontend:
            // res.redirect(`/?access_token=${access_token}`);
            // --- END CORRECT REDIRECT ---

        } catch (error) {
            console.error("Error getting tokens:", error.response ? error.response.data : error.message);
             const query = querystring.stringify({
                 error: 'invalid_token'
             });
             res.redirect(`/#${query}`); // Redirect with error hash
            // res.status(500).send("Error getting tokens: " + (error.response ? JSON.stringify(error.response.data) : error.message));
        }
    } // End of state validation block
});


// --- REMOVED /user-info ROUTE as it's redundant ---

// Return basic user info
app.get("/me", async (req, res) => {
    // Get token from Authorization header (Bearer <token>) - Preferred method
    const authHeader = req.headers.authorization;
    const access_token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(" ")[1] : null;

    if (!access_token) {
        return res.status(401).json({ error: "Authorization token missing or invalid" });
    }

    try {
        console.log("Fetching /me from Spotify API");
        const response = await axios.get(`${SPOTIFY_API_BASE_URL}/me`, {
            headers: { Authorization: `Bearer ${access_token}` },
        });
        res.json(response.data);
    } catch (err) {
        console.error("Error fetching user info:", err.response ? err.response.data : err.message);
        // Forward Spotify's error status if available
        res.status(err.response?.status || 500).json({ error: "Error fetching user info", details: err.response?.data });
    }
});

// Return user's playlists
app.get("/playlists", async (req, res) => {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    const access_token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(" ")[1] : null;

     if (!access_token) {
        return res.status(401).json({ error: "Authorization token missing or invalid" });
    }

    try {
        console.log("Fetching /me/playlists from Spotify API");
        // Added limit parameter for potentially more playlists
        const response = await axios.get(`${SPOTIFY_API_BASE_URL}/me/playlists?limit=50`, {
            headers: { Authorization: `Bearer ${access_token}` },
        });
        res.json(response.data);
    } catch (err) {
        console.error("Error fetching playlists:", err.response ? err.response.data : err.message);
         // Forward Spotify's error status if available
        res.status(err.response?.status || 500).json({ error: "Error fetching playlists", details: err.response?.data });
    }
});

// Helper function for generating state parameter
const generateRandomString = (length) => {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};


// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));