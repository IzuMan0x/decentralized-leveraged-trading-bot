const fs = require("fs");
require("dotenv").config();
const orderBookData = require("../contract-abi/OrderBook.json");
const ethers = require("ethers");
const {
  uploadQueriedDataToFirebase,
} = require("../firebase/firebase-utils.js");
//Change this depending whether you are on a test-net/main-net or local network
const testingBool = process.env.FOR_LOCAL_DEPLOYMENT;
// File path for writing the query data
const filePath = "trader-data.json";

//Setting up etherjs instance of the contract (read only)
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const orderBook = new ethers.Contract(
  process.env.ORDERBOOK_CONTRACT_ADDRESS,
  orderBookData.abi,
  provider
);

const filterUserTotalTrades = async () => {
  //Counter is just for testing the logic
  let counter = 0;
  let queryResults = [];
  let queriedEventData = {};
  //template for the data

  let queriedEventDataTemplate = {
    address: {
      totalTradeCount: 0,
      collateralSupplied: 0,
      payouts: 0,
    },
  };
  //querying the result by default it starts at 0, but this is not pratical for real deployment
  // for reference there is a block every ~12 seconds on ethereum

  if (testingBool === "true") {
    console.log("We are in local environment");
    // we will query the whole chain
    queryResults = await orderBook.queryFilter("OrderClosed");
    //queriedEventData = queryResults;
    console.log(queryResults);
  } else {
    //for a real blockchain when you are connected to an RPC provider you will be rate limited for how many blocks you can query
    // On ethereum blocks are mined about every 12 seconds
    // 24hrs ~~ is 7200 blocks
    // 7 days ~~ is 50,400 blocks
    const blockRange = 50400; // about 7 days for ethereum this will be different for each chain and is not very accurate

    const endBlock = await provider.getBlockNumber();
    let startBlock = endBlock - blockRange;
    //If the block is negative then just start at zero
    if (startBlock <= 0) {
      startBlock = 0;
    }
    //const blockInfo = await provider.getBlock(blockNumber);
    //console.log("Current block time is: ", blockTime);

    // due to RPC limits on the max block range
    const rpcMaxBlockQuery = 5000;
    for (let i = startBlock; i < endBlock; i += rpcMaxBlockQuery) {
      const _startBlock = i;
      const _endBlock = Math.min(endBlock, i + rpcMaxBlockQuery - 1);
      const events = await orderBook.queryFilter(
        "OrderClosed",
        _startBlock,
        _endBlock
      );
      queryResults = [...queryResults, ...events];
    }
  }

  //digesting the queried data
  for (i = 0; i < queryResults.length; i++) {
    const userAddress = queryResults[i].args[0];
    const collateralAfterFee = queryResults[i].args[1];
    const userPnl = queryResults[i].args[2];
    if (userAddress in queriedEventData) {
      counter++;

      const userEventDetails = {
        totalTradeCount: queriedEventData[userAddress].totalTradeCount + 1,
        collateralSupplied:
          +ethers.formatUnits(collateralAfterFee, 18) +
          queriedEventData[userAddress].collateralAfterFee,
        payouts:
          +ethers.formatUnits(userPnl, 18) +
          queriedEventData[userAddress].payouts,
      };
      console.log(userEventDetails);
      queriedEventData[userAddress] = userEventDetails;
    } else {
      const userEventDetails = {
        totalTradeCount: 1,
        collateralSupplied: +ethers.formatUnits(collateralAfterFee, 18),
        payouts: +ethers.formatUnits(userPnl, 18),
      };

      queriedEventData[userAddress] = userEventDetails;
    }
  }
  console.log(counter);
  console.log("the data is:", queriedEventData);
  // Convert data to JSON string
  const jsonData = JSON.stringify(queriedEventData, null, 2); // The null and 2 arguments for formatting the JSON string (indentation)
  // Write data to the file
  fs.writeFile(filePath, jsonData, "utf8", (err) => {
    if (err) {
      console.error("Error writing to file:", err);
      return;
    }
    console.log("Data has been written to the file.");
  });
};
exports.filterUserTotalTrades = filterUserTotalTrades;
