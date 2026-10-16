// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Script, console2} from "forge-std/Script.sol";
import {Scatter} from "../src/Scatter.sol";

/// @notice Deploys Scatter and prints the two env lines the frontend needs.
/// @dev Use contracts/deploy.sh rather than calling this directly: it normalises the key, refuses
/// to broadcast against a chain that disagrees with the network named, and verifies the source
/// afterwards.
contract Deploy is Script {
  function run() external {
    uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

    vm.startBroadcast(deployerKey);
    Scatter deployed = new Scatter();
    vm.stopBroadcast();

    console2.log("chain id        ", block.chainid);
    console2.log("Scatter", address(deployed));
    console2.log("");
    console2.log("Add to .env.local:");
    console2.log(
      string.concat(
        "NEXT_PUBLIC_CONTRACT_", vm.toString(block.chainid), "=", vm.toString(address(deployed))
      )
    );
    // Floored at 1, not 0: zero is what the frontend reads as "no deploy block configured", and
    // block.number - 1 is 0 on a chain whose head is block 1, which is every fresh local node.
    uint256 startBlock = block.number > 1 ? block.number - 1 : 1;
    console2.log(
      string.concat(
        "NEXT_PUBLIC_DEPLOY_BLOCK_", vm.toString(block.chainid), "=", vm.toString(startBlock)
      )
    );
  }
}
