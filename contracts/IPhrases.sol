// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.9;

import "./ICommitmentProtected.sol";

interface IPhrases is ICommitmentProtected {
  function mint(bytes32[] calldata newPhrases, bytes32[] calldata secrets) external;

  function mint(address recipient, bytes32[] calldata newPhrases, bytes32[] calldata secrets)
    external
    returns (uint256[] memory);

  function getContent(uint256 phraseId) external view returns (string memory);

  event PhrasesMinted(
    address indexed recipient,
    uint256 startIdIncl,
    uint256 endIdExcl
  );
}
