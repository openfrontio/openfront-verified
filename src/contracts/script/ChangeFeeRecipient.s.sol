// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/Openfront.sol";

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

