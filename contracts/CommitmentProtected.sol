// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.9;

import "./ICommitmentProtected.sol";

contract CommitmentProtected is ICommitmentProtected {
  uint256 public constant MIN_COMMITMENT_AGE = 60; // seconds
  // TODO Why expire commitments, given that commitments do not place a global "hold"
  // on a protected value?
  uint256 public constant MAX_COMMITMENT_AGE = 86400; // seconds

  // Hash(recipient address + protected value + secret) => commitment timestamp
  /// @dev Why include a secret in the hashed message? So that an attacker couldn't
  ///   watch commitment transactions and infer whether a commitment was made for
  ///   some protected value they care about, as the basis for then targeting the
  ///   address to try to prevent / delay its protected-value-using transaction 
  ///   long enough for the attacker to front-run.
  mapping(bytes32 => uint256) public commitments;

  /**
   * @notice Validates the prior commitment for a protected value: requires that the 
   * commitment exist, and that its age be in the permitted range. This enforcement
   * is what prevents front-running a transaction that uses the `protectedValue`.
   * An attacker who wanted to front-run would have to prevent `account`'s successful 
   * protected-value-using transaction for at least `MIN_COMMITMENT_AGE` seconds 
   * after the creation of that transaction (which divulges the protected value to the
   * attacker), for the attacker to have enough time to make their own commitment and 
   * successfully use the protected value themselves.
   */
  function _validateCommitment(
    address account,
    bytes32 protectedValue,
    bytes32 secret
  ) internal view {
    bytes32 challenge = makeCommitment(account, protectedValue, secret);
    uint256 commitmentTimestamp = commitments[challenge];
    require(commitmentTimestamp > 0, "Invalid commitment");
    uint256 age = block.timestamp - commitmentTimestamp;
    require(age > MIN_COMMITMENT_AGE, "Commitment not old enough");
    require(age <= MAX_COMMITMENT_AGE, "Commitment too old");
  }

  function commit(bytes32[] calldata _commitments) public {
    for (uint256 i = 0; i < _commitments.length; i++) {
      commitments[_commitments[i]] = block.timestamp;
    }
    emit Committed(msg.sender, _commitments);
  }

  function makeCommitment(
    address account,
    bytes32 protectedValue,
    bytes32 secret
  ) public pure returns (bytes32) {
    return keccak256(abi.encode(account, protectedValue, secret));
  }
}
