require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const authroute = require('./routes/authroute')
const fileroute = require('./routes/files')
const trashroute = require('./routes/trash')
const tempShareroute = require('./routes/tempShare')


const app = express();
app.use(bodyParser.json());
app.use(cors());


const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`your app is running with ${port}`));

app.use('/', authroute);
app.use('/drive/', fileroute);
app.use('/trash/', trashroute);
app.use('/share/', tempShareroute);
