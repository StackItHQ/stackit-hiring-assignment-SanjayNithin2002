const express = require('express');
const bodyParser = require('body-parser');
const handlebars = require('express-handlebars').create({
    defaultLayout: "main"
});

const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.engine("handlebars", handlebars.engine);
app.set('view engine', 'handlebars');
app.set('views', './views');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Routes
app.get('/', (req, res) => {
    res.render('index');
});


app.listen(port, () => {
    console.log("Logged In");
});



