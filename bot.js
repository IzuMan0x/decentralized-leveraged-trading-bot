require("dotenv").config();
const { EvmPriceServiceConnection } = require("@pythnetwork/pyth-evm-js"); // from "@pythnetwork/pyth-evm-js";
const orderBookData = require("./OrderBook.json");
const ethers = require("ethers");
const { AbiCoder } = require("ethers");

//kind of works
//check this out later
//decoding the user position details

/* const abiCoder = new AbiCoder();

const data =
  "0xe058aa115a7d709dc6e05f8e619a174f45359910501e0fcb4abd94817caf2b56000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

const decodedData = abiCoder.decode(
  [
    "tuple(uint256 pairNumber,int256 openPrice,int256 collateralAfterFee,int256 leverage,uint256 longShort,uint256 openTime,uint256 indexBorrowPercentArray)",
  ],
  data,
  true
);
console.log(decodedData); */

//////////////////////////////////
//OffChain Pyth Price Feed Setup//
/////////////////////////////////

const connection = new EvmPriceServiceConnection(
  "https://xc-testnet.pyth.network"
); // See Price Service endpoints section below for other endpoints

const priceIds = [
  // You can find the ids of prices at https://pyth.network/developers/price-feed-ids#pyth-evm-testnet
  "0xf9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b", // BTC/USD price id in testnet
  "0xca80ba6dc32e08d06f1aa886011eed1d77c77be9eb761cc10d72b7d0a2fd57a6", // ETH/USD price id in testnet
];

const getPrice = async () => {
  // `getLatestPriceFeeds` returns a `PriceFeed` for each price id. It contains all information about a price and has
  // utility functions to get the current and exponentially-weighted moving average price, and other functionality.
  const priceFeeds = await connection.getLatestPriceFeeds(priceIds);
  // Get the price if it is not older than 60 seconds from the current time.
  console.log(priceFeeds[0].getPriceNoOlderThan(60)); // Price { conf: '1234', expo: -8, price: '12345678' }
  // Get the exponentially-weighted moving average price if it is not older than 60 seconds from the current time.
  console.log(priceFeeds[1].getEmaPriceNoOlderThan(60));
};
getPrice();

const positionDetailsTemplate = {
  "user-trade-index": 1,
  "pair-index": 1,
  "open-price": 1,
  "collateral-after-fee": 1,
  "trade-leverage": 1,
  "long-short": 1,
  "open-time": 1,
  "index-borrow-percent-array": 1,
};
const openPositions = {
  "user-address": {
    pairIndex: [positionDetailsTemplate],
  },
};
const tradeCapPerPair = 3;

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

const orderBook = new ethers.Contract(
  process.env.CONTRACT_ADDRESS,
  orderBookData.abi,
  provider
);

//logging trades while bot is running
//need to change the event data
orderBook.on(
  "TradeOpened",
  async (userAddress, openTradesIdForPair, pairIndex) => {
    console.log(
      "Trade opened by user: ",
      userAddress,
      "@ slot: ",
      openTradesIdForPair,
      "for AssetPair: ",
      pairIndex
    );
    const userPositionDetails = await orderBook.getUserTradingPositionDetails(
      userAddress,
      pairIndex,
      openTradesIdForPair
    );
    console.log(
      "User Position details for user ",
      userAddress,
      "are: ",
      userPositionDetails
    );
    openPositions.userAddress.pairIndex.openTradesIdForPair.push(
      userPositionDetails
    );
    console.log(
      `Monitoring trade @ ${userAddress}.${pairIndex}.${openTradesIdForPair}.`
    );

    /*  const userLiquidationPrice = await orderBook.getUserLiquidationPrice(
      userAddress
    ); */
    //console.log("Liquidation price is: ", userAddress);
  }
);

//catching up on currently open trades before bot started running
// should only be run once on startup
const filter = async () => {
  results = await orderBook.queryFilter("TradeOpened");

  console.log("filter Results are: ", results[0].args[0]);
  //The third argument is the hashed data struct of the position details... how to read??
  //will return userAddress, openTradesIdForPair, pairIndex
  for (i = 0; i < results.length; i++) {
    for (index = 0; index < 3; index++) {
      console.log(`user trade opened details: ${results[i].args[index]}`);
      console.log("----------------------------------");
    }
    //need to see what format the event is recorded as
  }
};
filter();

//Caluclating user PNL
// list of available trading pairs
const assetsArray = [0, 1, 2, 3, 4];
// list of price feed Id's for the available trading pairs
const pythPriceFeedIdArray = priceIds;
const calculateUserPNL = async () => {
  //get the value from storage
  let openPrice;
  let collateral;
  let leverage;
  let orderType;
  let openTime;
  let currentPrice;
  let userPNL;
  //get the price from pyth
  //make sure to format the numbers before calculating
  for (userAddress in openPositions) {
    //....
    for (i = 0; i < assetsArray.length(); i++) {
      //currently the trade cap is 3
      for (index = 0; index < tradeCapPerPair; index++) {
        const userPositionDetails = userAddress[`${assetsArray[i]}`][index];
        //if the openPrice is zero then go to the next iteration
        if (userPositionDetails.openPrice == 0) {
          continue;
        }
        if (orderType == 0) {
          //ignoring borrow fee
          userPNL =
            collateral - ((openPrice - currentPrice) / openPrice) * leverage;
        } else if (orderType == 1) {
          userPNL =
            collateral - ((currentPrice - openPrice) / openPrice) * leverage;
        }

        if (userPNL < 0) {
          const liquidateResult = await orderBook.liquidateUser(
            userAddress,
            pairIndex,
            openTradesIdForPair,
            ptyhPriceFeedUpdateData
          );
        } else {
          //including borrow fee
          //currently there is not an easy way to the get the borrow fee
          // I made a function to get the user liquidation price which includes the borrow fee after getting the result we can compare it with the current price
          let borrowFee;
          userPNL = userPNL - borrowFee;
        }

        if (userPNL < 0) {
          const liquidateResult = await orderBook.liquidateUser(
            userAddress,
            pairIndex,
            openTradesIdForPair,
            ptyhPriceFeedUpdateData
          );
        } else {
          //go to the next position/user in the array
          continue;
        }
      }
    }
  }
};

const getTotalLongs = async () => {
  const totalLongs = await orderBook.getTotalLongAmount(0);
  console.log("total amount of longs are: ", ethers.formatEther(totalLongs));
};
getTotalLongs();

const getUserTradesForPair = async () => {
  const pairEthTrades = await orderBook.getUserOpenTradesForAsset(
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    0
  );
  console.log(pairEthTrades);
  const timestamp = (await provider.getBlock(await provider.getBlockNumber()))
    .timestamp;
  console.log("current time: ", timestamp);
};
getUserTradesForPair();

const getUserTradingPositionDetails = async () => {
  const userAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const userTradePositionDetails =
    await orderBook.getUserTradingPositionDetails(userAddress, 0, 4);
  console.log(userTradePositionDetails);
};
getUserTradingPositionDetails();

orderBook.on(
  "OrderClosed",
  async (userAddress, userPairTradeIndex, userPNL) => {
    console.log("Trade closed by user: ", userAddress);
    console.log("User trade index is: ", userPairTradeIndex);
    console.log("User PNL is: ", formatUnits(userPNL, 18));
  }
);
