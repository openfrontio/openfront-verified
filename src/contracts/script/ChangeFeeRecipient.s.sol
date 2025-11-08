// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/Openfront.sol";

/**
 * @title ChangeFeeRecipient
 * @notice Script to update the protocol fee recipient address on the Openfront contract.
 * @dev Only callable by the contract owner.
 * 
 * Usage:
 *   forge script script/ChangeFeeRecipient.s.sol \
 *     --rpc-url $RPC_URL \
 *     --broadcast \
 *     --verify
 * 
 * Required environment variables:
 *   PRIVATE_KEY           - Owner's private key
 *   OPENFRONT_CONTRACT    - Deployed Openfront contract address
 *   NEW_FEE_RECIPIENT     - New address to receive protocol fees
 * 
 * Example:
 *   export PRIVATE_KEY=0x...
 *   export OPENFRONT_CONTRACT=0x343e2663b37A9CFC347e529dC8E97367D09Ee612
 *   export NEW_FEE_RECIPIENT=0x1234567890123456789012345678901234567890
 *   forge script script/ChangeFeeRecipient.s.sol --rpc-url https://mainnet.base.org --broadcast
 */
contract ChangeFeeRecipient is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address openfrontAddress = vm.envAddress("OPENFRONT_CONTRACT");
        address newRecipient = vm.envAddress("NEW_FEE_RECIPIENT");

        Openfront openfront = Openfront(openfrontAddress);

        console.log("Changing fee recipient on Openfront contract...");
        console.log("Contract address:", openfrontAddress);
        console.log("Current fee recipient:", openfront.feeRecipient());
        console.log("New fee recipient:", newRecipient);

        vm.startBroadcast(deployerPrivateKey);

        openfront.setFeeRecipient(newRecipient);

        vm.stopBroadcast();

        console.log("Fee recipient updated successfully!");
        console.log("Confirmed new recipient:", openfront.feeRecipient());
    }
}

