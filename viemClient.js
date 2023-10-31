import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, localhost } from "viem/chains";

// JSON-RPC Account
//export const [account] = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'
// Local Account

export const viemAccount = privateKeyToAccount(
  "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
);

export const publicClient = createPublicClient({
  chain: localhost,
  transport: http("http://127.0.0.1:8545/"),
});
