// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../test/mocks/MockERC20.sol";

contract DeployMockERC20 is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        string memory name = vm.envOr("MOCK_TOKEN_NAME", string("Fake USD"));
        string memory symbol = vm.envOr("MOCK_TOKEN_SYMBOL", string("fUSD"));
        uint8 decimals = uint8(vm.envOr("MOCK_TOKEN_DECIMALS", uint256(18)));

        vm.startBroadcast(deployerPrivateKey);
        MockERC20 token = new MockERC20(name, symbol, decimals);
        vm.stopBroadcast();

        console2.log("MockERC20 deployed at:", address(token));
        console2.log("name:", token.name());
        console2.log("symbol:", token.symbol());
        console2.log("decimals:", token.decimals());
        console2.log("faucet amount:", token.FAUCET_AMOUNT());
        console2.log("faucet cooldown:", token.FAUCET_COOLDOWN());
    }
}
