const bodyParser = require("body-parser");
const express = require("express");
const traderData = require("./routes/trader-data");

const expressApp = express();

expressApp.use(bodyParser.json());
expressApp.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

expressApp.use("/trader-data", traderData);

expressApp.use((error, req, res, next) => {
  const status = error.status || 500;
  const message = error.message || "Something went wrong.";
  res.status(status).json({ message: message });
});

const port = 8080;
expressApp.listen(8080);
console.log("expressApp is listening at http://localhost:", port);
