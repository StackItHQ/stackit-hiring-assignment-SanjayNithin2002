const express = require('express');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const multer = require('multer');
const fs = require('fs');
const _ = require('lodash');
const csvParser = require('csv-parser');
var createCsvWriter = require('csv-writer').createObjectCsvWriter;
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

// Middlewares
app.engine("handlebars", handlebars.engine);
app.set('view engine', 'handlebars');
app.set('views', './views');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(morgan('dev'));

// Routes
app.get('/', (req, res) => {
    res.render('index');
});

app.post('/uploadcsv', upload.single('formfile'), (req, res) => {
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
                        const htmlLabel = `<h1>${key}</h1>`;
                        const htmlCheckbox = uniqueElementsObject[key].map(value => `${value}: <input type="checkbox" name=${key} value=${value}>`).join(' ');
                        return htmlLabel + htmlCheckbox;
                    }).join(' ');
                    res.render('filters', {
                        html: htmlRender,
                        path: req.file.path
                    })
                }
                else {
                    res.send('Oops...you uploaded an empty file.')
                }
            });
    }
    else {
        res.send('Oops...you uploaded a wrong file.')
    }
});

app.post('/filter', (req, res) => {
    var data = []
    const path = req.body.file
    fs.createReadStream(req.body.file)
        .pipe(csvParser())
        .on('data', (row) => {
            data.push(row);
        })
        .on('end', () => {
            const filterObject = req.body;
            delete filterObject.file;
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
                const csvWriter = createCsvWriter({
                    path: path,
                    header: Object.keys(filteredData[0]).map((id) => {
                        return {
                            'id': id,
                            'title': id
                        }
                    })
                });
                csvWriter
                    .writeRecords(filteredData)
                    .then(() => res.download(__dirname + `/${path}`))
                    .catch((error) => console.error(error));
            }
            else {
                res.send('Oops...no record exists for the filter')
            }
        });
});

app.use((req, res) => {
    res.status(404);
    res.render('notfound');
});

app.listen(port, () => {
    console.log("Logged In");
});



