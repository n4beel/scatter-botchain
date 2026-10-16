// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {Scatter} from "../src/Scatter.sol";

/// Rejects every payment. Stands in for a contract with no payable fallback, which is common
/// enough in any real list of addresses.
contract Rejector {
  receive() external payable {
    revert("nope");
  }
}

/// Burns far more than the 2300-gas stipend on receipt. A smart account doing bookkeeping looks
/// like this, and `transfer` would fail for all of them — which is why Scatter uses `call`.
contract GasHungry {
  uint256[8] private scratch;

  receive() external payable {
    for (uint256 i = 0; i < 8; i++) scratch[i] = block.number + i;
  }
}

/// Tries to be paid twice: on receiving its legitimate payment it calls straight back in with no
/// value, asking to be paid from whatever the contract is holding mid-transaction.
contract Reentrant {
  Scatter private immutable scatter;
  uint256 public entries;
  bool public drained;

  constructor(Scatter scatter_) {
    scatter = scatter_;
  }

  receive() external payable {
    entries++;
    if (entries > 1) return;

    address[] memory recipients = new address[](1);
    recipients[0] = address(this);
    uint256[] memory amounts = new uint256[](1);
    amounts[0] = 1 ether;

    // Swallowed: the point is to observe whether it could have worked, not to fail the outer
    // transaction, which would make the test pass for the wrong reason.
    try scatter.scatter{value: 0}(recipients, amounts) {
      drained = true;
    } catch {}
  }
}

contract ScatterTest is Test {
  Scatter internal scatter;

  address internal alice = address(0xA11CE);
  address internal bob = address(0xB0B);
  address internal carol = address(0xCA201);
  address internal payer = address(0xBEEF);

  event Scattered(address indexed sender, uint256 recipientCount, uint256 total);

  function setUp() public {
    scatter = new Scatter();
    vm.deal(payer, 1000 ether);
  }

  function three() internal view returns (address[] memory r, uint256[] memory a) {
    r = new address[](3);
    r[0] = alice;
    r[1] = bob;
    r[2] = carol;
    a = new uint256[](3);
    a[0] = 1 ether;
    a[1] = 2 ether;
    a[2] = 3 ether;
  }

  // --- the happy path ---------------------------------------------------------------------------

  function test_PaysEveryRecipient() public {
    (address[] memory r, uint256[] memory a) = three();

    vm.prank(payer);
    scatter.scatter{value: 6 ether}(r, a);

    assertEq(alice.balance, 1 ether);
    assertEq(bob.balance, 2 ether);
    assertEq(carol.balance, 3 ether);
  }

  /// The property the whole design protects: nothing is ever left here.
  function test_ContractKeepsNothing() public {
    (address[] memory r, uint256[] memory a) = three();

    vm.prank(payer);
    scatter.scatter{value: 6 ether}(r, a);

    assertEq(address(scatter).balance, 0);
  }

  function test_RefundsTheExcess() public {
    (address[] memory r, uint256[] memory a) = three();
    uint256 before = payer.balance;

    vm.prank(payer);
    scatter.scatter{value: 10 ether}(r, a);

    assertEq(payer.balance, before - 6 ether, "excess was not returned");
    assertEq(address(scatter).balance, 0);
  }

  function test_ExactValueNeedsNoRefund() public {
    (address[] memory r, uint256[] memory a) = three();
    uint256 before = payer.balance;

    vm.prank(payer);
    scatter.scatter{value: 6 ether}(r, a);

    assertEq(payer.balance, before - 6 ether);
  }

  function test_Emits() public {
    (address[] memory r, uint256[] memory a) = three();

    vm.expectEmit(true, false, false, true, address(scatter));
    emit Scattered(payer, 3, 6 ether);

    vm.prank(payer);
    scatter.scatter{value: 6 ether}(r, a);
  }

  function test_PaysSmartAccountsBeyondTheTransferStipend() public {
    GasHungry account = new GasHungry();
    address[] memory r = new address[](1);
    r[0] = address(account);
    uint256[] memory a = new uint256[](1);
    a[0] = 1 ether;

    vm.prank(payer);
    scatter.scatter{value: 1 ether}(r, a);

    assertEq(address(account).balance, 1 ether, "a 2300-gas stipend would have failed here");
  }

  function test_DuplicateRecipientIsPaidTwice() public {
    // Legitimate: a list may name the same address on two lines.
    address[] memory r = new address[](2);
    r[0] = alice;
    r[1] = alice;
    uint256[] memory a = new uint256[](2);
    a[0] = 1 ether;
    a[1] = 2 ether;

    vm.prank(payer);
    scatter.scatter{value: 3 ether}(r, a);

    assertEq(alice.balance, 3 ether);
  }

  // --- all or nothing ---------------------------------------------------------------------------

  /// A half-finished payroll is worse than a failed one: the sender believes it ran, and the only
  /// record of who missed out is a log nobody reads.
  function test_OneRejectingRecipientRevertsEverything() public {
    Rejector rejector = new Rejector();
    address[] memory r = new address[](3);
    r[0] = alice;
    r[1] = address(rejector);
    r[2] = carol;
    uint256[] memory a = new uint256[](3);
    a[0] = 1 ether;
    a[1] = 1 ether;
    a[2] = 1 ether;

    vm.prank(payer);
    vm.expectRevert(
      abi.encodeWithSelector(Scatter.TransferFailed.selector, address(rejector), 1 ether, uint256(1))
    );
    scatter.scatter{value: 3 ether}(r, a);

    assertEq(alice.balance, 0, "alice was paid despite the revert");
    assertEq(carol.balance, 0);
    assertEq(address(scatter).balance, 0);
  }

  // --- reentrancy -------------------------------------------------------------------------------

  /// The drain this contract is shaped to prevent. Every check is against `msg.value`, never the
  /// balance, so a nested call arriving with nothing cannot pay anyone.
  function test_ReentrantRecipientCannotBePaidTwice() public {
    Reentrant attacker = new Reentrant(scatter);

    address[] memory r = new address[](2);
    r[0] = address(attacker);
    r[1] = bob;
    uint256[] memory a = new uint256[](2);
    a[0] = 1 ether;
    a[1] = 5 ether;

    vm.prank(payer);
    scatter.scatter{value: 6 ether}(r, a);

    assertFalse(attacker.drained(), "the reentrant call succeeded");
    assertEq(address(attacker).balance, 1 ether, "attacker took more than its share");
    assertEq(bob.balance, 5 ether, "bob's money was taken");
    assertEq(address(scatter).balance, 0);
  }

  // --- guards -----------------------------------------------------------------------------------

  function test_RevertsOnEmptyList() public {
    vm.expectRevert(Scatter.NoRecipients.selector);
    scatter.scatter{value: 0}(new address[](0), new uint256[](0));
  }

  function test_RevertsOnLengthMismatch() public {
    address[] memory r = new address[](2);
    uint256[] memory a = new uint256[](3);
    vm.expectRevert(abi.encodeWithSelector(Scatter.LengthMismatch.selector, 2, 3));
    scatter.scatter{value: 0}(r, a);
  }

  function test_RevertsOnZeroRecipient() public {
    address[] memory r = new address[](2);
    r[0] = alice;
    r[1] = address(0);
    uint256[] memory a = new uint256[](2);
    a[0] = 1 ether;
    a[1] = 1 ether;

    // Sending to address(0) burns. A mistyped row should not quietly destroy money.
    vm.expectRevert(abi.encodeWithSelector(Scatter.ZeroRecipient.selector, uint256(1)));
    vm.prank(payer);
    scatter.scatter{value: 2 ether}(r, a);
  }

  function test_RevertsOnZeroAmount() public {
    address[] memory r = new address[](2);
    r[0] = alice;
    r[1] = bob;
    uint256[] memory a = new uint256[](2);
    a[0] = 1 ether;
    a[1] = 0;

    vm.expectRevert(abi.encodeWithSelector(Scatter.ZeroAmount.selector, uint256(1)));
    vm.prank(payer);
    scatter.scatter{value: 1 ether}(r, a);
  }

  function test_RevertsWhenValueIsShort() public {
    (address[] memory r, uint256[] memory a) = three();

    vm.expectRevert(abi.encodeWithSelector(Scatter.InsufficientValue.selector, 5 ether, 6 ether));
    vm.prank(payer);
    scatter.scatter{value: 5 ether}(r, a);
  }

  function test_RevertsBeyondTheRecipientCeiling() public {
    address[] memory r = new address[](501);
    uint256[] memory a = new uint256[](501);
    for (uint256 i = 0; i < 501; i++) {
      r[i] = address(uint160(i + 1));
      a[i] = 1;
    }

    vm.expectRevert(abi.encodeWithSelector(Scatter.TooManyRecipients.selector, uint256(501), uint256(500)));
    vm.prank(payer);
    scatter.scatter{value: 501}(r, a);
  }

  /// No `receive`, so BOT cannot be parked here by accident and stranded — this contract has no
  /// way to recover a balance, by design.
  function test_PlainTransfersAreRejected() public {
    vm.prank(payer);
    (bool ok,) = address(scatter).call{value: 1 ether}("");
    assertFalse(ok, "the contract accepted a bare transfer");
    assertEq(address(scatter).balance, 0);
  }

  // --- equal amounts ------------------------------------------------------------------------------

  function test_ScatterEqual() public {
    address[] memory r = new address[](3);
    r[0] = alice;
    r[1] = bob;
    r[2] = carol;

    vm.prank(payer);
    scatter.scatterEqual{value: 3 ether}(r, 1 ether);

    assertEq(alice.balance, 1 ether);
    assertEq(bob.balance, 1 ether);
    assertEq(carol.balance, 1 ether);
    assertEq(address(scatter).balance, 0);
  }

  function test_ScatterEqualRefundsExcess() public {
    address[] memory r = new address[](2);
    r[0] = alice;
    r[1] = bob;
    uint256 before = payer.balance;

    vm.prank(payer);
    scatter.scatterEqual{value: 5 ether}(r, 1 ether);

    assertEq(payer.balance, before - 2 ether);
  }

  function test_ScatterEqualRevertsWhenShort() public {
    address[] memory r = new address[](3);
    r[0] = alice;
    r[1] = bob;
    r[2] = carol;

    vm.expectRevert(abi.encodeWithSelector(Scatter.InsufficientValue.selector, 2 ether, 3 ether));
    vm.prank(payer);
    scatter.scatterEqual{value: 2 ether}(r, 1 ether);
  }

  // --- quoting --------------------------------------------------------------------------------

  function test_TotalOfMatchesWhatIsSpent() public {
    (address[] memory r, uint256[] memory a) = three();
    uint256 quoted = scatter.totalOf(a);
    uint256 before = payer.balance;

    vm.prank(payer);
    scatter.scatter{value: quoted}(r, a);

    assertEq(before - payer.balance, quoted, "the quote did not match the spend");
  }

  // --- gas --------------------------------------------------------------------------------------

  function test_GasScalesSensibly() public {
    uint256 n = 100;
    address[] memory r = new address[](n);
    uint256[] memory a = new uint256[](n);
    for (uint256 i = 0; i < n; i++) {
      r[i] = address(uint160(i + 1000));
      a[i] = 1 ether;
    }

    vm.prank(payer);
    uint256 before = gasleft();
    scatter.scatter{value: n * 1 ether}(r, a);
    uint256 used = before - gasleft();

    emit log_named_uint("scatter(100) gas", used);
    emit log_named_uint("per recipient", used / n);
    // Mostly the 9000-gas cost of funding an untouched account, which no design avoids.
    assertLt(used, 4_000_000, "scatter got much more expensive per recipient");
  }

  // --- properties ---------------------------------------------------------------------------------

  function testFuzz_SpendEqualsTheSumAndNothingIsRetained(uint96 x, uint96 y) public {
    vm.assume(x > 0 && y > 0);

    address[] memory r = new address[](2);
    r[0] = alice;
    r[1] = bob;
    uint256[] memory a = new uint256[](2);
    a[0] = x;
    a[1] = y;

    uint256 total = uint256(x) + uint256(y);
    vm.deal(payer, total + 1 ether);
    uint256 before = payer.balance;

    vm.prank(payer);
    scatter.scatter{value: total + 1 ether}(r, a);

    assertEq(before - payer.balance, total, "spend did not equal the sum");
    assertEq(address(scatter).balance, 0, "value was retained");
  }
}
