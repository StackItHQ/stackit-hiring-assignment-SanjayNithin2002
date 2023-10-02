const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const multer = require('multer');
const fs = require('fs');
const _ = require('lodash');
const csvParser = require('csv-parser');
const cookieParser = require('cookie-parser');
const handlebars = require('express-handlebars').create({
    defaultLayout: "main"
});

const app = express();
const port = process.env.PORT || 3000;

// Multer Middleware

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "./uploads/");
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + "-" + file.originalname)

    }
});

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

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 1024 * 1024 * 15
    },
    fileFilter: fileFilter
});

//should be stored as env variables.
const oauth2Client = new google.auth.OAuth2(
    process.env.client_id,
    process.env.client_secret,
    process.env.callback_uri
);

const scopes = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/spreadsheets'
];

// Middlewares
app.engine("handlebars", handlebars.engine);
app.set('view engine', 'handlebars');
app.set('views', './views');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(morgan('dev'));
app.use(cookieParser('csvimporter'));

// Routes
app.get('/', (req, res) => {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes
    });
    res.render('login', {
        url: authUrl
    });
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
        res.redirect('/successLogin');
    } catch (error) {
        console.error("Error exchanging authorization code:", error);
        res.status(500).send("Error during authorization.");
    }
});

app.get('/successLogin', (req, res) => {
    res.render('successfulLogin');
})

app.get("/home", (req, res) => {
    res.render('index');
})


app.post('/upload/csv', upload.single('formfile'), (req, res) => {
    if (req.file) {
        var records = []
        fs.createReadStream(req.file.path)
            .pipe(csvParser())
            .on('data', (data) => {
                records.push(data);
            })
            .on('end', () => {
                if (records.length > 0) {
                    const columns = _.keys(records[0]);
                    const extractedArrays = _.map(columns, (prop) => _.map(records, prop));
                    const extractedObject = _.reduce(
                        columns,
                        (result, column, index) => {
                            result[column] = extractedArrays[index];
                            return result;
                        },
                        {}
                    );
                    const uniqueElementsObject = _.reduce(
                        extractedObject,
                        (result, object, index) => {
                            if (_.uniq(object).length <= 10) {
                                result[index] = _.sortBy(_.uniq(object));
                            }
                            return result;
                        }, {}
                    )
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
                    res.cookie('file', req.file.path, { signed: true, maxAge: 86400000 });
                    res.render('filters', {
                        html: htmlRender
                    })
                }
                else {
                    res.render('error', {
                        message: 'Oops...you uploaded an empty file.'
                    });
                }
            });
    }
    else {
        res.render('error', {
            message: 'Oops...you uploaded a wrong file.'
        });
    }
});

app.post('/post/filters', (req, res) => {
    var data = []
    if (req.signedCookies.file) {
        fs.createReadStream(req.signedCookies.file)
            .pipe(csvParser())
            .on('data', (row) => {
                data.push(row);
            })
            .on('end', async () => {
                const filterObject = req.body;
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
                    var title = req.signedCookies.file;
                    title = title.replace('uploads/');
                    title = title.split("-")[1]
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
                        const keys = Object.keys(filteredData[0]);
                        const values = [keys, ...filteredData.map(obj => keys.map(key => obj[key]))];
                        const requestBody = {
                            values,
                        };

                        await service.spreadsheets.values.append({
                            spreadsheetId,
                            range,
                            valueInputOption,
                            requestBody,
                        });

                        res.render('successfulUpload', {
                            redirect: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`
                        });
                    } catch (err) {
                        console.log(err);
                        res.status(500).send("Error creating spreadsheet or adding content.");
                    }
                }
                else {
                    res.render('error', {
                        message: 'Oops...no record exists for the filter'
                    });
                }
            });
    }
    else {
        res.render('error', {
            message: "Oops...you didn't upload a file!"
        });
    }

});

app.use((req, res) => {
    res.status(404);
    res.render('error', {
        message: 'Oops...you have come to wrong place'
    });
});

app.listen(port, () => {
    console.log(`Listening at Port ${port}`);
});



