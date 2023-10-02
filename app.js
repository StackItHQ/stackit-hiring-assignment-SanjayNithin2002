// Import required Node.js modules and libraries
const express = require('express');  // Express.js for creating web applications
const { google } = require('googleapis');  // Google API library for interacting with Google services
const bodyParser = require('body-parser');  // Middleware for parsing HTTP request bodies
const morgan = require('morgan');  // Middleware for logging HTTP requests
const multer = require('multer');  // Middleware for handling file uploads
const fs = require('fs');  // Node.js built-in module for file system operations
const _ = require('lodash');  // Utility library for various operations
const csvParser = require('csv-parser');  // Library for parsing CSV files
const cookieParser = require('cookie-parser');  // Middleware for parsing cookies
const handlebars = require('express-handlebars').create({
    defaultLayout: "main"
});  // Templating engine for rendering HTML views
const app = express();
const port = process.env.PORT || 3000;

// Multer Middleware

/* The `multer.diskStorage` function is used to configure the storage engine for multer, which is a
middleware for handling file uploads in Node.js. */
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "./uploads/");
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + "-" + file.originalname)

    }
});

// Code to just accept .csv files
const fileFilter = (req, file, cb) => {
    //accept
    if (file.mimetype === 'text/csv') {
        cb(null, true);
    }
    //reject
    else {
        cb(null, false);
    }
}

// Defining the limits as specified in the requirements.
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 1024 * 1024 * 15
    },
    fileFilter: fileFilter
});

// Google Auth
const oauth2Client = new google.auth.OAuth2(
    process.env.client_id,
    process.env.client_secret,
    process.env.callback_uri
);

const scopes = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/spreadsheets'
];
// Middleware

// Set up middleware for using Handlebars as the templating engine
app.engine("handlebars", handlebars.engine);  // Configure Handlebars as the view engine
app.set('view engine', 'handlebars');  // Set the view engine to Handlebars
app.set('views', './views');  // Set the directory where your view templates are located

// Middleware for parsing URL-encoded and JSON request bodies
app.use(bodyParser.urlencoded({ extended: true }));  // Parse URL-encoded data with extended option
app.use(bodyParser.json());  // Parse JSON request bodies

// Middleware for logging HTTP requests in the "dev" format
app.use(morgan('dev'));

// Middleware for parsing and handling cookies with the secret "csvimporter"
app.use(cookieParser('csvimporter'));


/* This code is defining a route handler for the root URL ("/"). When a user visits the root URL, the
code generates an authorization URL using the `oauth2Client` object and the specified access type
and scope. It then renders the "login" view and passes the generated authorization URL as a variable
called `url`. This view will be rendered and displayed to the user in their browser. */
app.get('/', (req, res) => {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes
    });
    res.render('login', {
        url: authUrl
    });
});

/* This code is handling the callback route for the Google authentication process. When a user
successfully logs in with their Google account, Google will redirect them to this route with an
authorization code as a query parameter. */
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
        res.redirect('/successLogin');
    } catch (error) {
        console.error("Error exchanging authorization code:", error);
        res.status(500).send("Error during authorization.");
    }
});

// To display successful login message.
app.get('/successLogin', (req, res) => {
    res.render('successfulLogin');
});

// Home page where user have to drag and drop the csv file.
app.get("/home", (req, res) => {
    res.render('index');
});

app.post('/upload/csv', upload.single('formfile'), (req, res) => {
    if (req.file) {
        var records = []
        fs.createReadStream(req.file.path)
            .pipe(csvParser())
            .on('data', (data) => {
                // pushing all the data in the csv file to the variable 'records'
                records.push(data);
            })
            .on('end', () => {
                // checking if the uploaded csv file is not empty
                if (records.length > 0) {
                    //Getting all the keys
                    const columns = _.keys(records[0]);
                    //Generating an array of arrays of the same keys.
                    const extractedArrays = _.map(columns, (prop) => _.map(records, prop));
                    // mapping the extracted arrays to their keys
                    const extractedObject = _.reduce(
                        columns,
                        (result, column, index) => {
                            result[column] = extractedArrays[index];
                            return result;
                        },
                        {}
                    );
                    // extracting the unique values of a key (or) column (or) attribute
                    const uniqueElementsObject = _.reduce(
                        extractedObject,
                        (result, object, index) => {
                            if (_.uniq(object).length <= 10) {
                                result[index] = _.sortBy(_.uniq(object));
                            }
                            return result;
                        }, {}
                    )
                    //rendering an HTML code to display the filter criteria
                    const htmlRender = Object.keys(uniqueElementsObject).map(key => {
                        const htmlCheckbox = uniqueElementsObject[key].map(value => `<div class="form-check form-check-inline"><input class="form-check-input" type="checkbox" name=${key} value=${value}><label class="form-check-label">${value}</label></div>`).join(' ');
                        const htmlElements = `<div class="card bg-success" style="width: 20rem;">
                        <div class="card-body">
                          <h5 class="card-title" style="color:black;">${key}</h5>
                          ${htmlCheckbox}
                        </div>
                      </div>`
                        return htmlElements + "<br/><br/><br/>";
                    }).join(' ');
                    // setting the file path as cookie
                    res.cookie('file', req.file.path, { signed: true, maxAge: 86400000 });
                    res.render('filters', {
                        html: htmlRender
                    })
                }
                else {
                    // if the user uploaded a blank csv file
                    res.render('error', {
                        message: 'Oops...you uploaded an empty file.'
                    });
                }
            });
    }
    else {
        res.render('error', {
            // Eg: .pdf, .docx, etc.
            message: 'Oops...you uploaded the wrong file.'
        });
    }
});

app.post('/post/filters', (req, res) => {
    var data = []
    // getting the file path cookie value.
    if (req.signedCookies.file) {
        fs.createReadStream(req.signedCookies.file)
            .pipe(csvParser())
            .on('data', (row) => {
                data.push(row);
            })
            .on('end', async () => {
                const filterObject = req.body;
                // filtering the data based on the criteria specified by the user.
                const filteredData = data.filter((item) => {
                    return Object.keys(filterObject).every((key) => {
                        if (Array.isArray(filterObject[key])) {
                            return filterObject[key].includes(item[key]);
                        } else {
                            return item[key] === filterObject[key];
                        }
                    });
                });
                if (filteredData.length > 0) {
                    oauth2Client.setCredentials(req.signedCookies.auth);
                    // to create a csv file with the same name.
                    var title = req.signedCookies.file;
                    title = title.replace('uploads/');
                    title = title.split("-")[1]
                    const resource = {
                        properties: {
                            title,
                        },
                    };
                    const service = google.sheets({ version: 'v4', auth: oauth2Client });
                    // creating a blank sheet
                    try {
                        const spreadsheet = await service.spreadsheets.create({
                            resource,
                            fields: 'spreadsheetId',
                        });
                        const spreadsheetId = spreadsheet.data.spreadsheetId;

                        console.log(`Spreadsheet ID: ${spreadsheetId}`);

                        const range = 'Sheet1!A1';
                        const valueInputOption = 'RAW';
                        // extracting the keys
                        const keys = Object.keys(filteredData[0]);
                        // converting objects to arrays
                        const values = [keys, ...filteredData.map(obj => keys.map(key => obj[key]))];
                        const requestBody = {
                            values,
                        };
                        // adding values
                        await service.spreadsheets.values.append({
                            spreadsheetId,
                            range,
                            valueInputOption,
                            requestBody,
                        });

                        // redirecting to the spreadsheet created.
                        res.render('successfulUpload', {
                            redirect: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`
                        });
                    } catch (err) {
                        console.log(err);
                        res.status(500).send("Error creating spreadsheet or adding content.");
                    }
                }
                else {
                    // If no record exists for the filter user specified
                    res.render('error', {
                        message: 'Oops...no record exists for the filter'
                    });
                }
            });
    }
    else {
        //to prevent suspicious behaviour
        res.render('error', {
            message: "Oops...you didn't upload a file!"
        });
    }

});

/* The code `app.use((req, res) => { ... })` is defining a middleware function that will be executed
for any request that does not match any of the defined routes. */
app.use((req, res) => {
    res.status(404);
    res.render('error', {
        message: 'Oops...you have come to wrong place'
    });
});

// serving at the port specified
app.listen(port, () => {
    console.log(`Listening at Port ${port}`);
});



