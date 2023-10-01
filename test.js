const express = require('express');
const app = express();
const session = require('express-session');

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
var userProfile;

app.use(passport.initialize());
app.use(passport.session());

app.set('view engine', 'ejs');

app.get('/success', (req, res) => res.send(userProfile));
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
        userProfile = profile;
        return done(null, userProfile);
    }
));

app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/error' }),
    function (req, res) {
        // Successful authentication, redirect success.
        res.redirect('/success');
    });