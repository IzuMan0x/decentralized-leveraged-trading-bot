const express = require("express");
const { getAll } = require("../data/trader-data");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const standings = await getAll();
    setTimeout(() => {
      res.json({ standings: standings });
    }, 1500);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
