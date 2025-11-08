// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/Openfront.sol";

/**
 * @title ChangeProtocolFee
 * @notice Script to update the protocol fee percentage on the Openfront contract.
 * @dev Only callable by the contract owner. Fee is expressed in basis points (0-5000, max 50%).
 * 
 * Usage:
 *   forge script script/ChangeProtocolFee.s.sol \
 *     --rpc-url $RPC_URL \
 *     --broadcast \
 *     --verify
 * 
 * Required environment variables:
 *   PRIVATE_KEY           - Owner's private key
 *   OPENFRONT_CONTRACT    - Deployed Openfront contract address
 *   NEW_FEE_BPS           - New fee in basis points (0-5000, where 5000 = 50% max)
 * 
 * Common fee values:
 *   100 bps  = 1%
 *   250 bps  = 2.5%
 *   500 bps  = 5%
 *   1000 bps = 10%
 *   2000 bps = 20%
 *   5000 bps = 50% (maximum allowed)
 * 
 * Example (set 5% fee):
 *   export PRIVATE_KEY=0x...
 *   export OPENFRONT_CONTRACT=0x343e2663b37A9CFC347e529dC8E97367D09Ee612
 *   export NEW_FEE_BPS=500
 *   forge script script/ChangeProtocolFee.s.sol --rpc-url https://mainnet.base.org --broadcast
 */
contract ChangeProtocolFee is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address openfrontAddress = vm.envAddress("OPENFRONT_CONTRACT");
        uint256 newFeeBps = vm.envUint("NEW_FEE_BPS");

        require(newFeeBps <= 5000, "Fee cannot exceed 50% (5000 bps)");

        Openfront openfront = Openfront(openfrontAddress);

        console.log("Changing protocol fee on Openfront contract...");
        console.log("Contract address:", openfrontAddress);
        console.log("Current fee (bps):", openfront.protocolFeeBps());
        console.log("Current fee (%):", (openfront.protocolFeeBps() * 100) / 10000);
        console.log("New fee (bps):", newFeeBps);
        console.log("New fee (%):", (newFeeBps * 100) / 10000);

        vm.startBroadcast(deployerPrivateKey);

        openfront.setProtocolFee(newFeeBps);

        vm.stopBroadcast();

        console.log("Protocol fee updated successfully!");
        console.log("Confirmed new fee (bps):", openfront.protocolFeeBps());
        console.log("Confirmed new fee (%):", (openfront.protocolFeeBps() * 100) / 10000);
    }
}

