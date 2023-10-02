const express = require('express');
const app = express();
const session = require('express-session');
const cookieParser = require('cookie-parser');
const { google } = require('googleapis');
app.use(cookieParser('csvimporter'));
app.use(session({
    resave: false,
    saveUninitialized: true,
    secret: 'SECRET'
}));

app.get('/', function (req, res) {
    res.send('<h1>Hi</>');
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('App listening on port ' + port));

const passport = require('passport');
var token;

app.use(passport.initialize());
app.use(passport.session());


app.get('/success', async (req, res) => {
    console.log(req.user);
    res.cookie('token', token, { signed: true, maxAge: 86400000 });
    const title = "first-sheet";
    const resource = {
        properties: {
            title,
        },
    };
    const service = google.sheets({version: 'v4', auth: req.user});
    try {
        const spreadsheet = await service.spreadsheets.create({
            resource,
            fields: 'spreadsheetId',
        });
        console.log(`Spreadsheet ID: ${spreadsheet.data.spreadsheetId}`);
        return spreadsheet.data.spreadsheetId;
    } catch (err) {
        console.log(err);
    }

});
app.get('/error', (req, res) => res.send("error logging in"));

passport.serializeUser(function (user, cb) {
    cb(null, user);
});

passport.deserializeUser(function (obj, cb) {
    cb(null, obj);
});

const GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
const GOOGLE_CLIENT_ID = '561417270978-ib7hcmepqd07uv40dbt39ghoajjld7qn.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = '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';
passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/callback"
},
    function (accessToken, refreshToken, profile, done) {
        console.log(accessToken);
        console.log(refreshToken);
        token = accessToken;
        return done(null, token);
    }
));

app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email', 'https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'] }));

app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/error' }),
    function (req, res) {
        // Successful authentication, redirect success.
        res.redirect('/success');
    });