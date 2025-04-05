const express = require("express");
const cookieParser = require("cookie-parser");  // Move this line after express initialization
const cors = require("cors");
const axios = require("axios");
const querystring = require("querystring");
require("dotenv").config();

const app = express();  // Initialize the express app here first
app.use(cookieParser());  // Then use the cookie-parser middleware

app.use(express.static("public"));
app.use(cors());

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;
const AUTH_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";

// Fix: Root route to show a message
app.get("/", (req, res) => {
    res.send("Spotify API is running! Go to <a href='/login'>Login with Spotify</a>");
});

// Step 1: Redirect user to Spotify login
app.get("/login", (req, res) => {
    const scope = "user-read-private user-read-email user-library-read";
    const authQuery = querystring.stringify({
        response_type: "code",
        client_id: CLIENT_ID,
        scope: scope,
        redirect_uri: REDIRECT_URI,
    });
    res.redirect(`${AUTH_URL}?${authQuery}`);
});

// Step 2: Handle callback and get access token
app.get("/callback", async (req, res) => {
    const code = req.query.code || null;
    try {
        const response = await axios.post(
            TOKEN_URL,
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

        const { access_token, refresh_token } = response.data;

        // Send token to frontend by redirecting with the access token in the URL
        res.redirect(`/user-info?access_token=${access_token}`);
    } catch (error) {
        res.send("Error getting tokens: " + error.message);
    }
});

// Step 3: Fetch user info
app.get("/user-info", async (req, res) => {
    const access_token = req.query.access_token;

    if (!access_token) {
        return res.status(400).json({ error: "Missing access token" });
    }

    try {
        const response = await axios.get("https://api.spotify.com/v1/me", {
            headers: { Authorization: `Bearer ${access_token}` },
        });

        console.log(response.data); // Log user data in the console
        res.json(response.data);
    } catch (error) {
        res.send("Error fetching user data: " + error.message);
    }
});

// Return basic user info
app.get("/me", async (req, res) => {
    const access_token = req.query.access_token || req.headers.authorization?.split(" ")[1];
    if (!access_token) return res.status(400).json({ error: "Missing access token" });

    try {
        const response = await axios.get("https://api.spotify.com/v1/me", {
            headers: { Authorization: `Bearer ${access_token}` },
        });
        res.json(response.data);
    } catch (err) {
        res.status(500).json({ error: "Error fetching user info" });
    }
});

// Return user's playlists
app.get("/playlists", async (req, res) => {
    const access_token = req.query.access_token || req.headers.authorization?.split(" ")[1];
    if (!access_token) return res.status(400).json({ error: "Missing access token" });

    try {
        const response = await axios.get("https://api.spotify.com/v1/me/playlists", {
            headers: { Authorization: `Bearer ${access_token}` },
        });
        res.json(response.data);
    } catch (err) {
        res.status(500).json({ error: "Error fetching playlists" });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
