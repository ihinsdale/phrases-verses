// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.9;

interface ICommitmentProtected {
  function commit(bytes32[] calldata _commitments) external;

  event Committed(address indexed committer, bytes32[] commitments);
}
