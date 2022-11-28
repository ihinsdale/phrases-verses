// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.9;

import "@openzeppelin/contracts/utils/Strings.sol";
import "./ERC721PresetPauserAutoIdUpgradeable.sol";
import "./IPhrases.sol";
import "./IVerses.sol";
import "./CommitmentProtected.sol";
import "./library/SVG721.sol";

contract Verses is
  IVerses,
  CommitmentProtected,
  ERC721PresetPauserAutoIdUpgradeable
{
  using CountersUpgradeable for CountersUpgradeable.Counter;

  bytes32 internal constant PHRASE_ID_EL_KIND = keccak256("PHRASE_ID_EL_KIND");
  bytes32 internal constant VERSE_ID_EL_KIND = keccak256("VERSE_ID_EL_KIND");
  bytes32 internal constant NEW_PHRASE_IDX_EL_KIND =
    keccak256("NEW_PHRASE_IDX_EL_KIND");
  bytes32 internal constant NEW_VERSE_IDX_EL_KIND =
    keccak256("NEW_VERSE_IDX_EL_KIND");

  address public phrases;

  // Verse id => verse
  mapping(uint256 => Verse) private verses;

  // Hash of VerseElement[] => verse id
  mapping(bytes32 => uint256) public verseIds;

  function initialize(
    string memory name,
    string memory symbol,
    string memory baseTokenURI,
    address _phrases
  ) public initializer {
    _initialize(name, symbol, baseTokenURI);

    phrases = _phrases;
  }

  /// @dev We define a custom getter because `verses` is private, because otherwise
  ///   the Solidity compiler complains that `TypeError: Internal or recursive type
  ///   is not allowed for public state variables.`
  function getVerse(uint256 verseId)
    external
    view
    returns (VerseExternal memory)
  {
    Verse storage verse = verses[verseId];
    uint256 elementsSize = verse.size;
    VerseElement[] memory _elements = new VerseElement[](elementsSize);
    for (uint256 i = 0; i < elementsSize; i++) {
      _elements[i] = verse.elements[i];
    }
    uint256 basesSize = verse.bases.size;
    uint256[] memory _baseIds = new uint256[](basesSize);
    for (uint256 j = 0; j < basesSize; j++) {
      _baseIds[j] = verse.bases.verseIds[j];
    }
    return VerseExternal(_elements, _baseIds);
  }

  function commit(
    bytes32[] calldata _phraseCommitments,
    bytes32[] calldata _verseCommitments
  ) public {
    IPhrases(phrases).commit(_phraseCommitments);
    super.commit(_verseCommitments);
  }

  function _mintVerses(
    uint256[] memory _phraseIds,
    NewVerse[] memory _newVerses,
    bytes32[] calldata _secrets
  ) internal {
    require(_newVerses.length == _secrets.length, "Invalid secrets");

    uint256[] memory _verseIds = new uint256[](_newVerses.length);
    uint256 _newVersesStartId = _tokenIdTracker.current();
    uint256 _newVersesEndId = _newVersesStartId;
    for (uint256 i = 0; i < _newVerses.length; i++) {
      NewVerse memory _newVerse = _newVerses[i];
      // We require that `_newVerse.elements.length > 0` so as not to allow an empty verse.
      // Requiring that `_newVerse.elements.length > 1` is less obvious. We don't allow a
      // one-element verse consisting of another verse, as that would allow an infinite number
      // of verses with the same content as the latter verse. We don't allow a one-element
      // verse consisting of a phrase, as such a verse would have the same content as the
      // phrase. In effect, then, this restriction is in the service of uniqueness of content.
      // Of course, for verses there's still no guarantee of the uniqueness of content, as
      // it's possible to generate the same content using more than one composition of phrases
      // and verses. But at least this restriction serves to eliminate "vacuous" duplicates.
      require(_newVerse.elements.length > 1, "Invalid elements");

      bytes32 _unresolvedHash = keccak256(abi.encode(_newVerse.elements));

      for (uint256 j = 0; j < _newVerse.elements.length; j++) {
        NewVerseElement memory _newElement = _newVerse.elements[j];
        if (_newElement.kind == PHRASE_ID_EL_KIND) {
          // We intentionally don't validate here that the phrase id already exists. This enables an
          // interesting kind of verse: the author can pre-commit the verse to using an as-yet-unknown
          // phrase.
        } else if (_newElement.kind == VERSE_ID_EL_KIND) {
          // Likewise here, we don't validate that the verse id already exists. Note that this enables
          // (for verses, whereas not for phrases) circularity, because the future-verse could
          // reference this new verse as one of its elements.
        } else if (_newElement.kind == NEW_PHRASE_IDX_EL_KIND) {
          // Resolve the new-phrase index to its id.
          require(
            _newElement.value < _phraseIds.length,
            "Invalid element value"
          );
          _newElement.kind = PHRASE_ID_EL_KIND;
          _newElement.value = _phraseIds[_newElement.value];
        } else if (_newElement.kind == NEW_VERSE_IDX_EL_KIND) {
          // Resolve the new-verse index to its id. We don't allow an index `>= i and < _newVerses.length`,
          // as the only reason to do so (rather than make the caller order their new verses so that it's
          // unnecessary) would be to make it possible for the caller to achieve *in one call* some desired
          // circular reference between verses -- but we can't support that circularity here, because of how
          // we use hashing to determine whether a verse with identical elements already exists: we can't know
          // the id of the latter-indexed verse without hashing its elements to see if an identical verse already
          // exists, and one of those elements could reference-by-index this new verse (i.e. the one with index `i`),
          // which doesn't have an id yet because we haven't yet resolved all of its elements to verse ids
          // and hashed them to know whether an identical verse already exists.
          require(_newElement.value < i, "Invalid element value");
          _newElement.kind = VERSE_ID_EL_KIND;
          _newElement.value = _verseIds[_newElement.value];
        } else {
          revert("Invalid element kind");
        }
        // At this point, `_newVerse.elements` conforms to the shape of VerseElement[],
        // making it suitable for use in determining whether a verse with the same content
        // already exists.
      }

      bytes32 _resolvedHash = keccak256(abi.encode(_newVerse.elements));
      uint256 _verseId = verseIds[_resolvedHash];
      if (_verseId == 0) {
        _validateCommitment(
          msg.sender,
          // Only the `_unresolvedHash` could have been known to the caller at the time of
          // commitment. So that's what we use in validating that this new verse was
          // previously committed to and therefore isn't a front-running (more precisely, not
          // a front-running in less than `MIN_COMMITMENT_AGE` since the creation of the
          // transaction that revealed the protected value).
          _unresolvedHash,
          _secrets[i]
        );

        // Add verse to storage.

        uint256 _newVerseId = _newVersesEndId;
        _newVersesEndId++;
        _tokenIdTracker.increment();

        Verse storage newVerse = verses[_newVerseId];
        newVerse.size = _newVerse.elements.length;
        for (uint256 k = 0; k < _newVerse.elements.length; k++) {
          NewVerseElement memory _newElement = _newVerse.elements[k];
          // TODO Could remove this to save gas.
          assert(
            _newElement.kind == PHRASE_ID_EL_KIND ||
              _newElement.kind == VERSE_ID_EL_KIND
          );
          newVerse.elements[k] = VerseElement(
            _newElement.kind,
            _newElement.value
          );
        }
        newVerse.bases.size = _newVerse.bases.length;
        for (uint256 m = 0; m < _newVerse.bases.length; m++) {
          NewVerseBase memory _base = _newVerse.bases[m];
          if (_base.kind == VERSE_ID_EL_KIND) {
            // Validate that the base already exists. We can't allow an index >= _newVerseId
            // because that would enable circularity, which is incoherent with a notion of
            // base as some kind of predecessor.
            require(_base.value < _newVerseId, "Invalid base value");

            newVerse.bases.verseIds[m] = _base.value;
          } else if (_base.kind == NEW_VERSE_IDX_EL_KIND) {
            // Likewise, validate that the base already exists.
            require(_base.value < i, "Invalid base value");

            newVerse.bases.verseIds[m] = _verseIds[_base.value];
          } else {
            revert("Invalid base kind");
          }
        }

        verseIds[_resolvedHash] = _newVerseId;
        // Not worth the gas expense to delete the commitment. There's no concern
        // about reuse because verses are unique, so a commitment for a verse
        // can successfully mint only once.

        _safeMint(msg.sender, _newVerseId);

        _verseIds[i] = _newVerseId;
      } else {
        _verseIds[i] = _verseId;
      }
    }

    if (_newVersesStartId < _newVersesEndId) {
      emit VersesMinted(msg.sender, _newVersesStartId, _newVersesEndId);
    }
  }

  /// @dev The `nonReentrant` modifier is indicated due to `_safeMint()`'s use of
  ///   external callbacks (cf. https://www.paradigm.xyz/2021/08/the-dangers-of-surprising-code/).
  function mint(
    bytes32[] calldata newPhrases,
    bytes32[] calldata phraseSecrets,
    NewVerse[] memory newVerses,
    bytes32[] calldata verseSecrets
  ) public nonReentrant {
    _mintVerses(
      IPhrases(phrases).mint(msg.sender, newPhrases, phraseSecrets),
      newVerses,
      verseSecrets
    );
  }

  function getContent(uint256 verseId)
    public
    view
    override
    returns (string memory)
  {
    bytes memory result;
    Verse storage verse = verses[verseId];
    uint256 elementsSize = verse.size;
    for (uint256 i = 0; i < elementsSize; i++) {
      VerseElement memory element = verse.elements[i];
      if (element.kind == PHRASE_ID_EL_KIND) {
        result = abi.encodePacked(
          result,
          IPhrases(phrases).getContent(element.value)
        );
      } else {
        // element.kind == VERSE_ID_EL_KIND
        result = abi.encodePacked(result, getContent(element.value));
      }
    }
    return string(result);
  }

  function tokenURI(uint256 tokenId)
    public
    view
    override
    returns (string memory)
  {
    string memory name = string(
      abi.encodePacked("Verse #", Strings.toString(tokenId))
    );
    string memory description = "A unique verse of phrases and other verses";
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
