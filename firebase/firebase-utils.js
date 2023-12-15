const fs = require("fs");

// File path
const filePath = "trader-data.json";

// Import the functions you need from the SDKs you need
const { initializeApp } = require("firebase/app");
const { getDatabase, ref, set, update } = require("firebase/database");
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBehsXijQJKUA2GXzaJv1HpDGXUMVhd2ow",
  authDomain: "bettertrade-standings.firebaseapp.com",
  projectId: "bettertrade-standings",
  storageBucket: "bettertrade-standings.appspot.com",
  messagingSenderId: "348051431739",
  appId: "1:348051431739:web:920d9882b40f469448171e",
  measurementId: "G-T63LXH8FD7",
  databaseURL:
    "https://bettertrade-standings-default-rtdb.asia-southeast1.firebasedatabase.app/",
};

// Initialize Firebase
let _app;
let _database;
const initFirebase = () => {
  if (_app) {
    console.log("firebase database has already been initialized");
    return;
  }

  _app = initializeApp(firebaseConfig);
  _database = getDatabase(_app);
};

//Getter function so we can use the instance of the database in other parts of the application
const getDatabaseInstance = () => {
  if (!_app) {
    console.log("initializing firebase!!");
    initFirebase();
  }
  return _database;
};

//Getter for firebase app;
const getAppInstance = () => {
  if (!_app) {
    console.log("initializing firebase!!");
    initFirebase();
  }
  return _app;
};

function writeUserData(data) {
  const db = getDatabaseInstance();
  //set(ref(db, "standings/"), data)
  update(ref(db, "standings/"), data);
}

const uploadQueriedDataToFirebase = () => {
  // Read data from the file
  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      console.error("Error reading file:", err);
      return;
    }

    try {
      // Parse the JSON data
      const jsonData = JSON.parse(data);

      // Now you have the JSON data as a JavaScript object
      console.log("Data read from the file:", jsonData);
      writeUserData(jsonData);
    } catch (parseError) {
      console.error("Error parsing JSON:", parseError);
    }
  });
};

//exports
exports.getAppInstance = getAppInstance;
exports.getDatabaseInstance = getDatabase;
exports.initFirebase = initFirebase;
exports.uploadQueriedDataToFirebase = uploadQueriedDataToFirebase;
