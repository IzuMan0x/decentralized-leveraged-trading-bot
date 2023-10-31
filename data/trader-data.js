const fs = require("node:fs/promises");

async function readData() {
  const data = await fs.readFile("data.json", "utf8");
  return JSON.parse(data);
}

async function getAll() {
  const storedData = await readData();
  if (!storedData.address) {
    throw new NotFoundError("Could not find any trading data.");
  }
  return storedData;
}

exports.getAll = getAll;
