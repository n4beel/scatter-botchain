// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/// @title Scatter
/// @notice Pay many addresses native BOT in a single transaction.
///
/// @dev This contract never holds a balance between transactions, and that is the property every
/// decision below protects. It has no `receive`, so BOT cannot be left here by accident; anything
/// sent outside a scatter call reverts rather than becoming unrecoverable.
///
/// **All or nothing.** If any recipient rejects its payment the whole transaction reverts and
/// nobody is paid. The alternative — skip the failures, pay the rest — leaves the sender believing
/// a payroll ran when some of it did not, and the only record of who missed out is a log nobody
/// reads. A reverted transaction costs gas and is obvious; a half-finished payroll is neither.
///
/// **Reentrancy.** A recipient is called with value and can call back in. There is no guard, and
/// none is needed: the only funds this contract can move are the ones supplied by the call moving
/// them, because every path checks `msg.value` rather than `address(this).balance`. A nested call
/// arriving with no value cannot pay anyone, since its own `msg.value` would have to cover it.
/// Using the balance here instead of `msg.value` would turn that into a drain, which is precisely
/// the bug this comment exists to stop someone reintroducing.
contract Scatter {
  /// @param sender Who paid.
  /// @param recipientCount How many addresses were paid.
  /// @param total How much left the sender's account, refund excluded.
  event Scattered(address indexed sender, uint256 recipientCount, uint256 total);

  error NoRecipients();
  error LengthMismatch(uint256 recipients, uint256 amounts);
  error TooManyRecipients(uint256 count, uint256 max);
  error ZeroRecipient(uint256 index);
  error ZeroAmount(uint256 index);
  error InsufficientValue(uint256 sent, uint256 required);
  error TransferFailed(address recipient, uint256 amount, uint256 index);
  error RefundFailed(address sender, uint256 amount);

  /// @dev A ceiling so an oversized list fails with a reason instead of running out of gas
  /// halfway, which looks identical to a bug from the outside. The real limit is the block gas
  /// limit; this is the one that produces a readable error.
  uint256 public constant MAX_RECIPIENTS = 500;

  /// @notice Pay each recipient its own amount.
  /// @dev Any excess `msg.value` is returned. Requiring an exact match instead would make a
  /// rounding difference of one wei cost the sender the whole transaction's gas.
  function scatter(address[] calldata recipients, uint256[] calldata amounts) external payable {
    uint256 count = recipients.length;
    if (count == 0) revert NoRecipients();
    if (count != amounts.length) revert LengthMismatch(count, amounts.length);
    if (count > MAX_RECIPIENTS) revert TooManyRecipients(count, MAX_RECIPIENTS);

    uint256 total;
    for (uint256 i = 0; i < count; i++) {
      if (recipients[i] == address(0)) revert ZeroRecipient(i);
      // A zero row is almost always a mistake in whatever produced the list, and paying it costs
      // gas to move nothing. Failing loudly beats a silent no-op the sender never notices.
      if (amounts[i] == 0) revert ZeroAmount(i);
      total += amounts[i];
    }

    // Against msg.value, never against this contract's balance. See the note on reentrancy.
    if (msg.value < total) revert InsufficientValue(msg.value, total);

    for (uint256 i = 0; i < count; i++) {
      // `call` rather than `transfer`: the 2300-gas stipend fails for any recipient that is a
      // smart account, which on a chain courting agent wallets is most of the interesting ones.
      (bool ok,) = recipients[i].call{value: amounts[i]}("");
      if (!ok) revert TransferFailed(recipients[i], amounts[i], i);
    }

    _refund(total);

    emit Scattered(msg.sender, count, total);
  }

  /// @notice Pay every recipient the same amount.
  /// @dev Not a convenience wrapper over `scatter`: the equal-amount case is the common one and
  /// this spares the caller sending an array of identical numbers, which is calldata they pay for
  /// at 16 gas a byte.
  function scatterEqual(address[] calldata recipients, uint256 amountEach) external payable {
    uint256 count = recipients.length;
    if (count == 0) revert NoRecipients();
    if (count > MAX_RECIPIENTS) revert TooManyRecipients(count, MAX_RECIPIENTS);
    if (amountEach == 0) revert ZeroAmount(0);

    uint256 total = amountEach * count;
    if (msg.value < total) revert InsufficientValue(msg.value, total);

    for (uint256 i = 0; i < count; i++) {
      if (recipients[i] == address(0)) revert ZeroRecipient(i);
      (bool ok,) = recipients[i].call{value: amountEach}("");
      if (!ok) revert TransferFailed(recipients[i], amountEach, i);
    }

    _refund(total);

    emit Scattered(msg.sender, count, total);
  }

  /// @notice What a list will cost, so the UI can show it before asking for a signature.
  function totalOf(uint256[] calldata amounts) external pure returns (uint256 total) {
    for (uint256 i = 0; i < amounts.length; i++) total += amounts[i];
  }

  /// @dev Returns anything over the total. Reverts if the sender will not take it back, rather
  /// than stranding it here — this contract has no way to recover a balance, by design.
  function _refund(uint256 total) private {
    uint256 excess = msg.value - total;
    if (excess == 0) return;

    (bool ok,) = msg.sender.call{value: excess}("");
    if (!ok) revert RefundFailed(msg.sender, excess);
  }
}
