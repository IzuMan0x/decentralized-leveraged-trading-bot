//Decided to create two versions of the bot one that will work for both produciton and local network, then one that will only be for production
//To have all the logs saved in a file run the bot with this command:
// node bot.js >> log-file.txt
// node bot.js > log-file.txt ** command will overwrite the log file everytime the bot starts

/* '  ______      _   _          _____             _       ___  ___     
'  | ___ \    | | | |        |_   _|           | |      |  \/  |     
'  | |_/ / ___| |_| |_ ___ _ __| |_ __ __ _  __| | ___  | .  . | ___ 
'  | ___ \/ _ \ __| __/ _ \ '__| | '__/ _` |/ _` |/ _ \ | |\/| |/ _ \
'  | |_/ /  __/ |_| ||  __/ |  | | | | (_| | (_| |  __/_| |  | |  __/
'  \____/ \___|\__|\__\___|_|  \_/_|  \__,_|\__,_|\___(_)_|  |_/\___| */
require("dotenv").config();
//Pyth library for getting price update data
const { EvmPriceServiceConnection } = require("@pythnetwork/pyth-evm-js"); // from "@pythnetwork/pyth-evm-js";
const orderBookData = require("./contract-abi/OrderBook.json");
const pythNetworkAbi = require("./contract-abi/pyth-network-abi.json");
//For local network testing
const { abi: mockPythAbi } = require("./contract-abi/MockPythAbi.json");
const ethers = require("ethers");

//@dev change these values accordingly depending on the deployment environment
//If you are testing on a LOCAL network like hardhat, ganache etc. (not testnet) set this to true so it will interact with the mock contracts
const testingBool = process.env.FOR_LOCAL_DEPLOYMENT;
const maxPriceSlippage = process.env.MAX_PRICE_SLIPPAGE;
const currentTestingPrices = [909, 34000, 0.6, 0.7, 221];
const localNetworkPriceIds = [
  "0x000000000000000000000000000000000000000000000000000000000000abcd",
  "0x0000000000000000000000000000000000000000000000000000000000001234",
  "0x0000000000000000000000000000000000000000000000000000000000004321",
  "0x000000000000000000000000000000000000000000000000000000000000dcba",
  "0x0000000000000000000000000000000000000000000000000000000000009876",
];

//@dev everything is set to run on a testnet
//Pyth
const pythNetwork = {
  address: process.env.PYTH_CONTRACT_ADDRESS, //sepolia contract address
  abi: pythNetworkAbi.abi,
};

//////////////////////////////////////
//Smart Contract Ethers js Instances//
//////////////////////////////////////

//Reading only cannoot make any state changes
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
//For signing transactions on the block chain
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const orderBook = new ethers.Contract(
  process.env.CONTRACT_ADDRESS,
  orderBookData.abi,
  provider
);
const pythContract = new ethers.Contract(
  process.env.PYTH_CONTRACT_ADDRESS,
  pythNetwork.abi,
  provider
);

const orderBookSigner = new ethers.Contract(
  process.env.CONTRACT_ADDRESS,
  orderBookData.abi,
  wallet
);

//////////////////////////////////
//OffChain Pyth Price Feed Setup//
/////////////////////////////////

const pythConnection = new EvmPriceServiceConnection(
  "https://xc-testnet.pyth.network"
); // See Price Service endpoints section below for other endpoints

/// @dev these price feeds id need to be in the same order as the asset's array
/// TODO change this so the price ID's are pulled from the smart contract
//These price ids are for testnet use only
const priceIds = [
  // You can find the ids of prices at https://pyth.network/developers/price-feed-ids#pyth-evm-testnet
  "0xca80ba6dc32e08d06f1aa886011eed1d77c77be9eb761cc10d72b7d0a2fd57a6", // ETH/USD price id on testnet
  "0xf9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b", // BTC/USD price id on testnet
  "0xbfaf7739cb6fe3e1c57a0ac08e1d931e9e6062d476fa57804e165ab572b5b621", // XRP/USD price id on testnet
  "0xd2c2c1f2bba8e0964f9589e060c2ee97f5e19057267ac3284caef3bd50bd2cb5", // MATIC/USD price id on testnet
  "0xecf553770d9b10965f8fb64771e93f5690a182edc32be4a3236e0caaa6e0581a", //BNB/USD price id on testnet
];
let priceFeeds;
//Setting up off chain pyth price feed service
const getPrice = async (priceId) => {
  try {
    // `getLatestPriceFeeds` returns a `PriceFeed` for each price id. It contains all information about a price and has
    // utility functions to get the current and exponentially-weighted moving average price, and other functionality.
    priceFeeds = await pythConnection.getLatestPriceFeeds([priceId]);
    // Get the price if it is not older than 60 seconds from the current time.
    console.log(priceFeeds[0].getPriceNoOlderThan(60)); // Price { conf: '1234', expo: -8, price: '12345678' }
    // Get the exponentially-weighted moving average price if it is not older than 60 seconds from the current time.
    //console.log(priceFeeds[0].getEmaPriceNoOlderThan(60));
    //calculateUserPNL();
    return priceFeeds;
  } catch (error) {
    console.log("Pyth price fee error is: ", error);
    //setTimeout(getPrice, 10000); //Setting the retry time for the price feed to every 10 seconds
  }
};

//openPositions will be an object with a key of userAddress to an array of size 15 which will contain their open trades
// This array is read only... which is causing errors. For now, we read from the contract and replace all the user trades.
const openPositions = {};

//logging trades while bot is running
orderBook.on("TradeOpened", async (userAddress) => {
  /*   console.log(
      "Trade opened by user: ",
      userAddress,
      "@ slot: ",
      openTradesIdForPair,
      "for AssetPair: ",
      pairIndex
    ); */
  console.log("TradeOpened event with data: ", userAddress);

  //returns an array of size 15 with openPositions struct in each
  const allUserOpenPositions = await orderBook.getAllUserOpenTrades(
    userAddress
  );
  console.log(
    "User Position details for user ",
    userAddress,
    "are: ",
    await allUserOpenPositions
  );

  //Since it is read only we replace the whole array with the updated data
  Object.assign(openPositions, {
    [userAddress]: await allUserOpenPositions,
  });

  console.log(`Monitoring trades for user: ${userAddress}.`);
  console.log(
    "After TradeOpened event updated open positions are: ",
    openPositions
  );
});

//On the OrderClose event we will update the user's open trades
orderBook.on("OrderClosed", async (userAddress) => {
  /*  console.log(
    `Order Closed for: ${userAddress}, pairIndex: ${pairIndex}, and tradeSlot: ${userTradeIndex}. List of opened trades updated!`
  ) */
  const userOpenPositionDetails = await orderBook.getAllUserOpenTrades(
    userAddress
  );

  Object.assign(openPositions, {
    [userAddress]: await userOpenPositionDetails,
  });
});

//@dev this will filter through events and build an object of all the currently open trades
let tradeOpenedEventData = [];
const filterOpenTrades = async () => {
  results = await orderBook.queryFilter("TradeOpened");

  tradeOpenedEventData = await results.args;

  console.log("results are: ", results.length);
  //will return userAddress, openTradesIdForPair, pairIndex
  let userAddressArray = [];
  let userAddress;
  let pairIndex;
  let openTradesIdForPair;

  for (i = 0; i < results.length; i++) {
    userAddress = await results[i].args[0];

    //pairIndex = await results[i].args[1];
    //openTradesIdForPair = await results[i].args[2];
    //console.log("Inside Filter function pairIndex is: ", pairIndex);

    const userOpenPositionDetails = await orderBook.getAllUserOpenTrades(
      userAddress
    );
    if (userAddress in openPositions) {
      console.log("user position already recorded: ", userAddress);
      continue;
    } else if (
      userOpenPositionDetails.status == 1 ||
      userOpenPositionDetails != undefined
    ) {
      //we are recording the addresses for positions that already have so we do not double or triple check an address
      //Assuming the object data of openPositions may have old data
      userAddressArray.push(await results[i].args[0]);

      //userAddress = userAddress.toString();
      Object.assign(openPositions, {
        [userAddress]: await userOpenPositionDetails,
      });
    }
  }
  calculateUserPNL();
  /* console.log("End of Filter function openPositions are: ", openPositions);
  for (userAddress in openPositions) {
    console.log(userAddress);
  } */
};
filterOpenTrades();

// for reference the user position details are returned as an array with the following order
// precision is as follows: [1, 1e8, 1e18, 1e6, 1, seconds, 1]
// ***************[pairNumber, openPrice, collateralAfterFee, leverage, longShort, openTime, indexBorrowPercentArray]****************
const calculateUserPNL = async () => {
  //get the value from storage
  let openPrice;
  let collateral;
  let leverage;
  let orderType;
  //May need this for calculation the borrow fee offChain
  let openTime;
  let currentPrice;
  let userPNL;
  console.log("----------Start Calculate User PNL----------");

  //make sure to format the numbers before calculating
  //console.log("open positions inside the calculate function: ", openPositions);
  for (userAddress in openPositions) {
    //....
    console.log("----------calculateUserPNL for loop start ----------");
    //console.log("********userAddress: ", userAddress.length);
    for (i = 0; i < 15; i++) {
      const pairIndex = (i / 3) | 0;
      const openTradesIdForPair = i % 3;
      //user postion details
      const userPositionDetails = openPositions[userAddress][i];
      //may be an array not an object need to check
      if (userPositionDetails[3] == 0) {
        //console.log("leverage is zero");
        //console.log("continuing to the next trading slot");
        /* const blockNumber = await provider.getBlockNumber();
        const blockTime = await provider.getBlock(blockNumber);
        console.log("Current block time is: ", blockTime); */
        continue;
      }

      //for testing we will set the price ourselves
      if (testingBool === "true") {
        currentPrice = currentTestingPrices[pairIndex];
        console.log("from the testing PNL price is: ", currentPrice);
      } else {
        const pythPriceData = await getPrice(priceIds[pairIndex]);
        console.log("price data is this baby:  ", pythPriceData[0].price.price);
        currentPrice = ethers.formatUnits(
          await pythPriceData[0].price.price,
          Math.abs(await pythPriceData[0].price.expo)
        );

        console.log("from the mainnet PNL price is: ", currentPrice);
      }

      //Starting the trade PNL calculations
      leverage = ethers.formatUnits(userPositionDetails[3], 6);
      openPrice = ethers.formatUnits(userPositionDetails[1], 8);
      collateral = ethers.formatEther(userPositionDetails[2]);
      orderType = ethers.formatUnits(userPositionDetails[4], 0);
      console.log(
        `***********position details are: ${openPrice} `,
        userPositionDetails
      );

      if (orderType == 0) {
        //ignoring borrow fee, later we will consider it if there position is green price wise

        userPNL = collateral - (openPrice - currentPrice) * leverage;

        console.log("Made it to the PNL calculation and result is: ", userPNL);
      } else if (orderType == 1) {
        userPNL = collateral - (currentPrice - openPrice) * leverage;
      }

      if (userPNL <= 0) {
        //if there position is negative we will go ahead and liquidate them
        console.log("liquidating user....");
        const liquidateResult = await liquidateUser(
          userAddress,
          pairIndex,
          openTradesIdForPair
        );
        if (liquidateResult == undefined) {
          console.log("unsuccessful Liquidation");
        }
        continue;
      } else if (userPNL > 0) {
        // I made a function to get the user liquidation price which includes the borrow fee after getting the result we can compare it with the current price
        console.log("getting the user liquidation includig borrow fee...");
        console.log("The pair Index is: ", pairIndex);
        let userLiquidationPrice;
        const blockNumber = await provider.getBlockNumber();
        if (blockNumber !== undefined) {
          try {
            console.log("getting user liquidation price");
            userLiquidationPrice = await orderBook.getUserLiquidationPrice(
              userAddress,
              pairIndex,
              openTradesIdForPair
            );
            userLiquidationPrice = ethers.formatEther(userLiquidationPrice[0]);
            console.log(
              `${userAddress} liquidation price is: ${userLiquidationPrice}`
            );
          } catch (error) {
            console.log(error);
            continue;
          }
        }

        if (userLiquidationPrice > currentPrice && orderType == 0) {
          console.log("liquidating user...");
          const liquidateResult = await liquidateUser(
            userAddress,
            pairIndex,
            openTradesIdForPair
          );
          if (liquidateResult == undefined) {
            console.log("unsuccessful Liquidation");
          }
          continue;
        } else if (userLiquidationPrice < currentPrice && orderType == 1) {
          console.log("liquidating user...");
          const liquidateResult = liquidateUser(
            userAddress,
            pairIndex,
            openTradesIdForPair
          );
          if (liquidateResult == undefined) {
            console.log("unsuccessful Liquidation");
          }
          continue;
        }
        console.log(
          `made it to the getting user liquidation price of tade# ${i % 3}: `,
          userLiquidationPrice
        );
        continue;
      }
    }
  }

  //This function will run every 5 seconds checking the PNL of user's trades
  setTimeout(calculateUserPNL, 5000);
};

const liquidateUser = async (userAddress, pairIndex, openTradesIdForPair) => {
  //production
  if (testingBool === "false") {
    const priceFeedUpdateData = await pythConnection
      .getPriceFeedsUpdateData([priceIds[pairIndex]])
      .catch((err) => {
        console.log("Liquidating user failed to get pythUpdateData: ", err);
      });

    const pythUpdateFee = await pythContract
      .getUpdateFee([priceFeedUpdateData])
      .catch((err) => {
        console.log("Failed to retrieve pyth update fee", err);
      });

    const liquidationResultTx = await orderBookSigner
      .liquidateUser(
        userAddress,
        pairIndex,
        openTradesIdForPair,
        priceFeedUpdateData,
        { value: pythUpdateFee }
      )
      .catch((err) => {
        console.log("Error occured while trying to liquidate user: ", err);
      });
    const liquidationResultRx = await liquidationResultTx?.wait(1);

    if ((await liquidationResultRx?.status) == 0) {
      console.log("user liquidation unsuccessful!!");
      return false;
    } else if ((await liquidationResultRx?.status) == 1) {
      //This does not work, just listen to event emitting
      console.log("user liquidated and deleted from openPositions data");
      return true;
    } else {
      console.log("user liquidation unsuccessful!!");
      return false;
    }
  }
  //testing local environment
  if (testingBool === "true") {
    const blockNumber = await provider.getBlockNumber();
    const blockInfo = await provider.getBlock(blockNumber);
    console.log("Current block time is: ", blockInfo.timestamp);
    //manually setting the update parameters
    //In production these will come from the api endpoint or wormhole, but here we create it ourselves
    //dynamically creating the price feed data
    const mockPythArgsArray = [
      localNetworkPriceIds[pairIndex],
      currentTestingPrices[pairIndex] * 1e5,
      10 * 1e5,
      -5,
      currentTestingPrices[pairIndex] * 1e5,
      10 * 1e5,
      blockInfo.timestamp,
    ];

    const mockPythAddress = await orderBook.getPythPriceFeedAddress();
    //console.log("Mock Pyth network address is: ", mockPythAddress);
    //For testing and local environment
    const mockPythContract = new ethers.Contract(
      await mockPythAddress,
      mockPythAbi,
      provider
    );
    const priceFeedUpdateArray =
      await mockPythContract.createPriceFeedUpdateData(...mockPythArgsArray);
    console.log("created pyth update data...");
    //for some reason we get a gas estimation error when doing subsequent liquidations. However, we catch the error and the liquidate function is called again and the user is successfully liquidated
    const liquidationResultTx = await orderBookSigner
      .liquidateUser(
        userAddress,
        pairIndex,
        openTradesIdForPair,
        [priceFeedUpdateArray],
        { value: 1 }
      )
      .catch((err) => {
        console.log("liquidating user error is: ", err);
      });
    const liquidationResultRx = await liquidationResultTx?.wait(1);
    if ((await liquidationResultRx?.status) == 0) {
      console.log("user liquidation unsuccessful!!");
      return false;
    } else if ((await liquidationResultRx?.status) == 1) {
      //no need to update the openPositions object we do that with an event listener
      console.log("user liquidated and deleted from openPositions data");
      return true;
    } else {
      console.log("user liquidation unsuccessful!!");
      return false;
    }
  }
};

/////////////////
// Limit Orders//
/////////////////

//Filtering the event data to find currently open limit orders
const filterOpenLimitOrders = async () => {
  let limitOrderFilterResults = [];
  //This returns an array of events
  limitOrderFilterResults = await orderBook.queryFilter("LimitOrderPlaced");
  console.log("filtering limit order results are", limitOrderFilterResults);

  //const limitOrderFilterArgs = await limitOrderFilterResults.args;

  console.log(
    "filtering limit order results are: ",
    await limitOrderFilterResults?.length
  );
  //will return userAddress, openTradesIdForPair, pairIndex
  let userAddressArray = [];
  let userAddress;
  let pairIndex;
  let limitOrderSlot;

  for (i = 0; i < limitOrderFilterResults.length; i++) {
    userAddress = await limitOrderFilterResults[i].args[0];

    //pairIndex = await limitOrderFilterResults[i].args[1];
    //limitOrderSlot = await limitOrderFilterResults[i].args[2];
    //console.log("Inside Filter function pairIndex is: ", pairIndex);

    const userOpenLimitOrders = await orderBook.getAllUserLimitOrders(
      userAddress
    );
    if (userAddress in userAddressArray) {
      console.log("user position already recorded: ", userAddress);
      continue;
    } else if (
      userOpenLimitOrders.status == 1 ||
      userOpenLimitOrders != undefined
    ) {
      //we are recording the addresses for positions that already have so we do not double or triple check an address
      //Assuming the object data of openPositions may have old data
      userAddressArray.push(await userAddress);

      //userAddress = userAddress.toString();
      Object.assign(openLimitOrders, {
        [userAddress]: await userOpenLimitOrders,
      });
    }
  }
  /* console.log("End of Filter function openPositions are: ", openPositions);
  for (userAddress in openPositions) {
    console.log(userAddress);
  } */
  checkLimitOrders();
};
filterOpenLimitOrders();

let openLimitOrders = {};

//Subscibing to a listener for the LimitOrderPlaced event
orderBook.on("LimitOrderPlaced", async (userAddress) => {
  console.log(`Limit Order placed by ${userAddress}`);
  const userOpenLimitOrdersDetails = await orderBook
    .getAllUserLimitOrders(userAddress)
    .catch((err) => {
      console.log("Error getting user open limit orders");
    });

  Object.assign(openLimitOrders, {
    [userAddress]: await userOpenLimitOrdersDetails,
  });

  console.log(`Limit Order recorded for user: ${userAddress}`);
});

orderBook.on("LimitOrderExecuted", async (userAddress) => {
  console.log(`Limit executed for address: ${userAddress}`);
  const userOpenLimitOrdersDetails = await orderBook
    .getAllUserLimitOrders(userAddress)
    .catch((err) => {
      console.log("Error getting user open limit orders");
    });

  Object.assign(openLimitOrders, {
    [userAddress]: await userOpenLimitOrdersDetails,
  });

  console.log(`Limit Orders updated for: ${userAddress}`);
});

orderBook.on("LimitOrderCanceled", async (userAddress) => {
  console.log(`Limit Order canceled by: ${userAddress}`);
  const userOpenLimitOrdersDetails = await orderBook
    .getAllUserLimitOrders(userAddress)
    .catch((err) => {
      console.log("Error getting user open limit orders");
    });

  Object.assign(openLimitOrders, {
    [userAddress]: await userOpenLimitOrdersDetails,
  });

  console.log(`Limit Orders updated for: ${userAddress}`);
});

///@dev this function executes a limitOrder after the order details have been checked in the checkingLimitOrders function
const executeLimitOrder = async (userAddress, pairIndex, limitOrderSlot) => {
  //checking whether if we are in a testing evironment with Mocks etc.
  if (testingBool === "true") {
    //retrieving the price feed call data from the pyth API
    console.log(pairIndex);
    const priceFeedUpdateData = await pythConnection
      .getPriceFeedsUpdateData([priceIds[pairIndex]])
      .catch((err) => {
        console.log("Limit Order failed to get pythUpdateData: ", err);
      });

    //reading from the pyth smart contract the current update fee
    const pythUpdateFee = await pythContract
      .getUpdateFee([priceFeedUpdateData])
      .catch((err) => {
        console.log("Failed to retrieve pyth update fee", err);
      });

    //executing the limit order with the signer account
    const tx = await orderBookSigner
      .executeLimitOrder(
        userAddress,
        pairIndex,
        limitOrderSlot,
        priceFeedUpdateData,
        { value: await pythUpdateFee }
      )
      .catch((err) => {
        console.log("Executing limit order failed with error: ", err);
      });

    const txR = tx.wait(1);
    if ((await txR?.status) == 0) {
      console.log("user limit order unsuccessful");
      return false;
    } else if ((await txR?.status) == 1) {
      //This worked but ideally want to limit api requests
      //However the way that the data is received from Ethers(smart contract) makes it difficult to modify
      //Spent the whole night trying to make the object writable but all the common methods did not work
      //moved this to the event listeners
      /*    const userOpenLimitOrdersDetails = await orderBook
        .getAllUserLimitOrders(userAddress)
        .catch((err) => {
          console.log("Error getting user open limit orders");
        });

      Object.assign(openLimitOrders, {
        [userAddress]: await userOpenLimitOrdersDetails,
      }); */

      console.log("Limit Order Executed for ", userAddress);
      return true;
    } else {
      console.log("Limit Order Execution unsuccessful!!");
      return false;
    }
  } else {
    const blockNumber = await provider.getBlockNumber();
    const blockInfo = await provider.getBlock(blockNumber);
    //manually setting the update parameters
    //In production these will come from the api endpoint or wormhole, but here we create it ourselves
    const mockPythArgsArray = [
      localNetworkPriceIds[pairIndex],
      currentTestingPrices[pairIndex] * 1e5,
      10 * 1e5,
      -5,
      currentTestingPrices[pairIndex] * 1e5,
      10 * 1e5,
      blockInfo.timestamp,
    ];

    const mockPythAddress = await orderBook.getPythPriceFeedAddress();

    //For testing and local environment
    const mockPythContract = new ethers.Contract(
      await mockPythAddress,
      mockPythAbi,
      provider
    );
    const priceFeedUpdateArray =
      await mockPythContract.createPriceFeedUpdateData(...mockPythArgsArray);
    //console.log("created pyth update data...");

    const tx = await orderBookSigner
      .executeLimitOrder(
        userAddress,
        pairIndex,
        limitOrderSlot,
        [priceFeedUpdateArray],
        { value: 1 }
      )
      .catch((err) => {
        console.log("Executing limit order failed with error: ", err);
      });

    const txR = await tx?.wait(1);
    //console.log("transaction receipt for executing limit order", txR);
    if ((await txR?.status) === 0) {
      console.log("user limit order execution unsuccessful!!");
      return false;
    } else if ((await txR?.status) === 1) {
      //This worked but ideally want to limit api requests
      //However the way that the data is received from Ethers(smart contract) makes it difficult to modify
      //Spent the whole night trying to make the object writable but all the common methods did not work
      //This will be handled in the event listeners
      /* const userOpenLimitOrdersDetails = await orderBook
        .getAllUserLimitOrders(userAddress)
        .catch((err) => {
          console.log("Error getting user open limit orders");
        });

      Object.assign(openLimitOrders, {
        [userAddress]: await userOpenLimitOrdersDetails,
      }); */
      console.log("Limit Order Executed for ", userAddress);
      return true;
    } else {
      console.log("Limit Order Execution unsuccessful!!");
      return false;
    }
  }
};

//@dev this function is set to conitnuously run with a setTimeout
// it will check all the openLimitOrders to see if the currentPrice is close enough to the limit price
// if the currentPrice is close enough to the limitPrice then the bot will execute the limitOrder
const checkLimitOrders = async () => {
  let currentAssetPrice;

  //function for getting the percent price difference of a trading pair
  const currentPriceDifference = (currentPrice, targetPrice) => {
    console.log(currentPrice, targetPrice);
    const topValue = 100 * Math.abs(currentPrice - targetPrice);
    const bottomValue = (currentPrice + Number(targetPrice)) / 2;
    console.log("inside the function top value", topValue);
    console.log("inisde the funciton bottom value", bottomValue);
    const priceDifference = topValue / bottomValue;
    return priceDifference;
  };
  console.log("----------Checking Open Limit Orders----------");
  //This is expected to get huuuuuge
  //console.log("Current open limit orders are: ", openLimitOrders);
  for (userAddress in openLimitOrders) {
    console.log("----------executeLimitOrder for loop start ----------");
    console.log("Current userAddress: ", userAddress);
    //Currently there are 5 trading pairs and an address can have a max of three limitOrder + openTrades for each pair, thus, 15
    for (i = 0; i < 15; i++) {
      // pairIndex represents the asset pair e.x.)  0 = ETH/USD and 1 = BTC/USD... you can verify this with the smart contract
      const pairIndex = (i / 3) | 0;
      // There is an array of sixe 3 for each pair and below is the index for that pair
      const openTradesIdForPair = i % 3;
      //user limit order details which will be a struct of type LimitOrder, check the smart contract for the most updated details
      const userLimitOrderDetails = openLimitOrders[userAddress][i];
      //This checks to see if the slot is empty, here it is checking the targetPrice for the limit order
      if (userLimitOrderDetails[5] == 0) {
        //console.log("limit order target price is zero");
        //console.log("Continuing....");
        continue;
      }
      if (testingBool === "true") {
        console.log("the current price is", currentTestingPrices[pairIndex]);
        currentAssetPrice = currentTestingPrices[pairIndex];
      } else {
        //current price from pyth price feed
        const pythPriceData = await getPrice(priceIds[pairIndex]);
        currentAssetPrice = ethers.formatUnits(
          await pythPriceData[0].price.price,
          Math.abs(await pythPriceData[0].price.expo)
        );
      }
      //Getting the targetPrice for the limitOrder
      const targetPrice = ethers.formatUnits?.(userLimitOrderDetails[5], 8);
      // priceDifference will be the percent price difference
      const priceDifference = currentPriceDifference(
        currentAssetPrice,
        targetPrice
      );
      if (priceDifference < maxPriceSlippage) {
        console.log(
          `Limit order for user address: ${userAddress} is being executed...`
        );
        const result = await executeLimitOrder(
          userAddress,
          pairIndex,
          openTradesIdForPair
        );
        if (result == true) {
          console.log("limit order executed for user: ", userAddress);
          continue;
        } else {
          console.log("limit order execution FAILED for user: ", userAddress);
          continue;
        }
      } else {
        console.log("The price slippage is too high: ", priceDifference);
      }
    }
  }
  setTimeout(checkLimitOrders, 5000);
};
