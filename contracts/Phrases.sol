// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.9;

import "@openzeppelin/contracts/utils/Strings.sol";
import "./ERC721PresetPauserAutoIdUpgradeable.sol";
import "./IPhrases.sol";
import "./CommitmentProtected.sol";
import "./library/SVG721.sol";

contract Phrases is
  IPhrases,
  CommitmentProtected,
  ERC721PresetPauserAutoIdUpgradeable
{
  using CountersUpgradeable for CountersUpgradeable.Counter;

  // Phrase id => phrase
  mapping(uint256 => bytes32) public phrases;

  // Phrase => phrase id
  mapping(bytes32 => uint256) public phraseIds;

  function initialize(
    string memory name,
    string memory symbol,
    string memory baseTokenURI
  ) public initializer {
    _initialize(name, symbol, baseTokenURI);
  }

  function _mintPhrases(
    address recipient,
    bytes32[] calldata _phrases,
    bytes32[] calldata _secrets
  ) internal returns (uint256[] memory) {
    require(_phrases.length == _secrets.length, "Invalid secrets");

    uint256[] memory _phraseIds = new uint256[](_phrases.length);
    uint256 _newPhrasesStartId = _tokenIdTracker.current();
    uint256 _newPhrasesEndId = _newPhrasesStartId;
    for (uint256 i = 0; i < _phrases.length; i++) {
      bytes32 _phrase = _phrases[i];
      uint256 _phraseId = phraseIds[_phrase];
      if (_phraseId == 0) {
        _validateCommitment(recipient, _phrase, _secrets[i]);

        // Add phrase to storage.

        uint256 _newPhraseId = _newPhrasesEndId;
        _newPhrasesEndId++;
        _tokenIdTracker.increment();

        phrases[_newPhraseId] = _phrase;
        phraseIds[_phrase] = _newPhraseId;
        // Not worth the gas expense to delete the commitment. There's no concern
        // about reuse because phrases are unique, so a commitment for a phrase
        // can successfully mint only once.

        _safeMint(recipient, _newPhraseId);

        _phraseIds[i] = _newPhraseId;
      } else {
        _phraseIds[i] = _phraseId;
      }
    }

    if (_newPhrasesStartId < _newPhrasesEndId) {
      emit PhrasesMinted(recipient, _newPhrasesStartId, _newPhrasesEndId);
    }

    return _phraseIds;
  }

  function mint(bytes32[] calldata newPhrases, bytes32[] calldata secrets)
    public
  {
    mint(msg.sender, newPhrases, secrets);
  }

  /// @dev The `nonReentrant` modifier is indicated due to `_safeMint()`'s use of
  ///   external callbacks (cf. https://www.paradigm.xyz/2021/08/the-dangers-of-surprising-code/).
  function mint(
    address recipient,
    bytes32[] calldata newPhrases,
    bytes32[] calldata secrets
  ) public nonReentrant returns (uint256[] memory) {
    return _mintPhrases(recipient, newPhrases, secrets);
  }

  /**
   * @dev Cf. https://ethereum.stackexchange.com/a/59335
   */
  function _bytes32ToString(bytes32 _bytes32)
    internal
    pure
    returns (string memory)
  {
    uint8 i = 0;
    while (i < 32 && _bytes32[i] != 0) {
      i++;
    }
    bytes memory bytesArray = new bytes(i);
    for (i = 0; i < 32 && _bytes32[i] != 0; i++) {
      bytesArray[i] = _bytes32[i];
    }
    return string(bytesArray);
  }

  function getContent(uint256 phraseId)
    public
    view
    override
    returns (string memory)
  {
    return _bytes32ToString(phrases[phraseId]);
  }

  function tokenURI(uint256 tokenId)
    public
    view
    override
    returns (string memory)
  {
    string memory name = string(
      abi.encodePacked("Phrase #", Strings.toString(tokenId))
    );
    string memory description = "A unique phrase of 32 bytes";
    // For inclusion in the svg, we want to convert the phrase from bytes32 to string type
    // so that the zero-byte padding of the bytes32 is removed.
    string memory content = getContent(tokenId);
    string memory svg = string(
      abi.encodePacked(
        '<svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMinYMin meet" viewBox="0 0 350 350"><style>.base { fill: black; font-family: serif; font-size: 14px; }</style><rect width="100%" height="100%" fill="white" /><text x="10" y="20" class="base">',
        content,
        "</text></svg>"
      )
    );

    return SVG721.metadata(name, description, svg);
  }
}
