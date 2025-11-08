// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/Openfront.sol";

contract ChangeProtocolFee is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address openfrontAddress = vm.envAddress("OPENFRONT_CONTRACT");
        uint256 newFeeBps = vm.envUint("NEW_FEE_BPS");

        require(newFeeBps <= 10000, "Fee cannot exceed 100% (10000 bps)");

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

