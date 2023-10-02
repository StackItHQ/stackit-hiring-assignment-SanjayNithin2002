const { google } = require('googleapis');
const express = require('express');
const app = express();
const cookieParser = require('cookie-parser');
const morgan = require('morgan');


app.use(cookieParser('csvimporter'));
app.use(morgan('dev'));


const oauth2Client = new google.auth.OAuth2(
    "561417270978-ib7hcmepqd07uv40dbt39ghoajjld7qn.apps.googleusercontent.com",
    "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",
    "http://localhost:3000/auth/google/callback"
);

const scopes = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/spreadsheets'
];

app.get("/", (req, res) => {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes
    });
    res.redirect(authUrl);
});

app.get("/auth/google/callback", async (req, res) => {
    const code = req.query.code;
    console.log(code);
    if (!code) {
        res.status(400).send("Authorization code missing.");
        return;
    }
    try {
        const { tokens } = await oauth2Client.getToken(code);
        res.cookie('auth', tokens, { signed: true });
        res.redirect('/getsheets');
    } catch (error) {
        console.error("Error exchanging authorization code:", error);
        res.status(500).send("Error during authorization.");
    }
});

app.get('/getsheets', async (req, res) => {
    oauth2Client.setCredentials(req.signedCookies.auth);
    const title = "first-sheet";
    const resource = {
        properties: {
            title,
        },
    };
    const service = google.sheets({ version: 'v4', auth: oauth2Client });

    try {
        const spreadsheet = await service.spreadsheets.create({
            resource,
            fields: 'spreadsheetId',
        });
        const spreadsheetId = spreadsheet.data.spreadsheetId;

        console.log(`Spreadsheet ID: ${spreadsheetId}`);

        const range = 'Sheet1!A1';
        const valueInputOption = 'RAW';
        const values = [
            ['Hello', 'World'],
            ['123', '456'],
        ];

        const requestBody = {
            values,
        };

        await service.spreadsheets.values.append({
            spreadsheetId,
            range,
            valueInputOption,
            requestBody,
        });

        res.send(`Spreadsheet ID: ${spreadsheetId} - Content added successfully`);

    } catch (err) {
        console.log(err);
        res.status(500).send("Error creating spreadsheet or adding content.");
    }
})

app.listen(3000, () => {
    console.log("Server is running on port 3000");
});
