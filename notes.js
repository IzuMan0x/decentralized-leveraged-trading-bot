/* const abiCoder = new ethers.AbiCoder();
const decoded = abiCoder.decode(
  "0x51970736e1f2ab379e0a3fc33c8637c48f08ac4a7f955fd0974c77a75005ac28"
);
console.log(decoded); */

const PositionDetailsStruct =
  "tuple(uint256 pairNumber,int256 openPrice,int256 collateralAfterFee,int256 leverage,uint256 longShort,uint256 openTime,uint256 indexBorrowPercentArray)";
