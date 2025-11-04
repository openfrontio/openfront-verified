// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Forge script to grant the Openfront contract allowance over an ERC20 wager token.
/// @dev Run with env vars:
///      PRIVATE_KEY        - signer that owns the ERC20 balance
///      PAYMENT_TOKEN      - ERC20 token to approve
///      OPENFRONT_ADDRESS  - Openfront contract that will pull funds
///      ALLOWANCE_AMOUNT   - (optional) allowance amount, defaults to type(uint256).max
contract AddErc20Support is Script {
    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address token = vm.envAddress("PAYMENT_TOKEN");
        address openfront = vm.envAddress("OPENFRONT_ADDRESS");
        uint256 allowance = vm.envOr("ALLOWANCE_AMOUNT", type(uint256).max);

        address owner = vm.addr(privateKey);

        console.log("Preparing ERC20 approval...");
        console.log("Owner", owner);
        console.log("Token", token);
        console.log("Spender (Openfront)", openfront);
        console.log("Allowance", allowance);

        vm.startBroadcast(privateKey);

        IERC20(token).approve(openfront, allowance);

        vm.stopBroadcast();

        uint256 remaining = IERC20(token).allowance(owner, openfront);
        console.log("Approval complete. Current allowance:", remaining);
    }
}
